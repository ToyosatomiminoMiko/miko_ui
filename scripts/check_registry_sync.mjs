#!/usr/bin/env node
/**
 * 核对 **npm 上发布的版本** 与 **本地仓库这份代码** 是不是同一份东西.
 *
 * 为什么需要它:走 token 路线发布时 npm 上**没有 provenance 签名**,也就是说不存在
 * 任何密码学证据能把"某个 npm 版本"与"某个 git commit"绑起来.那就只能自己比对:
 * 把线上 tarball 拉下来,跟本地重新打包的产物逐文件比内容.
 *
 * 三道检查,从强到弱:
 *
 * 1. **整包哈希**(最快也最强):本地 `npm pack` 算出的 integrity 与 registry 记录的
 *    `dist.integrity` 逐位比对.实测 npm 打包是**确定的**(同一份代码连打两次哈希
 *    相同、tarball 内 mtime 被归一化到 1985-10-26),所以哈希不同 = 内容一定不同.
 * 2. **逐文件哈希**(哈希不同时才有信息量):解包线上 tarball,逐文件比 sha256,直接
 *    告诉你"哪几个文件不一样".
 * 3. **git 侧对应关系**:工作区是否干净、HEAD 是否正好被打上 `v<版本>` 的 tag.前两道
 *    只证明"npm == 我本地这份文件",这一道才把它接到"GitHub 上的哪个提交".
 *
 * 用法:
 *   node scripts/check_registry_sync.mjs            # 检查 package.json 当前的版本
 *   node scripts/check_registry_sync.mjs 0.1.0      # 检查指定版本
 *
 * 退出码:0 = 完全同步;1 = 有差异(或该版本还没发布).
 *
 * 现实提醒:**改 README、改注释也要发新版本才会同步到 npm** —— 线上那份是发布那一刻
 * 的快照,本地再改多少都不会自动跟过去.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = 'https://registry.npmjs.org';
/** 临时目录放在 node_modules 下:一定可写,而且本来就被 gitignore. */
const TMP = path.join(ROOT, 'node_modules', '.registry-sync');

/** 跑一条命令返回 stdout;cwd 固定为包根. */
function run(cmd, args, opts = {}) {
    return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', ...opts });
}

function sha256(file) {
    return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/** 递归收集目录下的所有文件,返回绝对路径. */
async function walk(dir) {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...(await walk(full)));
        else out.push(full);
    }
    return out;
}

const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
const version = process.argv[2] ?? pkg.version;
const { name } = pkg;

let failed = false;
const fail = (msg) => {
    failed = true;
    console.log(`  ✗ ${msg}`);
};
const ok = (msg) => console.log(`  ✓ ${msg}`);

console.log(`registry 同步检查:${name}@${version}\n`);

// ── registry 元数据 ──────────────────────────────────────────────────
let published;
try {
    const res = await fetch(`${REGISTRY}/${name}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const meta = await res.json();
    published = meta.versions?.[version];
    if (!published) {
        const all = Object.keys(meta.versions ?? {}).join(', ') || '(无)';
        console.log(`npm 上没有 ${name}@${version}。已发布的版本:${all}`);
        process.exit(1);
    }
} catch (err) {
    console.error(`拉取 registry 元数据失败:${err.message}`);
    process.exit(1);
}

const remoteIntegrity = published.dist?.integrity;
const remoteTarball = published.dist?.tarball;

// ── 本地重新构建 + 打包 ──────────────────────────────────────────────
console.log('本地重新构建并打包…');
run('npm', ['run', 'build'], { stdio: 'pipe' });
/**
 * `--ignore-scripts` 在 npm 10 里挡不住 `prepack`,构建脚本会往 stdout 打日志,
 * 于是 JSON 前面混着人话 —— 从第一个 `[` 开始截.
 */
const packRaw = run('npm', ['pack', '--dry-run', '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
const packed = JSON.parse(packRaw.slice(packRaw.indexOf('[')))[0];

console.log(`  本地:${packed.files.length} 个文件,integrity ${packed.integrity.slice(0, 26)}…`);
console.log(`  线上:integrity ${remoteIntegrity?.slice(0, 26)}…\n`);

console.log('【1】整包哈希');
const wholeMatch = packed.integrity === remoteIntegrity;
if (wholeMatch) ok('逐字节一致 —— 本地这份代码重新打包,与 npm 上那一版完全相同');
else console.log('  · 整包哈希不同,做逐文件比对(打包字节受 npm 版本影响,不单独作为失败依据)');

// ── 逐文件比对 ───────────────────────────────────────────────────────
if (!wholeMatch) {
    console.log('\n【2】逐文件内容');
    await rm(TMP, { recursive: true, force: true });
    await mkdir(TMP, { recursive: true });
    const tgz = path.join(TMP, 'published.tgz');
    const unpacked = path.join(TMP, 'unpacked');
    try {
        const res = await fetch(remoteTarball);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await writeFile(tgz, Buffer.from(await res.arrayBuffer()));
        await mkdir(unpacked, { recursive: true });
        run('tar', ['-xzf', tgz, '-C', unpacked]);

        const pubRoot = path.join(unpacked, 'package');
        const localExpected = new Set(packed.files.map((f) => f.path));
        let same = 0;
        const problems = [];
        for (const full of await walk(pubRoot)) {
            const rel = path.relative(pubRoot, full);
            const localPath = path.join(ROOT, rel);
            if (!existsSync(localPath)) problems.push(`本地不存在:${rel}`);
            else if (sha256(localPath) !== sha256(full)) problems.push(`内容不同:${rel}`);
            else same += 1;
            localExpected.delete(rel);
        }
        for (const missing of localExpected) problems.push(`线上没有(本地待发里多出):${missing}`);

        console.log(`  逐文件相同:${same} 个`);
        if (problems.length === 0) {
            ok('逐文件内容全部一致 —— 内容已同步,只是打包字节不同(通常是 npm 版本差异)');
        } else {
            for (const p of problems) fail(p);
        }
    } catch (err) {
        fail(`逐文件比对失败:${err.message}`);
    }
    await rm(TMP, { recursive: true, force: true });
}

// ── git 侧:把"本地这份"接到"GitHub 上的提交" ──────────────────────────
console.log('\n【3】git 对应关系');
const dirty = run('git', ['status', '--porcelain']).trim();
const tag = `v${version}`;
const tagsAtHead = run('git', ['tag', '--points-at', 'HEAD']).trim().split('\n').filter(Boolean);
const tagExists = run('git', ['tag', '-l', tag]).trim() === tag;

if (dirty) fail(`工作区不干净(${dirty.split('\n').length} 个文件未提交)—— npm 上这一版的源码在 GitHub 上不存在`);
else ok('工作区干净');

if (tagsAtHead.includes(tag)) ok(`HEAD 正好在 tag ${tag} 上`);
else if (tagExists) fail(`tag ${tag} 存在,但 HEAD 不在它上面`);
else fail(`仓库里没有 tag ${tag} —— 这一版在 git 里没有可追溯的对应提交`);

console.log(failed ? '\n结论:两边**没有**完全同步(见上面的 ✗)' : '\n结论:两边完全同步 ✓');
process.exit(failed ? 1 : 0);
