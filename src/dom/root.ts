/**
 * DOM 根上下文:库内唯一的"节点建在哪个 document 上 / 全局监听挂在哪"入口.
 *
 * 为什么要有这一层(docs/ui-library-extraction-plan.md D7):组件如果直接读全局
 * `document` / `window`,就默认了"页面上只有我一个实例、我拥有整个页面".这一个
 * 假设同时挡住三件事:同页两个实例、嵌进别人的页面、以及 Shadow DOM 隔离.
 *
 * 口径:
 * - **建节点**走 `rootDocument(root)`.`createElement`/`createTextNode`;
 * - **全局监听**(keydown / resize)挂在所属 `Document` 上(Shadow DOM 里的
 *   键盘事件是 composed 的,会照常到达 document);
 * - **不传 root** 时退回全局 `document` —— 这是给"应用侧只有一个页面实例"
 *   准备的默认值(计划 §9 断言 2 明确把它列为允许的例外);库自己的
 *   `mountDesktop()` 永远显式传 root.
 */
export type DomRoot = Document | ShadowRoot;

/** 鸭子类型判别 Document:`ShadowRoot` 没有 `body`,也不该有. */
function isDocument(root: DomRoot): root is Document {
    return 'body' in root;
}

/**
 * 取 root 所属的 `Document`.
 *
 * 不传 root 时返回全局 `document`(唯一的裸 `document` 引用,只此一处).
 */
export function rootDocument(root: DomRoot | undefined = undefined): Document {
    if (root === undefined) return document;
    return isDocument(root) ? root : root.ownerDocument;
}

/** 取 root 所属的 `window`;没有 `defaultView` 时返回 null(离屏/测试环境). */
export function rootWindow(root: DomRoot | undefined = undefined): Window | null {
    return rootDocument(root).defaultView;
}
