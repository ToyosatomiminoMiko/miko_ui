/**
 * 主题入口:把一组 CSS 变量写到给定根元素上.
 *
 * 默认值由 `styles/tokens.css` 的`:root` 一层给出,库的样式只消费
 * `var(--...)`,所以"改主题"= 在那一层之上覆盖,不是改组件.
 *
 * 单一来源:默认值只有 `styles/tokens.css` 一处
 * 字体度量走渲染后的 `getComputedStyle`,`--window-header-height` /
 * `--dock-reserve` 由 `WindowManager._writeShellVars` 按 `DesktopConfig` 写.
 * 于是它退化成了第二份默认值(且只有 2/8 被断言钉住) -- 2026-10 删除,见
 * `theme/tokens.test.ts` 里保留的那条外壳尺寸契约.
 */

/** 一组 CSS 变量名 -> 值. */
export type ThemeTokens = Readonly<Record<string, string>>;

/**
 * 把 token 写成根元素上的行内 CSS 变量.
 *
 * 传 `HTMLElement` 而不是 `Document`:`document.documentElement` 由调用方给,
 * 库不读全局 `document`.写在一个容器上同样生效(CSS 变量沿继承树下发),所以
 * "同页两个实例各自换主题"也不需要第二套机制.
 *
 * `tokens` 必填,没有默认表:传空表就是空操作,而"要库的默认外观"由加载
 * `styles/tokens.css` 负责 -- 默认值没有第二份可抄(见文件头).
 */
export function applyTheme(root: HTMLElement, tokens: ThemeTokens): void {
    for (const [name, value] of Object.entries(tokens)) {
        root.style.setProperty(name, value);
    }
}
