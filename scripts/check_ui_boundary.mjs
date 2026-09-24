#!/usr/bin/env node
/**
 * `miko_ui` 的独立性守卫.
 *
 * 八条规则:
 *
 * | 规则 | 目标 |
 * | --- | --- |
 * | domain-imports | 库不认识 `@/contract` `@/compiler` `@/math` `@/render` `@/config/renderConfig` |
 * | app-config-imports | 库不认识 `@/config/uiConfig`(配置改成注入) |
 * | app-source-imports | 库不认识任何 `@/` 别名(分词器/测试桩等一律注入或自带) |
 * | global-dom | 库(会被打包的那部分)不按 id 查节点,也不直接摸全局 `document` / `window`;不看注释与 `*.test.ts` |
 * | css-ids | 库的样式只有类名(排除十六进制颜色与注释);id 选择器会变成消费者的公开 API |
 * | deps | `dependencies` 只允许 `@preact/signals-core`;`peerDependencies` 只允许 `katex` |
 * | exports-surface | `exports` 只有根入口(构建产物 `dist/index.*`)与 `styles/`,内部路径不进公开面 |
 * | no-batch | 库里一次都不用 `batch()`:用了就等于在更新路径上引入调度器,手写 DOM 桩立刻失真 |
 *
 * 前三条在这里恒为 0:本仓库没有应用源码可引用,`@/` 别名只属于消费者那一侧.
 * 留着不是凑数:`@/` 这条同时也是"库内不许用路径别名"的机器保证,而那正是
 * "换消费者不用改 import"的前提.
 *
 * 八条都是硬断言:任何一条出现违例即非零退出.没有 baseline,也没有"允许的
 * 例外" -- 库里的东西不属于任何单个应用,出现一处就该改成注入或自带实现.
 *
 * 用法:
 *   node scripts/check_ui_boundary.mjs            # 八条全 0 才通过
 *   node scripts/check_ui_boundary.mjs --list     # 打印全部违例明细
 *
 * `npm test` 的 `test` 脚本会先跑这一条.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 本仓库的根(`scripts/` 的上一层)就是被检查的包本身. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG_SRC = join(ROOT, 'src');
const PKG_STYLES = join(ROOT, 'styles');

/** 递归收集文件;`node_modules` 与 `dist` 不属于源码面. */
function walk(dir, extensions) {
    if (!existsSync(dir)) return [];
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full, extensions));
        else if (extensions.some((ext) => entry.name.endsWith(ext))) out.push(full);
    }
    return out;
}

/**
 * 逐行跑一组正则,产出违例明细.
 *
 * @param {string[]} files 绝对路径
 * @param {RegExp[]} patterns 命中即算违例(应当带 `g` 以便一行多处全算)
 * @param {(line: string) => boolean} [allow] 白名单:命中但不算违例的行
 */
function scan(files, patterns, allow) {
    const hits = [];
    for (const file of files) {
        const rel = relative(ROOT, file);
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, index) => {
            if (allow?.(line)) return;
            for (const pattern of patterns) {
                pattern.lastIndex = 0;
                if (pattern.test(line)) {
                    hits.push({ file: rel, line: index + 1, text: line.trim() });
                    break;
                }
            }
        });
    }
    return hits;
}

/** `@/` 引用按"最贵的那一类"归类:domain > uiConfig > 其余. */
const DOMAIN = /@\/(?:contract|compiler|math|render)\/|@\/config\/renderConfig/;
const APP_CONFIG = /@\/config\/uiConfig/;
const ANY_ALIAS = /@\//;

/** 库源码里的 `@/` 明细,一次扫描分三桶,避免同一行被数两次. */
function aliasBuckets() {
    const files = walk(PKG_SRC, ['.ts']);
    const domain = [];
    const appConfig = [];
    const other = [];
    for (const file of files) {
        const rel = relative(ROOT, file);
        readFileSync(file, 'utf8')
            .split('\n')
            .forEach((line, index) => {
                if (!ANY_ALIAS.test(line)) return;
                const hit = { file: rel, line: index + 1, text: line.trim() };
                if (DOMAIN.test(line)) domain.push(hit);
                else if (APP_CONFIG.test(line)) appConfig.push(hit);
                else other.push(hit);
            });
    }
    return { domain, appConfig, other };
}

const LIB_FILES = walk(PKG_SRC, ['.ts']);
/** 会被消费者打包进去的那部分:不含 `*.test.ts`(测试必然操作全局桩). */
const LIB_SHIPPED_FILES = LIB_FILES.filter((file) => !file.endsWith('.test.ts'));
const STYLE_FILES = walk(PKG_STYLES, ['.css']);

/** 整行注释(含 JSDoc 的 `*` 行):断言守的是代码,不是文字里的提法. */
function isCommentLine(line) {
    const text = line.trim();
    return text.startsWith('//')
        || text.startsWith('*')
        || text.startsWith('/*')
        || text.startsWith('*/');
}

/**
 * 全局 DOM 的判据:只看**裸标识符**,不把 `root.window.` 这类属性访问
 * 算进来(负向后顾排除前面是 `.`/标识符字符的情形),也不看注释与测试文件.
 */
const GLOBAL_DOM = [
    /(?<![.\w$])getElementById\b/,
    /(?<![.\w$])document\./,
    /(?<![.\w$])window\./,
];

/**
 * CSS 的 id 选择器:排除十六进制颜色与注释.
 *
 * 3/4/6/8 位的十六进制就是颜色,其余是 id 选择器.注释也一并去掉
 * (块注释按字符数替换成空白,行号不漂).
 */
const CSS_COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const CSS_ID = /#[A-Za-z][A-Za-z0-9-]*/g;

function stripCssComments(css) {
    return css.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ''));
}

function scanCssIds(files) {
    const hits = [];
    for (const file of files) {
        const rel = relative(ROOT, file);
        stripCssComments(readFileSync(file, 'utf8')).split('\n').forEach((line, index) => {
            for (const match of line.matchAll(CSS_ID)) {
                if (CSS_COLOR.test(match[0])) continue;
                hits.push({ file: rel, line: index + 1, text: line.trim() });
                break;
            }
        });
    }
    return hits;
}

/** 库里多一个运行时依赖就是要评审的事件. */
function checkDeps() {
    const pkgPath = join(ROOT, 'package.json');
    if (!existsSync(pkgPath)) return [];
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const allowedDeps = new Set(['@preact/signals-core']);
    const allowedPeers = new Set(['katex']);
    const hits = [];
    for (const name of Object.keys(pkg.dependencies ?? {})) {
        if (!allowedDeps.has(name)) {
            hits.push({ file: 'package.json', line: 1, text: `dependencies 多了一项: ${name}` });
        }
    }
    for (const name of Object.keys(pkg.peerDependencies ?? {})) {
        if (!allowedPeers.has(name)) {
            hits.push({ file: 'package.json', line: 1, text: `peerDependencies 多了一项: ${name}` });
        }
    }
    return hits;
}

/**
 * 形态断言:内部路径不进 `exports`.
 *
 * 公开面**只有**三类,多一类都要在这里显式加:
 * 1. 根入口的构建产物 -- `./dist/index.js` 与 `./dist/index.d.ts`;
 * 2. 样式表 -- `./styles/` 下的任意 CSS(消费者按分组引);
 * 3. `./package.json` 自引用 -- 工具链(打包器,包管理器)读元数据要用的标准出口.
 *
 * 这条规则守的是"**唯一**出口"这个约定,所以它比"路径合法"更严:把
 * `./dist/widgets/Button.js` 挂成 `miko_ui/widgets/Button` 会被它拦下 --
 * 那样一来库内目录结构就变成了对外契约,重构要对外兼容.
 */
const ALLOWED_EXPORT_EXACT = new Set([
    './dist/index.js',
    './dist/index.d.ts',
    './package.json',
]);

function isAllowedExportPath(value) {
    return ALLOWED_EXPORT_EXACT.has(value) || value.startsWith('./styles/');
}

function checkExports() {
    const pkgPath = join(ROOT, 'package.json');
    if (!existsSync(pkgPath)) return [];
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const hits = [];
    const visit = (value, key) => {
        if (typeof value === 'string') {
            if (!isAllowedExportPath(value)) {
                hits.push({ file: 'package.json', line: 1, text: `exports["${key}"] 指向内部路径: ${value}` });
            }
            return;
        }
        for (const [k, v] of Object.entries(value ?? {})) visit(v, key ? `${key}.${k}` : k);
    };
    visit(pkg.exports, '');
    return hits;
}

const buckets = aliasBuckets();

/** 八条规则的违例明细. */
const violations = {
    'domain-imports': buckets.domain,
    'app-config-imports': buckets.appConfig,
    'app-source-imports': buckets.other,
    'global-dom': scan(LIB_SHIPPED_FILES, GLOBAL_DOM, isCommentLine),
    'css-ids': scanCssIds(STYLE_FILES),
    deps: checkDeps(),
    'exports-surface': checkExports(),
    'no-batch': scan(LIB_SHIPPED_FILES, [/\bbatch\s*\(/], isCommentLine),
};

const RULES = Object.keys(violations);

function counts() {
    return Object.fromEntries(RULES.map((rule) => [rule, violations[rule].length]));
}

function printHits(rule) {
    const hits = violations[rule];
    const shown = hits.slice(0, 12);
    for (const hit of shown) {
        console.log(`      ${hit.file}:${hit.line}  ${hit.text}`);
    }
    if (hits.length > shown.length) console.log(`      ... 另有 ${hits.length - shown.length} 处`);
}

const args = new Set(process.argv.slice(2));
const current = counts();

if (args.has('--list')) {
    for (const rule of RULES) {
        console.log(`\n[${rule}] ${current[rule]} 处`);
        printHits(rule);
    }
    process.exit(0);
}

let failed = false;

console.log('UI 库边界检查');
for (const rule of RULES) {
    const now = current[rule];
    if (now > 0) {
        failed = true;
        console.log(`  ✗ ${rule}: ${now} 处`);
        printHits(rule);
    } else {
        console.log(`  · ${rule}: 0 处`);
    }
}

if (failed) {
    console.error('\n出现耦合.库里的东西不属于任何单个应用,请改成注入或自带实现.');
    process.exit(1);
}
