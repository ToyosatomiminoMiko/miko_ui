/**
 * 主题入口:把一组 CSS 变量写到给定根元素上.
 *
 * 这里**不含任何"这个应用长什么样"的知识**:默认值是一份可覆盖的通用基线,
 * 具体值由消费者算好后传进来.库的样式只消费 `var(--...)`,所以"改主题"=
 * 换一份 token 表,不是改组件.
 *
 * 单一来源约定:`styles/tokens.css` 的 `:root` 是**默认值**的唯一副本,JS 只在
 * 需要**覆盖**时才写;`DEFAULT_THEME_TOKENS` 是其中"库组件自己要用"的那几个量
 * 的 JS 侧镜像,给"没有加载 CSS 的测试/示例"用.两者的值必须一致:
 * `--window-header-height` 与 `--dock-reserve` 由 `theme/tokens.test.ts` 直接读
 * `styles/tokens.css` 守住.
 */

/** 一组 CSS 变量名 -> 值. */
export type ThemeTokens = Readonly<Record<string, string>>;

/**
 * 库的默认 token.
 *
 * 与 `styles/tokens.css` 的 `:root` 兜底保持同值(值改了要同步那两处).只放
 * "库的组件自己要用"的排版与尺寸量;颜色板属于消费者主题,不在库的默认面里.
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
    /**
     * 桌面外壳的两个尺寸:运行期由 `mountDesktop()` 按 `DesktopConfig`
     * (`dockReserve` / `headerHeight`)写到桌面根的行内变量上,这里只是
     * "没有 JS / 纯 CSS"时的兜底值,必须与 `DEFAULT_DESKTOP_CONFIG` 一致.
     */
    '--window-header-height': '36px',
    '--dock-reserve': '40px',
};

/**
 * 把 token 写成根元素上的行内 CSS 变量.
 *
 * 传 `HTMLElement` 而不是 `Document`:`document.documentElement` 由调用方给,
 * 库不读全局 `document`.写在一个容器上同样生效(CSS 变量沿继承树下发),所以
 * "同页两个实例各自换主题"也不需要第二套机制.
 */
export function applyTheme(root: HTMLElement, tokens: ThemeTokens = DEFAULT_THEME_TOKENS): void {
    for (const [name, value] of Object.entries(tokens)) {
        root.style.setProperty(name, value);
    }
}
