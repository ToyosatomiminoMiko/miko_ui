/**
 * Dock(顶部任务栏):窗口按钮组 + 桌面动作区.
 *
 * 普通任务栏:`.dock` 本身就是紧贴桌面上沿的那条通栏带(背景,下沿分隔线与
 * 内边距都在它身上),窗口按钮组与桌面动作区是它的直接子节点.它的高度就是
 * 配置里的 `dockReserve`,同时是窗口工作区的上沿(见 `WindowGeometry`).
 *
 * 两类按钮,装配方式不同:
 * - **窗口按钮**由窗口清单生成(构造参数 `windows`),顺序与清单一致.点击语义
 *   (提升/最小化/还原/复位)由 `WindowManager` 按状态分派,本模块只负责装配
 *   (每枚都走 `createButton`,文案取 `dock.label`,`title` 取窗口 `title`),
 *   上报点击(`handlers.onSelect`),写入激活态(`.is-active` 与 `aria-pressed`)
 *   与隐藏态(`data-state`,CSS 按它淡化);
 * - **动作区**由消费者动作(构造参数 `actions`,声明见 `types.ts` 的
 *   `DockActionSpec`)+ 库的「全部还原」组成:消费者动作按清单顺序排在前面,
 *   「全部还原」固定在最后.本模块只按同一条 `createButton` 装配并上报
 *   `handlers.onAction`,不认识任何一个动作是什么 -- 这是"任务栏可以有应用级
 *   动作"的正式入口,消费者不再往 `.dock-actions` 里塞现成节点.
 *
 * 为什么不把按钮写死在标记里:加一个窗口要改两处(标记与清单)就会漂移,而
 * "清单是唯一真相源"是硬约束.
 */
import { type DockActionSpec, type WindowConfigEntry, type WindowId, type WindowState } from './types';
import { createButton } from '../widgets/Button';
import { create_element } from '../widgets/dom';

/** 任务栏上的点击上报:窗口按钮 / 消费者动作 / 库的全局复位各一条. */
export interface DockHandlers {
    /** 点击某个窗口的 Dock 按钮;按状态分派由 `WindowManager` 做. */
    onSelect(id: WindowId): void;
    /** 把所有窗口复位到默认几何(动作区最后一枚「全部还原」). */
    onRestoreAll(): void;
    /** 点击某一枚消费者动作;`id` 原样来自 `DockActionSpec`. */
    onAction?(id: string): void;
}

export interface DockButtonHandle {
    setActive(active: boolean): void;
    /**
     * 写 `data-state`:CSS 只按它淡化最小化的按钮(`opacity`).
     * 状态只由按钮自身表达:
     * 隐藏态看本方法的 `data-state`, 聚焦态看 `setActive`.
     */
    setState(state: WindowState): void;
}

export interface DockHandle {
    readonly buttons: ReadonlyMap<WindowId, DockButtonHandle>;
    /** 只让当前焦点窗口的按钮亮起;`null` = 一个都不亮. */
    setActive(id: WindowId | null): void;
    dispose(): void;
}

/**
 * 建 Dock(内容整体替换 `container` 的现有子节点).
 *
 * `container` 就是 `.dock` 本身:任务栏的背景/边框/内边距都在它身上,这里只
 * 往里放两个直接子节点--窗口按钮组与桌面动作区.
 *
 * `actions` 是消费者声明的任务栏动作(见 `types.ts` 的 `DockActionSpec`):按钮由
 * 本函数建,顺序即显示顺序,整组排在库的「全部还原」左边.缺省是空清单(动作区
 * 只剩库的「全部还原」).
 */
export function createDock(
    container: HTMLElement,
    windows: readonly WindowConfigEntry[],
    handlers: DockHandlers,
    actions: readonly DockActionSpec[] = [],
): DockHandle {
    const buttons = new Map<WindowId, DockButtonHandle>();

    const group = create_element({ tag: 'div' }, { class: 'dock-group' });
    for (const spec of windows) {
        // 按钮统一走 `createButton`:`type="button"` 与 `.ui-button` 基线都归它,
        // `dock-btn` 只是定位 / 状态钩子(见 styles/desktop.css).
        const button = createButton({
            class: 'dock-btn',
            text: spec.dock.label,
            title: spec.title,
        });
        button.element.setAttribute('data-window', spec.id);
        button.element.setAttribute('aria-pressed', 'false');
        button.onClick(() => handlers.onSelect(spec.id));

        buttons.set(spec.id, {
            setActive: (active: boolean) => {
                button.element.classList.toggle('is-active', active);
                button.element.setAttribute('aria-pressed', String(active));
            },
            setState: (state: WindowState) => {
                button.element.setAttribute('data-state', state);
            },
        });
        group.append(button.element);
    }

    /*
      动作区的两类按钮走同一条 `createButton`:消费者动作用 `dock-action` 这个
      定位钩子(外观仍吃 `.ui-button` 基线),`data-dock-action` 写它们的 `id` /
      `restore-all`,点击只上报 id -- 库不认识任何一个动作的语义.
    */
    const actionButtons = actions.map((spec) => {
        const button = createButton({ class: 'dock-action', text: spec.text, title: spec.title });
        button.element.setAttribute('data-dock-action', spec.id);
        button.onClick(() => handlers.onAction?.(spec.id));
        return button.element;
    });

    const restoreAll = createButton({ class: 'dock-action', text: '全部还原' });
    restoreAll.element.setAttribute('data-dock-action', 'restore-all');
    restoreAll.onClick(() => handlers.onRestoreAll());

    // 顺序即显示顺序:消费者动作在前,库的「全部还原」固定在最后(见 `DockActionSpec`).
    const actionsEl = create_element(
        { tag: 'div' },
        { class: 'dock-actions' },
        ...actionButtons,
        restoreAll.element,
    );
    container.replaceChildren(group, actionsEl);

    // 初始状态走与运行期同一条路径(`setState`),不在这里另写一份 `data-state`:
    // 两处初始化就是"改一处漏一处"的起点.
    for (const spec of windows) {
        buttons.get(spec.id)!.setState('normal');
    }

    return {
        buttons,
        setActive(id: WindowId | null) {
            for (const [buttonId, button] of buttons) button.setActive(buttonId === id);
        },
        dispose() {
            // 按钮上的 click 监听随元素一起丢弃(节点由 replaceChildren 移除);
            // 这里只清状态,避免 dispose 之后再被外部引用到.
            buttons.clear();
            container.replaceChildren();
        },
    };
}
