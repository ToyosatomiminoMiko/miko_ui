/**
 * 主题入口:把一组 CSS 变量写到给定根元素上.
 *
 * 这里**不含任何"这个应用长什么样"的知识**:默认值是一份可覆盖的通用基线,
 * 具体值由消费者算好后传进来(docs/ui-library-extraction-plan.md U6/D4).
 * 库的样式只消费 `var(--...)`,所以"改主题"= 换一份 token 表,不是改组件.
 *
 * 单一来源约定(见计划附录 C2):最终形态里 `styles/tokens.css` 的 `:root` 是
 * **默认值**的唯一副本,JS 只在需要**覆盖**时才写;`DEFAULT_THEME_TOKENS` 是
 * 同一份默认值的 JS 侧镜像,给"没有加载 CSS 的测试/示例"用.两者的值必须一致,
 * 由 `theme/tokens.test.ts` 守(等 D8 分家后由它直接读 `styles/tokens.css`).
 */

/** 一组 CSS 变量名 -> 值. */
export type ThemeTokens = Readonly<Record<string, string>>;

/**
 * 库的默认 token.
 *
 * 口径与 `css/base.css` 的 `:root` 兜底一致:值改了要同步那两处(D8 之后
 * 只剩 `styles/tokens.css` 一处).只放"库的组件自己要用"的排版与尺寸量;
 * 颜色板属于应用主题,不在库的默认面里.
 */
export const DEFAULT_THEME_TOKENS: ThemeTokens = {
    '--code-font-family': "'JetBrains Mono Slashed', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    '--code-font-size': '16px',
    '--code-line-height': '1.2',
    '--code-tab-size': '4',
    '--katex-font-size': '1.5em',
    '--code-gutter-width': '32px',
    '--params-panel-min-height': '120px',
    '--view-controls-min-height': '120px',
    '--window-header-height': '36px',
    '--dock-reserve': '100px',
};

/**
 * 把 token 写成根元素上的行内 CSS 变量.
 *
 * 传 `HTMLElement` 而不是 `Document`:库不碰全局 `document`(§9 断言 2),
 * `document.documentElement` 由调用方给.写在一个容器上同样生效(CSS 变量
 * 沿继承树下发),所以"同页两个实例各自换主题"也不需要第二套机制.
 */
export function applyTheme(root: HTMLElement, tokens: ThemeTokens = DEFAULT_THEME_TOKENS): void {
    for (const [name, value] of Object.entries(tokens)) {
        root.style.setProperty(name, value);
    }
}
