/**
 * 表单控件的字体契约:**控件不吃 `font` 的继承**.
 *
 * UA 样式表给 `<input>` / `<button>` / `<textarea>` 自己的 font(Chrome 上是 Arial
 * 13.3px 那一套),所以库的样式表只要漏写一条 `font-family`,那个控件就会静默用
 * 浏览器默认字体:旁边的按钮,读数,标签都跟着页面字体走,只有它是另一个字体 --
 * 不报错,也没人会想到去查 CSS.
 *
 * 这里把"库产出的,会显示文字的控件"列成清单,逐个要求它显式声明 `font-family`
 * (值可以是 `inherit`,也可以是某个 token -- 这条只管"声明过").
 *
 * 为什么是显式清单而不是扫 `input` / `button` 字样:`slider-field-value` 这个类名
 * 里没有 input,真身却是 `<input type="number">`;反过来 `.switch input` 是个
 * `display: none` 的 checkbox,`.slider-field-range` 只画轨道不显示文字,都不需要
 * 字体.清单因此配一条正控:每项都必须真的能在样式表里找到规则,免得改类名之后
 * 这条测试变成空转.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const STYLES = join(HERE, '..', 'styles');

/** 会显示文字的控件:选择器 -> 它所在的样式表. */
const TEXT_CONTROLS: readonly { selector: string; file: string }[] = [
    { selector: '.slider-field-value', file: 'widgets.css' },
    { selector: '.control-row input[type="number"]', file: 'widgets.css' },
    { selector: '.segmented button', file: 'widgets.css' },
    { selector: '.code-editor-textarea', file: 'editor.css' },
];

function stripComments(css: string): string {
    return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 取某个选择器对应的规则体;`[^}]*` 够用:这些规则里没有嵌套块. */
function ruleBlock(selector: string, file: string): string | null {
    const css = stripComments(readFileSync(join(STYLES, file), 'utf8'));
    const match = new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`).exec(css);
    return match?.[1] ?? null;
}

describe('表单控件的字体契约', () => {
    it('清单里的每个选择器都真的在样式表里(断言本身没写坏)', () => {
        expect(TEXT_CONTROLS.length).toBeGreaterThanOrEqual(4);
        const missing = TEXT_CONTROLS
            .filter(({ selector, file }) => ruleBlock(selector, file) === null)
            .map(({ selector, file }) => `${file}: ${selector}`);
        expect(missing, '清单里的选择器在样式表里找不到了(类名/结构改了?)').toEqual([]);
    });

    it('每个会显示文字的控件都显式声明了 font-family', () => {
        const missing = TEXT_CONTROLS
            .filter(({ selector, file }) => !/font-family\s*:/.test(ruleBlock(selector, file) ?? ''))
            .map(({ selector, file }) => `${file}: ${selector}`);
        expect(
            missing,
            '表单控件不继承字体:少了 font-family,这些框会静默退回浏览器默认字体(Arial)',
        ).toEqual([]);
    });
});
