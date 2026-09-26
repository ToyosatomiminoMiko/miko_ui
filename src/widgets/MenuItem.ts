/**
 * 浮层菜单项(`<button type="button" role="menuitem">`).
 *
 * **为什么在库里**:`Popover` 只负责开合 / aria / 点外部关闭,面板内容归消费者
 * (见 `widgets/Popover.ts` 的"不负责的").可"菜单项长什么样"于是每个消费者都要
 * 重写一遍,而它本来就是**按钮** -- 可聚焦,Enter/Space 触发,要禁用态,要按钮
 * 基线 -- 写第二遍必错.这一份把它收进来:外观只有库里这一份
 * (`styles/widgets.css` 的 `.menu-item`),消费者只给内容,位置与"点了干什么".
 *
 * 一个菜单项 = 主文案 + **可选**的右侧注记(如示例页的文件名).主文案是按钮
 * 自己的文本节点,注记才需要一个盒子(它要贴右,用弱色小字),所以只有它是
 * 单独的 `<span class="menu-item-hint">`.
 *
 * **放在哪由消费者决定**,本件不认识任何具体触发点:
 * - **直接显示**:摆进一个常驻的 `role="menu"` 面板;
 * - **浮层触发**:塞进 `createPopover` 的面板,触发按钮可以是任意元素(库示例页
 *   用的就是一颗普通按钮).下游拿它做的"窗口标题栏按钮触发"只是后一种的一个
 *   调用点,不是它的前提.
 *
 * `role="menuitem"` 假定它被放在 `role="menu"` 的面板里.面板与分组的外观也在
 * 库里,本件只管"一行":`styles/widgets.css` 的 `.menu-panel`(表面)/ `.menu-group`
 * 与 `.menu-group-title`(分组)/ `.menu-item` 与 `.menu-item-hint`(行).摆在哪则
 * 由消费者的两条类名决定 -- `.menu-panel` 单独用是常驻,`.menu-anchor` +
 * `.menu-popover`(开合是 `Popover` 写的 `.is-open`)是浮层.键盘也不在这里,
 * 而且不在库里:菜单不做上下键 / Esc,本件只保证自己是一颗可聚焦的按钮
 * (Enter/Space 由浏览器给);要键盘行为由应用侧自己接.
 *
 * 与 `createButton` 一致:选项只描述**外观**,点击回调在拿到句柄后用
 * `onClick(listener)` 注册;`data-*` 之类的消费者标记直接写在 `element` 上.
 */
import { createButton, type ButtonHandle } from './Button';
import { create_element } from './dom';

export interface MenuItemOptions {
    /** 主文案(可见;不给 `ariaLabel` 时也是可访问名). */
    text: string;
    /** 右侧注记(弱色小字,可选):如"这条属于哪个文件". */
    hint?: string;
    /** 当前项:持续可见的左侧标记(`.is-active`),与悬停 / 焦点无关. */
    active?: boolean;
    ariaLabel?: string;
    title?: string;
    disabled?: boolean;
}

export interface MenuItemHandle {
    readonly element: HTMLButtonElement;
    /** 注册点击回调;返回退订函数(与 `createButton` 同款). */
    onClick(listener: () => void): () => void;
    /** 切"当前项"标记(`.is-active` + `aria-current`);换当前项时由消费者切. */
    setActive(active: boolean): void;
    dispose(): void;
}

/** 当前项类名;样式在 `styles/widgets.css` 的 `.menu-item.is-active`. */
const ACTIVE_CLASS = 'is-active';

export function createMenuItem(options: MenuItemOptions): MenuItemHandle {
    // 走 `createButton` 而不是自己 `create_element({ tag: 'button' })`:基线类
    // `.ui-button`,`type="button"`,点击分发与 `dispose` 都复用同一套,菜单项
    // 只是在它上面叠一个外观变体类 `.menu-item`(基线是零优先级的
    // `:where(.ui-button)`,所以加载顺序不影响谁赢).
    const button: ButtonHandle = createButton({
        class: 'menu-item',
        text: options.text,
        ariaLabel: options.ariaLabel,
        title: options.title,
        disabled: options.disabled,
    });
    const { element } = button;

    // 语义由控件给定:它被放进 `role="menu"` 的面板(面板由消费者建,见
    // `createPopover`).
    element.setAttribute('role', 'menuitem');

    if (options.hint !== undefined) {
        // 注记是第二个 flex 子项;`.menu-item` 的 `justify-content: space-between`
        // 负责把它推到行右端,不需要消费者写任何布局.
        element.append(create_element({ tag: 'span' }, { class: 'menu-item-hint' }, options.hint));
    }

    /**
     * 当前项标记的**唯一写入点**:类名(样式)与 `aria-current`(语义)一起切.
     *
     * 两处不能分家:只看类名,读屏不知道"这是当前项";只写 `aria-current`,
     * 视觉上又看不出来.下游手写菜单时正是这两条各写一遍,才容易漏掉一条.
     */
    const applyActive = (active: boolean): void => {
        element.classList.toggle(ACTIVE_CLASS, active);
        if (active) element.setAttribute('aria-current', 'true');
        else element.removeAttribute('aria-current');
    };
    applyActive(options.active === true);

    return {
        element,
        onClick: button.onClick,
        setActive: applyActive,
        dispose: button.dispose,
    };
}
