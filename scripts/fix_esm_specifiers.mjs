/**
 * 把 `tsc` 产出的 ESM 说明符补全成 Node 也能解析的形态.
 *
 * 为什么需要这一步:库内一律写无扩展名的相对导入(`from './reactive'`),这在
 * `moduleResolution: "bundler"` 下完全合法,`tsc` 编译时也照样原样输出 —— 因为
 * TypeScript **从不改写说明符**.于是 `dist/index.js` 里留下 `from './reactive'`,
 * 三种消费者里只有两种能用:
 *
 * - Vite / webpack / Next:自己带解析器,能补 `.js` 与 `/index.js`,没问题;
 * - Node 原生 ESM:要求说明符是完整路径,直接 ERR_MODULE_NOT_FOUND;
 * - `tsc` 类型解析(`node16`/`nodenext`):同样要求带扩展名.
 *
 * 补全的规则是 ECMAScript/Node 的规则,不是"猜":
 * - 指向文件的 `./widgets/Button`      -> `./widgets/Button.js`
 * - 指向目录的 `./reactive`(有 index) -> `./reactive/index.js`
 *
 * `.d.ts` 里的说明符也补成 `.js`:TypeScript 解析 `./x.js` 时会去找同目录的
 * `./x.d.ts`,这是声明文件里表达"对应运行时文件"的标准写法.
 *
 * 只动相对说明符.裸包名(`katex`、`@preact/signals-core`)与 `katex/dist/
 * katex.min.css` 这类副作用导入一个字符都不碰 —— 那些该由消费者解析.
 *
 * 另外顺手做一件事:删掉 **声明文件** 里的 CSS 副作用导入(见下面
 * `DECLARATION_CSS_IMPORT` 的理由).运行时的 `.js` 不受影响.
 *
 * 用法:`node scripts/fix_esm_specifiers.mjs [目录=dist]`
 * 退出码:0 = 全部解析成功;1 = 有说明符找不到对应产物(必须修源文件,不能忽略).
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const DIST = path.resolve(process.argv[2] ?? 'dist');

/**
 * 三种写法都要覆盖:
 *   1. `from './x'`          —— import / export ... from
 *   2. `import './x'`        —— 纯副作用导入
 *   3. `import('./x')`       —— 动态导入(含 `import('./x').T` 这种类型写法)
 * 捕获组固定为 (前缀)(引号)(说明符).
 */
const PATTERNS = [
    /(\bfrom\s*)(['"])(\.\.?\/[^'"]*)\2/g,
    /(\bimport\s*)(['"])(\.\.?\/[^'"]*)\2/g,
    /(\bimport\s*\(\s*)(['"])(\.\.?\/[^'"]*)\2/g,
];

/**
 * 声明文件里的纯副作用 **CSS** 导入,整行删掉.
 *
 * 起因:`src/formula/FormulaView.ts` 引 `katex/dist/katex.min.css`(让消费者装上
 * 库就自带公式排版样式).`tsc` 生成 `FormulaView.d.ts` 时会把这条副作用导入
 * 原样保留,于是拿到 `.d.ts` 的消费者在 `skipLibCheck: false` 下会得到
 * `TS2307: Cannot find module 'katex/dist/katex.min.css'` —— CSS 文件永远没有
 * 类型声明,装没装 katex 都一样.
 *
 * 为什么删掉是安全的:CSS 没有任何类型面,声明文件里这条导入不贡献任何类型.
 * 运行时那份 `dist/formula/FormulaView.js` 里的导入**原样保留**,样式照旧生效.
 *
 * 为什么只删 `.css`:声明文件里的副作用导入不全是可以删的 —— `import 'x'` 也可能是
 * 模块增强(augmentation),删了会丢类型.所以这里只认 CSS,不做通用删除.
 */
const DECLARATION_CSS_IMPORT = /^[ \t]*import\s+['"][^'"]*\.css['"];?[ \t]*\r?\n/gm;

/** 深度优先遍历目录,只产出文件路径. */
async function* walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) yield* walk(full);
        else yield full;
    }
}

/**
 * 把 `spec` 补成 Node 可解析的说明符;解析不出来返回 `null`.
 *
 * `file` 用来说明"相对于谁解析",`declaration` 说明这次查的是不是 `.d.ts`
 * (决定拿什么扩展名去探测文件是否存在).
 */
function resolveSpecifier(spec, file, declaration) {
    // 已经带扩展名(库内只有 `*.css` 这种副作用导入)的一律不动.
    if (path.extname(spec) !== '') return spec;

    const base = path.resolve(path.dirname(file), spec);
    const probe = declaration ? '.d.ts' : '.js';

    if (existsSync(base + probe)) return `${spec}.js`;
    if (existsSync(path.join(base, `index${probe}`))) {
        return `${spec.replace(/\/+$/, '')}/index.js`;
    }
    return null;
}

let scanned = 0;
let rewritten = 0;
const unresolved = [];

for await (const file of walk(DIST)) {
    // 只处理 JS 与声明文件;`.map` 是 JSON,不进这一遍.
    const declaration = file.endsWith('.d.ts');
    if (!declaration && !file.endsWith('.js')) continue;
    scanned += 1;

    const before = await readFile(file, 'utf8');
    let after = declaration ? before.replace(DECLARATION_CSS_IMPORT, '') : before;
    const stripped = after !== before;

    for (const pattern of PATTERNS) {
        after = after.replace(pattern, (match, prefix, quote, spec) => {
            const target = resolveSpecifier(spec, file, declaration);
            if (target === null) {
                unresolved.push(`${path.relative(DIST, file)} -> ${spec}`);
                return match;
            }
            return target === spec ? match : `${prefix}${quote}${target}${quote}`;
        });
    }

    if (after !== before) {
        await writeFile(file, after);
        rewritten += 1;
        if (stripped) console.log(`  去掉声明文件里的 CSS 副作用导入:${path.relative(DIST, file)}`);
    }
}

if (unresolved.length > 0) {
    console.error('以下相对导入在产物里找不到对应文件,说明源文件导入路径有问题:');
    for (const line of unresolved) console.error(`  ${line}`);
    process.exit(1);
}

console.log(`fix_esm_specifiers: 扫描 ${scanned} 个产物文件,改写 ${rewritten} 个`);
