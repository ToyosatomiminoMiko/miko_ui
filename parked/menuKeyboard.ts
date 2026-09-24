/**
 * 菜单键盘支持(上下键回绕 + Esc 关浮层)-- **搁置,没有调用点**.
 *
 * 库现在的立场是**不负责键盘**:`createMenu` 只做结构 / 开合 / 选中,不注册任何
 * 键盘规则(见 `src/widgets/Menu.ts` 文件头的"键盘:一件都不做").这里留着的是
 * 移除前的那份实现,原样搬出 `src/`,供以后真要给菜单接键盘时参考或复活.
 *
 * 为什么放在仓库根而不是 `src/`:见本目录的 `README.md` -- 这个目录不参与
 * 类型检查,不进产物,不跑测试,也没有任何模块 import 它.它不是 API,也不是
 * "保证能用"的实现.
 */
import type { KeyboardBinding } from '../src/shared/KeyboardController';
import type { MenuHandle } from '../src/widgets/Menu';

export interface MenuKeyboardHandle {
    /** 交给 `KeyboardController.register` 的键盘规则. */
    readonly bindings: readonly KeyboardBinding[];
    /** 退订"开合复位";应用 dispose 时调. */
    dispose(): void;
}

/**
 * 给一份菜单接上键盘:上下键在项间移动并回绕,Esc 关浮层并把焦点交还触发元素.
 *
 * 与浮层的分工照旧:菜单关着时两条规则都返回 null,把按键放行给页面.
 * "这份菜单有没有浮层"由面板上的 `.menu-popover` 类判定 -- 那是 `createMenu`
 * 给带 `trigger` 的面板叠的(库自己的约定,见 `styles/widgets.css`).
 */
export function menuKeyboard<T>(menu: MenuHandle<T>): MenuKeyboardHandle {
    const isPopover = menu.panel.classList.contains('menu-popover');
    /** 当前拥有焦点的菜单项下标;-1 表示焦点还在触发元素上. */
    let activeIndex = -1;
    const unsubscribe = menu.onOpenChange(() => {
        activeIndex = -1;
    });

    /**
     * 上下键导航.焦点还在触发元素上(`activeIndex = -1`)时,向下进第一项,向上
     * 进最后一项 -- 这是菜单按钮的通行行为,少了这一步第一次按向下会跳过第一项.
     * 到头回绕.
     */
    const moveFocus = (delta: number): void => {
        const { items } = menu;
        if (items.length === 0) return;
        activeIndex = activeIndex < 0
            ? (delta > 0 ? 0 : items.length - 1)
            : (activeIndex + delta + items.length) % items.length;
        items[activeIndex].element.focus();
    };

    /**
     * 这次按键归不归本菜单:浮层看开合态;常驻面板看焦点是否已在面板里
     * (它一直在屏幕上,否则页面上的上下键会被它全部吃掉).
     */
    const ownsKey = (event: KeyboardEvent): boolean => {
        if (isPopover) return menu.isOpen;
        const target = event.target;
        return target instanceof Element && menu.panel.contains(target);
    };

    const bindings: KeyboardBinding[] = [
        {
            keys: ['ArrowDown', 'ArrowUp'],
            // 菜单关着时放行:上下键在别处(如 select,列表滚动)还有自己的语义.
            resolve: (event) => {
                if (!ownsKey(event)) return null;
                return () => moveFocus(event.key === 'ArrowDown' ? 1 : -1);
            },
        },
    ];
    if (isPopover) {
        bindings.push({
            keys: ['Escape'],
            resolve: () => (menu.isOpen ? () => menu.close({ focusTrigger: true }) : null),
        });
    }

    return { bindings, dispose: unsubscribe };
}
