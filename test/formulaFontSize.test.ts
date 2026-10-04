/**
 * 公式字号的机器守卫:`--katex-font-size` 要真的生效,只有一条路 -- 库自己写一条
 * **特异度高于 KaTeX 自带样式**的规则.
 *
 * 为什么值得单独守:KaTeX 自带 `.katex { font: normal 1.21em KaTeX_Main, ... }` 是
 * (0,1,0),而 `katex.min.css` 由库引在消费侧样式**之前**.于是:
 * - 消费侧写 `.katex { font-size: var(--katex-font-size) }` 与它同特异度,只能比先后,
 *   必输 -- 令牌静默空转(下游实测:应用规则在产物 ~18.7KB 处,KaTeX 自带在
 *   ~34.5KB 处);
 * - 库自己若把这条规则写成单类,或按本库其它基线类的习惯写成 `:where(...)`
 *   (特异度清零),会掉进同一个坑,而且症状是"字号只是没变大",没人会注意.
 *
 * 所以这里把三件事一起钉住:选择器里有**库自有的类**,有 `.katex`(即 0,2,0),
 * 不包 `:where(`,并且那个库类就是 `createFormulaElement` 真正产出的类.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

/** `createFormulaElement` 产出的基线类(TS 与 CSS 之间的契约,两边都必须写它). */
const LIBRARY_FORMULA_CLASS = 'ui-formula';

function stripComments(css: string): string {
    return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** `styles/widgets.css` 里读 `--katex-font-size` 的那条规则(选择器 + 声明块). */
function fontSizeRule(): { selector: string; body: string } {
    const css = stripComments(readFileSync(join(ROOT, 'styles', 'widgets.css'), 'utf8'));
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .map((match) => ({ selector: match[1].trim(), body: match[2] }))
        .filter((rule) => rule.body.includes('var(--katex-font-size)'));
    expect(rules.length, 'widgets.css 里应当恰好有一条读 --katex-font-size 的规则').toBe(1);
    return rules[0];
}

describe('公式字号:库消费自己的令牌', () => {
    it('`--katex-font-size` 有唯一的消费点,且选择器是 0,2,0(压过 KaTeX 自带)', () => {
        const rule = fontSizeRule();

        expect(rule.body).toContain('font-size: var(--katex-font-size)');
        // 库自有的类 + KaTeX 的类 = 两个类(0,2,0) > KaTeX 自带的 (0,1,0).
        expect(rule.selector).toContain(`.${LIBRARY_FORMULA_CLASS}`);
        expect(rule.selector).toContain('.katex');
        // `:where(...)` 会把特异度清零,回到"只比先后"的必输局.
        expect(rule.selector).not.toContain(':where(');
    });

    it('`createFormulaElement` 产出的基线类与 CSS 里写的那个是同一个', () => {
        const source = readFileSync(join(ROOT, 'src', 'formula', 'FormulaView.ts'), 'utf8');

        // 只认"赋值/常量"这两种产出写法,不认注释里提到的类名.
        expect(source).toContain(`const FORMULA_CLASS = '${LIBRARY_FORMULA_CLASS}';`);
        expect(source).toContain('`${FORMULA_CLASS} ${className}`');
    });
});
