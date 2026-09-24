import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 类名契约:库**产出的**每个类名,库的样式表里要么给它默认观感,要么在下面
 * 那份白名单里明确声明"它只是定位钩子".
 *
 * 为什么需要这条断言:`MessageList` 产出 `.diagnostic*`,`rowDom` 产出
 * `.object-row` / `.row-main` / `.row-actions`,`FormulaCopyController` 产出
 * `.is-copied` / `.is-error` -- 而这三组在补上默认样式之前,库的样式表里一条
 * 规则都没有.症状不是"库坏了",而是**消费者被迫给库的类写外观**,正好是
 * "上游定义样式,下游只能重载"的反面;更糟的是消费侧的
 * `styleLayers.test.ts` 明令禁止应用给库的类写样式,于是那条契约在多消费者
 * 下必然被违反,或者库件裸奔.
 *
 * 这条断言把"游离的类名"变成会红的测试:新增一个产出而不给样式,必须在这里
 * 显式声明它是钩子(带理由),否则 CI 失败.它与 `scripts/check_ui_boundary.mjs`
 * 的八条**互补**:那八条守"库不依赖消费者",这条守"库不把自己该做的样式推给
 * 消费者".
 *
 * 判据刻意用**源码里的类名字面量**而不是运行期 DOM:静态可判定,不需要 DOM 桩,
 * 也不会漏掉那些只在某个分支里才挂上的状态类(如 `is-copied`).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SRC = join(ROOT, 'src');
const STYLES = join(ROOT, 'styles');

/** 递归收集文件,跳过 `node_modules` / `dist`. */
function walk(dir: string, extensions: readonly string[]): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full, extensions));
        else if (extensions.some((ext) => entry.name.endsWith(ext))) out.push(full);
    }
    return out;
}

/** 去掉注释与 JSDoc:文档里举的例子(`class: 'unit'`)不是产出. */
function stripTsComments(source: string): string {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
}

/**
 * 源码里被**当成类名**写出来的字面量.三类写法:
 *   - `class: 'a b'` / `class: \`a\``  (create_element / createButton 等)
 *   - `classList.add/toggle/remove('a')`
 *   - `const X_CLASS = 'a'`(常量类名,如 `MenuItem` 的 active)
 *
 * 模板插值要**先取整串再去掉插值段**:`class: \`diagnostic diagnostic-${level}\``
 * 去掉 `${level}` 之后只剩 `diagnostic `,而 `diagnostic-<level>` 的具名类
 * (`diagnostic-warning` / `diagnostic-error`)由下面显式补上.
 *
 * 注意不能写成 `` `([^`$]*)` ``:插值里的 `$` 会让那条模式永远匹配不到收尾的
 * 反引号,整条 `class:` 就被静默跳过 -- 那正是"守卫假绿"的写法.
 */
function emittedClasses(source: string): Map<string, string> {
    const found = new Map<string, string>();
    const add = (name: string, line: number): void => {
        // 以 `-` 收尾的整词是模板前缀被 `split` 切下来的残段(如 `diagnostic-`):
        // 它不是类名,真正的具名类在 EXPANDED_TEMPLATE_CLASSES 里显式列出.
        if (!name || name.endsWith('-')) return;
        if (!found.has(name)) found.set(name, `src:${line}`);
    };
    const lines = stripTsComments(source).split('\n');

    lines.forEach((line, index) => {
        const at = index + 1;
        for (const match of line.matchAll(/class:\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)/g)) {
            const raw = (match[1] ?? match[2] ?? match[3] ?? '').replace(/\$\{[^}]*\}/g, ' ');
            for (const name of raw.split(/\s+/)) add(name, at);
        }
        for (const match of line.matchAll(/classList\.(?:add|toggle|remove)\(\s*'([^']+)'/g)) {
            add(match[1], at);
        }
        for (const match of line.matchAll(/const\s+\w*(?:CLASS|Class)\w*\s*=\s*'([^']+)'/g)) {
            add(match[1], at);
        }
    });

    return found;
}

/**
 * 由模板拼出来的**具名**状态类:静态扫不到,但库确实会产出,所以必须一起守.
 *
 * `MessageList` 产出 `` `diagnostic diagnostic-${level}` ``,而 `MessageLevel` 只有
 * `warning` / `error` 两种.这里是"源码里那句模板的展开结果",不是白名单 --
 * 少写一个就等于这个类没有默认样式(Consumer 又要自己写).
 */
const EXPANDED_TEMPLATE_CLASSES = ['diagnostic-warning', 'diagnostic-error'] as const;


/** 样式表里出现过的类名(含 `:where(.ui-button)` 这类). */
function styledClasses(css: string): Set<string> {
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
    return new Set([...bare.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((match) => match[1]));
}

/**
 * 有意不给外观的**定位钩子**:它们只用来在 DOM 里认出某个节点(测试与语义),
 * 外观来自 `.ui-button` 基线或消费者.新增条目必须在这里说明理由 -- 这份白名单
 * 就是"故意留白"与"忘了写样式"之间的分界,不允许悄悄扩大.
 */
const INTENTIONAL_HOOKS = new Map<string, string>([
    ['window-control-btn', '窗口标题栏控制按钮:外观全来自 .ui-button 基线,这里只是定位钩子(见 desktop.css)'],
    ['slider-field-reset', '系数滑块的重置按钮:同样是 .ui-button 基线,只是定位钩子(见 widgets/Button.ts)'],
    ['dock-action', 'Dock 的桌面动作按钮:外观与 .dock-btn 同源,只作定位钩子(见 desktop.css)'],
    ['is-cyclic', '系数滑块的循环标记:具名语义钩子(测试与消费侧选择用),循环徽章的外观由 .slider-field-tag 承担'],
]);

describe('类名契约:库产出的类名都有默认样式', () => {
    const sourceFiles = walk(SRC, ['.ts']).filter((file) => !file.endsWith('.test.ts'));
    const emitted = new Map<string, string>();
    for (const file of sourceFiles) {
        for (const [name, where] of emittedClasses(readFileSync(file, 'utf8'))) {
            if (!emitted.has(name)) emitted.set(name, `${relative(ROOT, file)} (${where})`);
        }
    }
    for (const name of EXPANDED_TEMPLATE_CLASSES) {
        if (!emitted.has(name)) emitted.set(name, 'EXPANDED_TEMPLATE_CLASSES(模板展开)');
    }

    const styled = new Set<string>();
    for (const file of walk(STYLES, ['.css'])) {
        for (const name of styledClasses(readFileSync(file, 'utf8'))) styled.add(name);
    }

    it('扫到的类名不是空的(断言本身没写坏)', () => {
        // 正控:解析器真的读到了东西.否则下面那条会因为"两边都空"而假绿.
        expect(emitted.size).toBeGreaterThan(30);
        expect(styled.size).toBeGreaterThan(30);
    });

    it('每个产出的类名要么有样式,要么是有理由的定位钩子', () => {
        const unstyled = [...emitted.keys()]
            .filter((name) => !styled.has(name) && !INTENTIONAL_HOOKS.has(name))
            .sort();

        const detail = unstyled
            .map((name) => `      .${name}  <- ${emitted.get(name)}`)
            .join('\n');

        expect(
            unstyled,
            unstyled.length === 0
                ? ''
                : '这些类名由库产出,但库的样式表里没有对应规则:消费者会被迫给库的类写外观.\n'
                  + '要么在 styles/ 里补默认样式(推荐),要么在 INTENTIONAL_HOOKS 里显式声明它只是钩子.\n'
                  + detail,
        ).toEqual([]);
    });

    it('白名单里的定位钩子确实没有样式(删了样式就把白名单一起删)', () => {
        // 反向断言:钩子一旦被补上样式,就该从白名单移走 -- 免得名单变成
        // "没人再看的豁免表",下次真漏了样式时被它静默盖住.
        const stale = [...INTENTIONAL_HOOKS.keys()].filter((name) => styled.has(name));
        expect(stale, `这些钩子已经有了样式,请从 INTENTIONAL_HOOKS 里删掉:\n${stale.join('\n')}`).toEqual([]);
    });
});
