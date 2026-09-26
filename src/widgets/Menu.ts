/**
 * 菜单:分组 + 菜单项 + 当前项 + 开合.
 *
 * **为什么在库里**:下游的「示例」菜单在分家前是手写的 -- 把数据摆成
 * `role="menu"` 的树,按分组套 `role="group"` 与组标题,记一个"当前项".
 * `Popover` 只吃掉开合 / aria / 点外部关闭,`MenuItem` 只吃掉"一行",夹在中间
 * 的这一层于是每个消费者都要重写一遍:写第二遍必错,所以也收进来.
 *
 * 它**不认识**的:菜单业务(选中之后干什么,由 `onSelect` 给出),面板长什么样
 * (样式在 `styles/widgets.css` 的 `.menu-panel*`),以及"谁把面板搬进窗口标题栏"
 * (`WindowFrame` 的 overlays 槽位 / `windowSlotsProvider`;下游正是这么挂的).
 *
 * ## 两种用法
 * - **直接显示**:不给 `trigger`,面板常驻在正文里;
 * - **按钮触发**:给 `trigger`,本件自己建 `Popover`,并把面板叠上 `.menu-popover`.
 *   触发元素**是任意元素**:下游用的是窗口标题栏按钮,但那只是调用点之一,
 *   不是本件的前提.
 *
 * ## 选中与当前项
 * `onSelect(listener)` 拿到的是一条菜单项的 `value`(消费者自己的载荷,如文件名),
 * 浮层**先关再回调**(回调若抛错,浮层也不会僵在屏幕上).`setActive(value)` 只标
 * 当前项(持续高亮 + `aria-current`),不参与选中逻辑.
 *
 * ## 键盘:一件都不做
 * 本件**不注册任何键盘规则**,也不做上下键导航:菜单的键盘行为不是这个库
 * 负责的事(`KeyboardController` 只是给应用用的路由出口,库自己不往里塞行为).
 * 菜单项本身是 `<button>`:可聚焦,Enter/Space 触发是浏览器给的.要上下键回绕 /
 * Esc 收焦点这类行为,由应用侧自己接;移除前的实现(含 Esc)留在库仓库根的
 * `parked/menuKeyboard.ts`(不进产物,没有调用点),只作留档.
 */
import { createMenuItem, type MenuItemHandle } from './MenuItem';
import { createPopover, type PopoverHandle } from './Popover';
import { create_element, nextWidgetId } from './dom';

/** 一条菜单项:主文案 + 可选注记 + 选中回调的载荷. */
export interface MenuEntry<T> {
    /** 选中回调回传的载荷(消费者自己的标识,如示例文件名). */
    readonly value: T;
    readonly text: string;
    /** 右侧注记(弱色小字). */
    readonly hint?: string;
    readonly disabled?: boolean;
}

/** 一个分组:组标题 + 若干菜单项;组间由样式画分隔线. */
export interface MenuGroup<T> {
    readonly title: string;
    readonly entries: readonly MenuEntry<T>[];
}

export interface MenuOptions<T> {
    readonly groups: readonly MenuGroup<T>[];
    /** 面板的无障碍名(`role="menu"` 的 `aria-label`). */
    readonly ariaLabel?: string;
    /**
     * 触发元素.给了就建 `Popover`(面板叠 `.menu-popover`,开合 / aria /
     * 点外部关闭都归它);不给了就是常驻显示的面板.
     */
    readonly trigger?: HTMLElement;
    /**
     * 已有的面板容器(如窗口标题栏槽位里的浮层节点):**原样使用**,不重建.
     * 不给了就自己建一个.
     */
    readonly panel?: HTMLElement;
}

export interface MenuHandle<T> {
    /** 面板(`.menu-panel`),插进容器 / 交给窗口槽位用这个. */
    readonly panel: HTMLElement;
    /** 全部菜单项,按渲染顺序. */
    readonly items: readonly MenuItemHandle[];
    /** 浮层是否打开;没有 `trigger`(常驻面板)时恒为 true. */
    readonly isOpen: boolean;
    open(): void;
    /** 关闭;`focusTrigger` 为真时把焦点交还触发元素(留给需要收焦点的调用方). */
    close(options?: { focusTrigger?: boolean }): void;
    toggle(): void;
    /** 注册开合回调;返回退订函数. */
    onOpenChange(listener: (open: boolean) => void): () => void;
    /** 注册选中回调(载荷是菜单项的 `value`);返回退订函数. */
    onSelect(listener: (value: T) => void): () => void;
    /** 标记当前项;`null` 表示全部取消标记. */
    setActive(value: T | null): void;
    /** 把"点外部关闭"挂到根节点(有 `trigger` 时);可反复调用. */
    bind(root: HTMLElement): void;
    /** 关浮层并解绑全部菜单项. */
    dispose(): void;
}

export function createMenu<T>(options: MenuOptions<T>): MenuHandle<T> {
    const panel = options.panel ?? create_element({ tag: 'div' });
    // 面板与角色由本件写全:注入的容器不必自己记得带类名.
    panel.classList.add('menu-panel');
    panel.setAttribute('role', 'menu');
    if (options.ariaLabel !== undefined) panel.setAttribute('aria-label', options.ariaLabel);
    // `Popover` 靠面板 id 建立 `aria-controls`,而它在构造时就写死;id 因此必须
    // 在**建 Popover 之前**就有.没给就自己发一个(只服务标签关联,见 `nextWidgetId`).
    if (panel.id === '') panel.id = nextWidgetId('menu');

    const selectListeners = new Set<(value: T) => void>();
    const openListeners = new Set<(open: boolean) => void>();

    const items: MenuItemHandle[] = [];
    const values: T[] = [];
    /** `values` 与 `items` 一一对应:菜单项句柄只认外观,载荷由本件保管. */
    const indexOf = (value: T): number => values.findIndex((candidate) => Object.is(candidate, value));

    const groups = options.groups.map((group) => {
        const element = create_element(
            { tag: 'div' },
            { class: 'menu-group', role: 'group', 'aria-label': group.title },
            create_element({ tag: 'div' }, { class: 'menu-group-title' }, group.title),
        );
        for (const entry of group.entries) {
            const item = createMenuItem({
                text: entry.text,
                hint: entry.hint,
                disabled: entry.disabled,
            });
            item.onClick(() => {
                // 先关再回调:回调若抛错,浮层也不会僵在屏幕上(下游同款顺序).
                popover?.close();
                for (const listener of [...selectListeners]) listener(entry.value);
            });
            items.push(item);
            values.push(entry.value);
            element.append(item.element);
        }
        return element;
    });
    panel.replaceChildren(...groups);

    // `Popover` 只在给了触发元素时才有;常驻面板不开合,它的四个方法因此是空操作.
    const popover: PopoverHandle | null = options.trigger
        ? createPopover({ trigger: options.trigger, panel })
        : null;
    if (popover) {
        panel.classList.add('menu-popover');
        popover.onOpenChange((open) => {
            for (const listener of [...openListeners]) listener(open);
        });
    }

    return {
        panel,
        items,
        get isOpen() {
            return popover ? popover.isOpen : true;
        },
        open() {
            popover?.open();
        },
        close(closeOptions) {
            popover?.close(closeOptions);
        },
        toggle() {
            popover?.toggle();
        },
        onOpenChange(listener) {
            openListeners.add(listener);
            return () => openListeners.delete(listener);
        },
        onSelect(listener) {
            selectListeners.add(listener);
            return () => selectListeners.delete(listener);
        },
        setActive(value) {
            const active = value === null ? -1 : indexOf(value);
            items.forEach((item, index) => item.setActive(index === active));
        },
        bind(root) {
            popover?.bind(root);
        },
        dispose() {
            popover?.dispose();
            for (const item of items) item.dispose();
            selectListeners.clear();
            openListeners.clear();
        },
    };
}
