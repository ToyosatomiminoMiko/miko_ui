import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 滚动条是**单独的一条规定**,这里守的就是"单独"两个字.
 *
 * 1. **自足**:`styles/scrollbar.css` 的每条选择器都只挂在 `.ui-scrollbar`
 *    上(允许伪元素),不引用元素,id 或别的组件类;取值只来自 token,没有
 *    颜色字面量.把其余样式表全删掉,这一份仍然成立.
 * 2. **不耦合**:库的其他样式表里没有任何 `.ui-scrollbar` 规则,库的组件也
 *    不产出这个类 -- 唯一的接触面是消费方自己往滚动容器上加的类名.
 *
 * 另有两条形式断言:`exports` 能单独引到它,总入口 `styles.css` 也带它.
 *
 * 为什么值得一条测试:这条规定的价值全在"独立"上.一旦有人把它的规则挪进
 * `widgets.css`,或让某个组件顺手引用 `.ui-scrollbar`,它就从"库提供的一种
 * 规定"退化成"某个组件的附属样式",消费方要么被迫接受组件耦合,要么抄一份.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const STYLES = join(ROOT, 'styles');
const SCROLLBAR = join(STYLES, 'scrollbar.css');
const CLASS = 'ui-scrollbar';

function stripComments(css: string): string {
    return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 一份 CSS 里的选择器(逗号分组拆开,注释去掉,at-rule 跳过). */
function selectorsOf(css: string): string[] {
    return [...stripComments(css).matchAll(/([^{}]+)\{/g)]
        .map((match) => match[1].replace(/\s+/g, ' ').trim())
        .filter((selector) => selector !== '' && !selector.startsWith('@'))
        .flatMap((selector) => selector.split(',').map((part) => part.trim()))
        .filter(Boolean);
}

describe('滚动条:单独的一条规定', () => {
    const css = readFileSync(SCROLLBAR, 'utf8');

    it('每条选择器都只挂在 .ui-scrollbar 上(伪元素除外)', () => {
        const offenders = selectorsOf(css).filter(
            // 伪元素用 `::` 起头:`:where(.ui-scrollbar)::-webkit-scrollbar-thumb:hover`
            // 的基础部分必须正好是 `:where(.ui-scrollbar)`.
            (selector) => selector.split('::')[0].trim() !== `:where(.${CLASS})`,
        );
        expect(
            offenders,
            '滚动条规定只能挂在 .ui-scrollbar 上;引用元素/id/组件类就是从"独立规定"退化成耦合',
        ).toEqual([]);
    });

    it('取值只来自 token:没有颜色字面量', () => {
        const offenders = [
            ...stripComments(css).matchAll(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g),
        ].map((match) => match[0]);
        expect(
            offenders,
            '颜色必须走 var(--...);默认值只写在 styles/tokens.css,组件里不留第二份',
        ).toEqual([]);
    });

    it('库的其他样式表里没有它的规则(不耦合)', () => {
        const others = readdirSync(STYLES).filter(
            (name) => name.endsWith('.css') && name !== 'scrollbar.css',
        );
        const offenders = others.filter((name) =>
            selectorsOf(readFileSync(join(STYLES, name), 'utf8')).some((selector) =>
                selector.includes(CLASS),
            ),
        );
        expect(
            offenders,
            '这些样式表里给 .ui-scrollbar 写了规则:它属于 scrollbar.css 一处',
        ).toEqual([]);
    });

    it('可以单独引(`exports`),也在总入口里', () => {
        const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
            exports: Record<string, string>;
        };
        expect(pkg.exports['./styles/scrollbar.css']).toBe('./styles/scrollbar.css');
        expect(readFileSync(join(STYLES, 'styles.css'), 'utf8')).toContain(
            '@import "./scrollbar.css"',
        );
    });
});
