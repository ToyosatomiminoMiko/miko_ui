/**
 * `menuKeyboard` 的旧单测 -- **不参与任何门禁**.
 *
 * 这三个用例原来在 `src/widgets/widgets.test.ts` 里(当时测的是 `MenuHandle`
 * 自带的 `keyboardBindings()`).键盘从库的公开面移除时,用例跟着实现一起搬到
 * 这里:vitest 只收 `src/**/*.test.ts`,所以本文件不会被采集;复活步骤见
 * `README.md`.
 */
import { describe, expect, it, vi } from 'vitest';
import { installDomStub, StubElement } from '../test/domStub';
import { create_element } from '../src/widgets/dom';
import { createMenu } from '../src/widgets/Menu';
import { menuKeyboard } from './menuKeyboard';

/** 与 `createMenu` 单测同款的数据形状(含一个禁用项). */
const GROUPS = [
    {
        title: '显示',
        entries: [
            { value: 'grid', text: '显示网格', hint: 'G' },
            { value: 'axes', text: '显示坐标轴', hint: 'A' },
        ],
    },
    {
        title: '操作',
        entries: [
            { value: 'reset', text: '重置视图', hint: 'R' },
            { value: 'export', text: '导出图片', hint: '仅桌面版', disabled: true },
        ],
    },
] as const;

/** 桩元素才有 dispatch/listeners;句柄对外的类型是真 DOM,这里按需下钻. */
function stub(element: unknown): StubElement {
    return element as StubElement;
}

/** 浮层菜单:按钮触发 + 面板挂在同一个根节点下. */
function popoverMenu(): {
    trigger: HTMLElement;
    menu: ReturnType<typeof createMenu<(typeof GROUPS)[number]['entries'][number]['value']>>;
    keyboard: ReturnType<typeof menuKeyboard>;
} {
    installDomStub();
    const root = create_element('div');
    const trigger = create_element('button', {}, '打开菜单');
    root.append(trigger);
    document.body.append(root);

    const menu = createMenu({ groups: GROUPS, trigger });
    root.append(menu.panel);
    menu.bind(root);
    return { trigger, menu, keyboard: menuKeyboard(menu) };
}

describe('menuKeyboard(搁置实现)', () => {
    it('上下键在项间移动并回绕;菜单关着时放行', () => {
        const { trigger, menu, keyboard } = popoverMenu();
        const arrows = keyboard.bindings.find((binding) => binding.keys.includes('ArrowDown'))!;
        // 关着:让给页面(上下键在别处还有语义)
        expect(arrows.resolve({ key: 'ArrowDown', target: menu.panel } as unknown as KeyboardEvent))
            .toBeNull();

        stub(trigger).dispatch('click');
        const focusSpies = menu.items.map((item) => vi.spyOn(stub(item.element), 'focus'));
        const press = (): void => {
            arrows.resolve({ key: 'ArrowDown', target: menu.panel } as unknown as KeyboardEvent)?.();
        };

        // 焦点还在触发按钮上:向下进第一项,再向下逐项走
        press();
        expect(focusSpies[0]).toHaveBeenCalledTimes(1);
        press();
        expect(focusSpies[1]).toHaveBeenCalledTimes(1);
        press();
        press();
        expect(focusSpies[3]).toHaveBeenCalledTimes(1);
        // 到头回绕
        press();
        expect(focusSpies[0]).toHaveBeenCalledTimes(2);
    });

    it('Esc 关闭并把焦点交还触发元素;常驻面板不注册 Esc', () => {
        const { trigger, menu, keyboard } = popoverMenu();
        stub(trigger).dispatch('click');

        const focus = vi.spyOn(stub(trigger), 'focus');
        const escape = keyboard.bindings.find((binding) => binding.keys.includes('Escape'))!;
        escape.resolve({ key: 'Escape', target: menu.panel } as unknown as KeyboardEvent)?.();
        expect(menu.isOpen).toBe(false);
        expect(focus).toHaveBeenCalledTimes(1);

        // 常驻面板没有"关"这回事,也就不该给 Esc 注册一条永远不命中的规则
        const staticMenu = createMenu({ groups: GROUPS });
        expect(menuKeyboard(staticMenu).bindings.some((binding) => binding.keys.includes('Escape')))
            .toBe(false);
    });

    it('常驻面板的上下键只在焦点已经落在面板里时接管', () => {
        installDomStub();
        const menu = createMenu({ groups: GROUPS });
        const keyboard = menuKeyboard(menu);
        const arrows = keyboard.bindings.find((binding) => binding.keys.includes('ArrowUp'))!;
        const outside = create_element('div');

        expect(arrows.resolve({ key: 'ArrowUp', target: outside } as unknown as KeyboardEvent))
            .toBeNull();

        const focus = vi.spyOn(stub(menu.items[3].element), 'focus');
        arrows.resolve({ key: 'ArrowUp', target: menu.items[1].element } as unknown as KeyboardEvent)?.();
        // -1 起步:向上进最后一项
        expect(focus).toHaveBeenCalledTimes(1);
    });
});
