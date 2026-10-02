/**
 * 主题入口:把一组 CSS 变量写到给定根元素上.
 *
 * 默认值只有 `styles/tokens.css` 一处,JS 侧不留镜像:字体度量走渲染后的
 * `getComputedStyle`,`--window-header-height` / `--dock-reserve` 由
 * `WindowManager._writeShellVars` 按 `DesktopConfig` 写.
 */

/** 一组 CSS 变量名 -> 值. */
export type ThemeTokens = Readonly<Record<string, string>>;

/**
 * `tokens` 必填:默认值没有第二份可抄,要库的默认外观就加载 `styles/tokens.css`.
 *
 * 传 `HTMLElement` 而不是 `Document`:根节点由调用方给,库不读全局 `document`;
 * 写在容器上同样生效(CSS 变量沿继承树下发),同页两个实例可各换各的主题.
 */
export function applyTheme(root: HTMLElement, tokens: ThemeTokens): void {
    for (const [name, value] of Object.entries(tokens)) {
        root.style.setProperty(name, value);
    }
}
