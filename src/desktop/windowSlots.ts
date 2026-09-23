/**
 * `windowSlotsProvider` -- 把采用表解析成"按窗口分组的标题栏槽位节点".
 *
 * 库不认识"示例按钮/RUN"是什么;它只认识两件东西:
 * - 一张采用表(`{ node, window, slot }[]`,来自消费者的配置);
 * - 一张具名节点表(消费者用 `create_element()` 建好的现成节点).
 *
 * 表只读一次并按窗口分组,于是"哪个节点进哪个窗口的哪个槽"没有分支:加一个
 * 标题栏节点 = 加一行配置 + 建一个节点.
 *
 * 泛型 `Node` 由消费者给(应用侧是它自己的 `ChromeNodeId`):采用表里的名字与
 * 节点表的键由同一份类型锁死,少建一个节点即编译不过.
 */
import type { WindowContent } from './WindowManager';
import type { AdoptedNodeSpec, WindowId } from './types';

export function windowSlotsProvider<Node extends string>(
    adopted: readonly AdoptedNodeSpec<Node>[],
    chrome: Readonly<Record<Node, HTMLElement>>,
): (id: WindowId) => WindowContent {
    const byWindow = new Map<WindowId, {
        title: HTMLElement[];
        actions: HTMLElement[];
        overlays: HTMLElement[];
    }>();
    for (const { node, window: id, slot } of adopted) {
        let slots = byWindow.get(id);
        if (!slots) {
            slots = { title: [], actions: [], overlays: [] };
            byWindow.set(id, slots);
        }
        slots[slot].push(chrome[node]);
    }
    return (id) => byWindow.get(id) ?? {};
}
