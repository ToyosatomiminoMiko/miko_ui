/**
 * 一键把一版发到 npm:算版本号 -> 本地过闸门 -> 提交 -> 推 main -> 打 tag -> 推 tag.
 *
 * 用法:
 *     npm run release:npm -- patch           # 0.1.2 -> 0.1.3(修 bug)
 *     npm run release:npm -- minor           # 0.1.2 -> 0.2.0(加功能)
 *     npm run release:npm -- major           # 0.1.2 -> 1.0.0(破坏性改动)
 *     npm run release:npm -- 0.4.2           # 显式指定版本号
 *     npm run release:npm -- patch --dry-run # 只检查,只打印计划,一个文件都不动
 *     npm run release:npm -- patch --skip-gate  # 跳过本地闸门(靠 CI 兜)
 *     npm run release:npm -- patch --yes     # 不问"确认吗",直接做(非交互环境必需)
 *
 * 按顺序做这些,任一步失败都当场停下.在动 git 之前失败的话,版本号的改动会被还原,
 * 工作树回到你运行它之前的样子:
 *
 *   1. 前置检查:在 main 上,工作树干净,与 origin/main 一致;
 *   2. 目标检查:npm 上没发过这个版本,本地与远端都没有同名 tag;
 *   3. 在**内存里**渲染出新的 `package.json` / `package-lock.json`,并断言"只有
 *      version 那几行变了"(见下面 diffLines 的说明),然后才落盘;
 *   4. 跑本地完整闸门 `npm run build`(= build:dist -> typecheck -> 边界守卫 -> vitest);
 *   5. `git commit` + `git push origin main` -- 这一步只更新滚动资产(链路 A);
 *   6. `git tag v<version>` + `git push origin v<version>` -- 这一步才发 npm(链路 B).
 *
 * 为什么版本号必须**两个文件一起改**:
 *   `package-lock.json` 里也有版本号(顶层一个,`packages[""]` 里一个),而 `npm ci`
 *   会校验锁与清单是否一致.手改了 `package.json` 却忘了锁,失败会出现在一个看不出
 *   关联的地方(CI 的 `npm ci`).
 *
 * 为什么**不用 `npm version` 命令**:
 *   它在改完 `package.json` 后会顺手重建 `package-lock.json`(走
 *   `--package-lock-only`).`ci.yml` 顶部第 3 条记着这件事的后果:那样重算出来的锁
 *   只按**当前平台**解析,会丢掉跨平台可选依赖(`lightningcss-*`,
 *   `@rolldown/binding-*` 那一批),随后 CI 的 `npm ci` 直接 EUSAGE.所以这里只做
 *   "解析 -> 只改版本字段 -> 原样序列化回去",再用行级 diff 断言没有别的东西被改动.
 *   (实测:本仓库的 `package-lock.json` 经过这个来回是字节级一致的;
 *   `package.json` 末尾没有换行,序列化时会保持它原本的样子,不引入无关 diff.)
 *
 * 为什么要先生成 tag 再推,而不是反过来:
 *   tag 推上去之后,`release.yml` 的 publish job 会在 CI 里再跑同一条闸门.在那里
 *   失败的意思是"tag 已经推出去了,但这一版没发成",得删 tag 才能重来.本地先跑
 *   一遍,失败时连 commit 都还没产生.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 本仓库根 = `scripts/` 的上一层. */
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PKG_PATH = join(ROOT, 'package.json');
const LOCK_PATH = join(ROOT, 'package-lock.json');

const log = (msg) => console.log(`[RELEASE] ${msg}`);
const die = (msg) => {
    console.error(`[RELEASE][ERROR] ${msg}`);
    process.exit(1);
};

/** 跑一条命令,原样把输出接到终端(闸门要用,得让人看见测试结果). */
function run(cmd, args) {
    execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
}

/** 跑一条命令并拿到去掉首尾空白的 stdout.失败就抛. */
function capture(cmd, args) {
    return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

/** 同上,但失败时返回空串(只用于"存在吗"这类探测). */
function probe(cmd, args) {
    try {
        return capture(cmd, args);
    } catch {
        return '';
    }
}

/* ------------------------------------------------------------------ 参数 */

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
for (const f of flags) {
    if (!['--dry-run', '--skip-gate', '--yes'].includes(f)) die(`不认识的开关: ${f}`);
}
const positional = argv.filter((a) => !a.startsWith('--'));
const dryRun = flags.has('--dry-run');
const skipGate = flags.has('--skip-gate');
const assumeYes = flags.has('--yes');

const kind = positional[0];
if (!kind) {
    die(
        '用法: npm run release:npm -- patch|minor|major|<x.y.z> [--dry-run] [--skip-gate] [--yes]',
    );
}
if (positional.length > 1) die(`只接受一个参数,多了: ${positional.slice(1).join(' ')}`);

/* ------------------------------------------------------------ 版本号计算 */

const parseSemver = (value) => {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(value ?? '').trim());
    return m ? m.slice(1).map(Number) : null;
};

const compareSemver = (a, b) => {
    for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
};

function nextVersion(current, requested) {
    const cur = parseSemver(current);
    if (!cur) die(`package.json 里的 version 不是 x.y.z 形式: ${JSON.stringify(current)}`);

    if (requested === 'major') return `${cur[0] + 1}.0.0`;
    if (requested === 'minor') return `${cur[0]}.${cur[1] + 1}.0`;
    if (requested === 'patch') return `${cur[0]}.${cur[1]}.${cur[2] + 1}`;

    const explicit = parseSemver(requested);
    if (!explicit) die(`版本号参数只能是 major/minor/patch 或 x.y.z,收到: ${requested}`);
    if (compareSemver(explicit, cur) <= 0) {
        die(`新版本号必须大于当前版本: ${requested} 不比 ${current} 大`);
    }
    return requested;
}

/* -------------------------------------------------- 文件渲染(先内存后落盘) */

/**
 * 按原文件的换行习惯序列化回去:`package.json` 末尾没有换行,别给它加一个 -- 那会
 * 变成一行与本次发布无关的 diff.
 */
function serializeLike(original, obj) {
    return JSON.stringify(obj, null, 2) + (original.endsWith('\n') ? '\n' : '');
}

/**
 * 逐行比较,返回有差异的行.用来断言"这次改动只碰到版本号":如果 JSON 重新序列化
 * 顺手改了别处的格式(缩进,键序,转义),这里就会暴露出来并中止发布,而不是把一份
 * 被格式重排过的锁文件提交上去.
 */
function diffLines(before, after) {
    const a = before.split('\n');
    const b = after.split('\n');
    const out = [];
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
        if (a[i] !== b[i]) out.push({ line: i + 1, from: a[i], to: b[i] });
    }
    return out;
}

const isVersionLine = (text) => /^\s*"version":\s*"/.test(text ?? '');

function renderNextFiles(next) {
    const pkgRaw = readFileSync(PKG_PATH, 'utf8');
    const lockRaw = readFileSync(LOCK_PATH, 'utf8');
    const pkg = JSON.parse(pkgRaw);
    const lock = JSON.parse(lockRaw);

    const nextPkgRaw = serializeLike(pkgRaw, { ...pkg, version: next });

    const nextLock = { ...lock, version: next };
    if (lock.packages && lock.packages['']) {
        nextLock.packages = { ...lock.packages, '': { ...lock.packages[''], version: next } };
    }
    const nextLockRaw = serializeLike(lockRaw, nextLock);

    const pkgDiff = diffLines(pkgRaw, nextPkgRaw);
    const lockDiff = diffLines(lockRaw, nextLockRaw);

    if (pkgDiff.length !== 1 || !pkgDiff.every((d) => isVersionLine(d.from) && isVersionLine(d.to))) {
        die(
            `package.json 的改动不止一行 version(${pkgDiff.length} 处).停下来,别让无关的格式重排混进这次发布.`,
        );
    }
    if (lockDiff.length > 2 || !lockDiff.every((d) => isVersionLine(d.from) && isVersionLine(d.to))) {
        die(
            `package-lock.json 的改动不止那两行 version(${lockDiff.length} 处).` +
                '锁文件绝不能被重新解析重排(见 ci.yml 顶部第 3 条),停下来人工看一眼.',
        );
    }

    return { pkgRaw, lockRaw, nextPkgRaw, nextLockRaw, pkgDiff, lockDiff };
}

/* ------------------------------------------------ 远端与 npm 上的目标检查 */

async function publishedVersions(name) {
    const url = `https://registry.npmjs.org/${encodeURIComponent(name)}`;
    let res;
    try {
        res = await fetch(url, { headers: { accept: 'application/json' } });
    } catch (err) {
        die(`连不上 npm registry(检查代理/网络): ${err.message}`);
    }
    if (res.status === 404) return { versions: [], distTags: {} };
    if (!res.ok) die(`查询 npm registry 失败: HTTP ${res.status}`);
    const doc = await res.json();
    return { versions: Object.keys(doc.versions ?? {}), distTags: doc['dist-tags'] ?? {} };
}

function repoWebUrl() {
    const raw = probe('git', ['remote', 'get-url', 'origin']);
    const m = /github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/]+?)(?:\.git)?$/.exec(raw);
    return m ? `https://github.com/${m.groups.owner}/${m.groups.repo}` : '';
}

async function confirm(question) {
    if (assumeYes || dryRun) return true;
    if (!process.stdin.isTTY) {
        die('当前不是交互终端,确认不了.确认没问题就加 --yes 再跑一次.');
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
    rl.close();
    return answer === 'y' || answer === 'yes';
}

/* ---------------------------------------------------------------- 主流程 */

const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8'));
const next = nextVersion(pkg.version, kind);
const tag = `v${next}`;

log(`包名: ${pkg.name}`);
log(`版本: ${pkg.version} -> ${next}(tag ${tag})`);
log(`模式: ${dryRun ? 'dry-run(不改任何文件)' : '真实发布'}${skipGate ? ' + 跳过本地闸门' : ''}`);

/* 1. 前置检查 ------------------------------------------------------------ */

const branch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
if (branch !== 'main') die(`当前分支是 ${branch},发布只在 main 上做`);

// `--untracked-files=no`:只看**已跟踪**文件的改动.未跟踪的草稿文件不会进这次发布
// (commit 只加两个 JSON,tag 指向那个 commit,CI 构建的是 commit 里的树),所以它们
// 不该拦住一次发版.这里与 `pack_release.mjs` 判"工作树脏不脏"用的是同一条口径.
const dirty = capture('git', ['status', '--porcelain', '--untracked-files=no']);
if (dirty !== '') {
    die(
        '有未提交的已跟踪改动,先把它们提交或还原:\n' +
            dirty
                .split('\n')
                .map((l) => `    ${l}`)
                .join('\n'),
    );
}

log('拉取 origin/main 的最新状态...');
run('git', ['fetch', 'origin', 'main', '--quiet']);

const head = capture('git', ['rev-parse', 'HEAD']);
const remoteHead = probe('git', ['rev-parse', 'origin/main']);
if (remoteHead && head !== remoteHead) {
    die(
        `本地 main 与 origin/main 不一致(本地 ${head.slice(0, 7)} / 远端 ${remoteHead.slice(0, 7)}).\n` +
            '    先 `git pull --ff-only` 或把本地提交推上去,再发版.',
    );
}

/* 2. 目标检查 ------------------------------------------------------------ */

if (probe('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`])) {
    die(`本地已经有 tag ${tag} 了.要么换个版本号,要么先删掉它(git tag -d ${tag}).`);
}

const remoteTags = probe('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`]);
if (remoteTags !== '') {
    die(`远端已经有 tag ${tag} 了.删掉它再发: git push origin :refs/tags/${tag}`);
}

log('查询 npm 上已发布的版本...');
const { versions, distTags } = await publishedVersions(pkg.name);
log(`npm 上现有: ${versions.length ? versions.join(', ') : '(空包,还没有任何版本)'}`);
log(`最新 tag(dist-tags.latest): ${distTags.latest ?? '(无)'}`);
if (versions.includes(next)) {
    die(`npm 上已经有 ${pkg.name}@${next} 了.npm 不允许同版本重发,请换一个更大的版本号.`);
}

/* 3. 渲染新文件 ---------------------------------------------------------- */

const rendered = renderNextFiles(next);
log('版本号改动(内存里渲染的结果,还没落盘):');
for (const d of rendered.pkgDiff) {
    log(`  package.json 第 ${d.line} 行: ${d.from?.trim()} -> ${d.to?.trim()}`);
}
for (const d of rendered.lockDiff) {
    log(`  package-lock.json 第 ${d.line} 行: ${d.from?.trim()} -> ${d.to?.trim()}`);
}

if (dryRun) {
    log('dry-run 结束:一个文件都没动.去掉 --dry-run 就会真的执行下面这些:');
    log(`  npm run build${skipGate ? '(会被跳过)' : ''}`);
    log(`  git commit -m "${tag}" && git push origin main`);
    log(`  git tag ${tag} && git push origin ${tag}`);
    process.exit(0);
}

// 走到这里之后才动工作树;任何失败都把两个文件写回原样.
const restore = () => {
    writeFileSync(PKG_PATH, rendered.pkgRaw);
    writeFileSync(LOCK_PATH, rendered.lockRaw);
};

const ok = await confirm(
    `确认把 ${pkg.name} 从 ${pkg.version} 发到 ${next}?(会提交,推 main,推 tag ${tag})`,
);
if (!ok) die('已取消,什么都没做.');

/* 4. 落盘 + 本地闸门 ----------------------------------------------------- */

writeFileSync(PKG_PATH, rendered.nextPkgRaw);
writeFileSync(LOCK_PATH, rendered.nextLockRaw);
log(`已写入新版本号: package.json / package-lock.json`);

if (skipGate) {
    log('按 --skip-gate 跳过本地闸门(由 CI 兜底)');
} else {
    log('跑本地完整闸门: npm run build(失败会还原版本号)...');
    try {
        run('npm', ['run', 'build']);
    } catch {
        restore();
        die('本地闸门没过,已把版本号还原.修好之后再发.');
    }
    log('闸门全绿.');
}

/* 5. 提交 + 推 main ------------------------------------------------------ */

try {
    run('git', ['add', 'package.json', 'package-lock.json']);
    // 不绕过 `core.hooksPath` 指向的提交钩子(见 ci.yml 顶部第 2.1 条):这个 commit
    // 只动两个 JSON,钩子在这里通常什么都不做,但它要是坏了就该当场红,而不是被跳过.
    run('git', ['commit', '-m', tag]);
} catch {
    restore();
    die('git commit 失败,已把版本号还原.');
}

try {
    run('git', ['push', 'origin', 'main']);
} catch {
    die(
        `推 main 失败.本地已经有一个 commit(${tag}),仓库里的版本号也改了.\n` +
            '    不想留这个 commit:  git reset --soft HEAD~1\n' +
            '    只想稍后重推:     git push origin main',
    );
}
log(`已推 main:滚动资产(链路 A)会重新出一份.`);

/* 6. 打 tag + 推 tag(这一步才发 npm) ------------------------------------ */

try {
    run('git', ['tag', '-a', tag, '-m', tag]);
} catch {
    die(`打 tag 失败.代码已经在 main 上了,手动补: git tag -a ${tag} -m ${tag}`);
}

try {
    run('git', ['push', 'origin', tag]);
} catch {
    die(
        `推 tag 失败.本地 tag 已经建好了,手动补推: git push origin ${tag}\n` +
            `    想放弃这次: git tag -d ${tag}`,
    );
}

const repo = repoWebUrl();
console.log('');
log(`完成:${pkg.name}@${next} 已经推到 tag ${tag}.`);
if (repo) log(`去看流水线:${repo}/actions/workflows/release.yml`);
log('publish job 绿了之后,registry 上还要 1-2 分钟才查得到新版本(传播延迟,不是失败).');
log(`核对包页面:https://www.npmjs.com/package/${pkg.name}`);
