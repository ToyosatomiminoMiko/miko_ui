/**
 * 把"包根"打成一个 release 资产:`release/miko_ui_dist.tar.gz`.
 *
 * 这**不是** `npm pack`,也不再和 npm registry 有任何关系:资产是给两个应用仓库
 * (`miko_graphcalc`、`ToyosatomiminoMiko.github.io`)的 `scripts/fetch_ui.sh`
 * 直接下载、解开、按 `"@miko/ui": "file:.cache/miko_ui/current"` 链接的.所以他们
 * 会读到的东西在这里定死,任何一处漂移都在这个脚本里报错,而不是在他们的构建里
 * 以奇怪的方式炸.
 *
 * 资产的形状(解到最后,**包根**就直接是这四样,没有多一层目录):
 *
 *     package.json   <- 运行期清单,**由本脚本从 package.json 生成**,不是照抄
 *     dist/          <- tsc 产物:`index.js` + `index.d.ts`(exports 的根入口)
 *     styles/        <- 五份 CSS(exports 的 `./styles*`)
 *     LICENSE        <- AGPL-3.0-or-later,跟着产物一起分发
 *
 * 其中清单里的 `gitHead` 是**本脚本写进去的**:这一份资产是哪个 commit 构建的.
 * 库不写版本号,消费侧的 `fetch_ui.sh` 每次构建都要回答"我缓存的这份是不是最新
 * 发布的":它拿 `ui-latest` tag 指向的 commit 当"最新",可这个 tag 是在资产
 * **上传之后**才被强推过去的(见 `release.yml`),所以"下载的那一瞬 tag 指哪"并
 * 不等于"资产是哪个 commit 建的".把 commit 写进资产,这件事就只剩两串 sha 的
 * 相等比较.取不到 commit 时本脚本**直接失败** —— 一份说不清自己是什么的资产,
 * 比没有资产更坏(消费侧会把它当"不是最新",每次构建重下一遍).
 *
 * 为什么清单必须**重新生成**而不是照抄 `package.json`:
 *
 *   - `scripts` 绝不能带.`npm install` 装 `file:` 链接的包时会先跑它的
 *     `prepare`;资产里没有 `scripts/` 也没有 devDependencies,那一步必然
 *     `MODULE_NOT_FOUND`.实测(npm 10.9.8):目标清单里只要有 `scripts.prepare`,
 *     `file:` 依赖安装就会执行它.消费侧的 `fetch_ui.sh` 也会独立校验一次
 *     "清单里没有 scripts",两边互为对方的保险.
 *   - `private` / `devDependencies` / `files` 这些构建期字段对消费者没有意义,
 *     带过去只会制造"这份产物的依赖树到底该长什么样"的歧义.
 *
 * 清单字段**白名单 + 显式黑名单,出现未知字段直接失败**:`package.json` 是严格
 * JSON 放不下注释,一个"以后再加的字段"到底该不该进资产,只能由人当场决定一次.
 * 沉默地丢掉它(例如将来加 `browser` 字段)会让消费者行为悄悄分叉,所以这里选择
 * 报错,并把该往哪张表里加写在错误信息里.
 *
 * 用法:
 *     npm run build          # 先产出 dist/(本脚本不编译,只打包)
 *     npm run release:pack   # -> release/miko_ui_dist.tar.gz
 *
 * 退出码:0 = 资产已就绪(并打印清单、tar 内容、sha256);非 0 = 明确失败.
 * 打出的 tar 是**可复现**的(排序 + 归零 mtime/uid/gid),所以内容不变则 sha256
 * 不变 —— 同一个 commit 打两次,`gitHead` 也一样,消费者缓存的"这一份对应哪个
 * commit"因此可以被人核对(`.miko-ui-source` 那张纸条 + 清单里的 `gitHead`).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 本仓库根 = `scripts/` 的上一层,也就是被检查的包本身. */
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, 'release');
const STAGE_DIR = join(OUT_DIR, 'stage');

/** 资产文件名.两个消费侧的 `fetch_ui.sh` 与 `release.yml` 都写死这一个名字. */
const ASSET_NAME = 'miko_ui_dist.tar.gz';
const ASSET_PATH = join(OUT_DIR, ASSET_NAME);

/**
 * 进资产的字段(消费者侧包管理器 / 打包器真的会读的).
 *
 * `version` 在表里但库里现在没有版本号(库不打 tag、不写版本号,理由见
 * `RELEASING.md`):将来真写进去时会自动带上,不需要改这里.
 */
const RUNTIME_FIELDS = [
    'name',
    'version',
    'type',
    'description',
    'keywords',
    'license',
    'author',
    'contributors',
    'funding',
    'repository',
    'homepage',
    'bugs',
    'main',
    'module',
    'types',
    'typings',
    'exports',
    'imports',
    'browser',
    'sideEffects',
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
    'peerDependenciesMeta',
    // 不来自仓库的 package.json,由本脚本生成(见文件头):值是**构建 commit**.
    // 列在这里只是为了让"白名单外字段直接失败"那条规则不误伤仓库清单里万一存在
    // 的 gitHead(npm publish 会自己写这个字段);它的值一律被下面覆盖.
    'gitHead',
];

/**
 * 明确**不进**资产的字段(构建期 / 仓库治理).
 *
 * 这份表是"决策记录":每一条都代表"消费者不需要它",而不是"忘了带".
 */
const BUILD_ONLY_FIELDS = new Set([
    'private', // 只约束本仓库能不能发 npm;对 file: 链接没有意义
    'scripts', // 见文件头:npm 会跑 prepare,资产里没有 scripts/ 必炸
    'devDependencies', // 资产不带 node_modules,声明它只会误导
    'files', // 资产内容由本脚本决定,不由 npm 打包规则决定
    'packageManager', // 只约束本仓库的开发环境
    'engines', // 只约束本仓库;消费者用的是它自己的 Node
    'publishConfig', // npm registry 专用,这条路已作废
    'workspaces', // 单包仓库,没有 workspace
]);

const log = (msg) => console.log(`[PACK] ${msg}`);
const fail = (msg) => {
    console.error(`[PACK][ERROR] ${msg}`);
    process.exit(1);
};

/**
 * 这一份资产是哪个 commit 构建的 —— 写进清单的 `gitHead`(npm 的既有字段,语义
 * 就是"打这个包时所在的 commit").消费侧靠它判断"缓存是不是最新",见文件头.
 *
 *   - CI 里用 `GITHUB_SHA`:它就是本次构建的 commit,工作树脏不脏与它无关
 *     (构建产物本来就在工作树里生成,而且构建产物全是 gitignore 的);
 *   - 本地用 `git rev-parse HEAD`;有**未提交改动**时(只看已跟踪文件)标成
 *     `<sha>-dirty`:本地打出来的包不对应任何 commit,这个值永远不等于 tag 指向
 *     的 sha,消费侧会把它当"不是最新"重取发布产物 —— 正是想要的;
 *   - 两种都拿不到就失败:一份说不清自己是什么的资产比没有资产更坏.
 */
function resolveGitHead() {
    const git = (args) => {
        try {
            return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
        } catch {
            return '';
        }
    };

    const fromCI = (process.env.GITHUB_SHA ?? '').trim();
    if (/^[0-9a-f]{40}$/.test(fromCI)) {
        return fromCI;
    }

    const sha = git(['rev-parse', 'HEAD']);
    if (!/^[0-9a-f]{40}$/.test(sha)) {
        fail(
            '取不到构建 commit(`GITHUB_SHA` 不是 40 位 sha,`git rev-parse HEAD` 也没结果);' +
                'gitHead 是消费侧判断"缓存是不是最新"的唯一依据,不能缺 —— ' +
                '请在 GitHub Actions 里跑,或在一个 git 工作树里跑',
        );
    }
    if (git(['status', '--porcelain', '--untracked-files=no']) !== '') {
        log(
            `注意:工作树有未提交改动,gitHead 记成 ${sha}-dirty` +
                '(它不等于任何 tag,消费侧会重取发布产物)',
        );
        return `${sha}-dirty`;
    }
    return sha;
}

/** 必须存在的产物入口;缺一个就说明 `npm run build` 没跑或跑挂了. */
async function checkBuildOutput() {
    const required = [
        join(ROOT, 'dist', 'index.js'),
        join(ROOT, 'dist', 'index.d.ts'),
        join(ROOT, 'styles', 'styles.css'),
        join(ROOT, 'LICENSE'),
    ];
    const missing = required.filter((p) => !existsSync(p));
    if (missing.length > 0) {
        fail(
            `缺产物:${missing.map((p) => relative(ROOT, p)).join(', ')}` + ';先跑 npm run build',
        );
    }
    const cssCount = (await readdir(join(ROOT, 'styles'))).filter((f) => f.endsWith('.css')).length;
    if (cssCount === 0) {
        fail('styles/ 里没有 .css;exports 的 ./styles* 会指向不存在的文件');
    }
}

/**
 * 生成运行期清单.
 *
 * 未知顶层字段**直接失败**,不静默丢弃:白名单漏了新字段时,症状会是"资产里
 * 少了它",那太晚了.错误信息里直接说该往哪张表加.
 */
function buildRuntimeManifest(pkg, gitHead) {
    const manifest = {};
    for (const field of RUNTIME_FIELDS) {
        if (field in pkg) {
            manifest[field] = pkg[field];
        }
    }

    // 由本脚本生成,不从仓库清单抄(见 resolveGitHead):这份资产是哪个 commit
    // 构建的.仓库清单里即使已经有 gitHead(npm publish 会写),也一律覆盖.
    manifest.gitHead = gitHead;

    const known = new Set([...RUNTIME_FIELDS, ...BUILD_ONLY_FIELDS]);
    const unknown = Object.keys(pkg).filter((field) => !known.has(field));
    if (unknown.length > 0) {
        fail(
            `package.json 里出现未分类的顶层字段:${unknown.join(', ')};` +
                '请在本脚本的 RUNTIME_FIELDS(要进资产)或 BUILD_ONLY_FIELDS(不进资产)' +
                '里为它做一次决定',
        );
    }

    if (manifest.name !== 'miko_ui') {
        fail(`清单 name 是 ${JSON.stringify(manifest.name)},不是 miko_ui`);
    }
    if (!manifest.exports?.['.']) {
        fail('清单 exports 里没有 ".":消费者 import 的根入口会解析不到');
    }

    // 最后一道自检:这是 npm 跑 prepare 的唯一触发条件(实测 npm 10.9.8).
    for (const forbidden of ['scripts', 'private', 'devDependencies']) {
        if (forbidden in manifest) {
            fail(`生成出来的清单里不该有 ${forbidden}`);
        }
    }
    if (!/^[0-9a-f]{40}(-dirty)?$/.test(manifest.gitHead ?? '')) {
        fail(`生成出来的清单 gitHead 是 ${JSON.stringify(manifest.gitHead)},不是 commit sha`);
    }
    return manifest;
}

/** 可复现 tar:GNU tar 选项齐全才稳(CI 是 ubuntu,本地是 Linux). */
function createTarball() {
    const gnuFlags = ['--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner'];
    try {
        execFileSync('tar', ['-czf', ASSET_PATH, ...gnuFlags, '-C', STAGE_DIR, '.'], {
            stdio: ['ignore', 'ignore', 'pipe'],
        });
    } catch (error) {
        const stderr = error.stderr?.toString().trim() ?? '';
        fail(
            `tar 打包失败(${error.message}${stderr ? `: ${stderr}` : ''});` +
                '本脚本用 GNU tar 的 --sort/--mtime/--owner 选项做可复现打包,需要 GNU tar',
        );
    }
}

const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
const gitHead = resolveGitHead();
const manifest = buildRuntimeManifest(pkg, gitHead);
await checkBuildOutput();

log(`gitHead:${gitHead}(这份资产是哪个 commit 构建的)`);
log('运行期清单(就是要放进资产的那份):');
log(JSON.stringify(manifest, null, 2));

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(STAGE_DIR, { recursive: true });
await cp(join(ROOT, 'dist'), join(STAGE_DIR, 'dist'), { recursive: true });
await cp(join(ROOT, 'styles'), join(STAGE_DIR, 'styles'), { recursive: true });
await cp(join(ROOT, 'LICENSE'), join(STAGE_DIR, 'LICENSE'));
await writeFile(join(STAGE_DIR, 'package.json'), `${JSON.stringify(manifest, null, 4)}\n`);

createTarball();

const listing = execFileSync('tar', ['-tzf', ASSET_PATH], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .sort();
const bytes = (await readFile(ASSET_PATH)).length;
const sha256 = createHash('sha256')
    .update(await readFile(ASSET_PATH))
    .digest('hex');

log(`资产内容(${listing.length} 项):`);
for (const entry of listing) {
    log(`  ${entry}`);
}
log(`资产:${relative(ROOT, ASSET_PATH)}`);
log(`大小:${bytes} 字节`);
log(`sha256:${sha256}`);
log('就绪:release.yml 会把它挂到滚动 release `ui-latest` 上');
