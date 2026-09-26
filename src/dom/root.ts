/**
 * DOM 根上下文:库内唯一的"节点建在哪个 document 上 / 全局监听挂在哪"入口.
 *
 * 为什么要有这一层:组件如果直接读全局 `document` / `window`,就默认了
 * "页面上只有我一个实例,我拥有整个页面".这一个假设同时挡住三件事:
 * 同页两个实例,嵌进别人的页面,以及 Shadow DOM 隔离.
 *
 * 口径:
 * - **建节点**走 `rootDocument(root)`.`createElement`/`createTextNode`;
 * - **全局监听**(keydown / resize)挂在所属 `Document` 上(Shadow DOM 里的
 *   键盘事件是 composed 的,会照常到达 document);
 * - **不传 root** 时退回全局 `document` -- 这是给"应用侧只有一个页面实例"
 *   准备的默认值;库自己的 `mountDesktop()` 永远显式传 root.
 */

/** 可被接受的 document root */
export type DomRoot = Document | ShadowRoot;

/**
 * 取 root 所属的 `Document`.
 *
 * 不传 root 时返回全局 `document`(唯一的裸 `document` 引用,只此一处).
 * Document 有 `body` -> 原样返回
 * ShadowRoot 没有 `body`,也不该有 -> 取它的 ownerDocument
 */
export const rootDocument = (root: DomRoot | undefined = undefined): Document =>
    root === undefined ? document : ('body' in root ? root : root.ownerDocument);

/** 取 root 所属的 `window`;没有 `defaultView` 时返回 null(离屏/测试环境). */
export const rootWindow = (root: DomRoot | undefined = undefined):
    Window | null => rootDocument(root).defaultView;
