/**
 * Dock 的装配契约:按钮由窗口清单生成(不是手写),点击只上报 id,
 * 激活态与隐藏态由 `setActive` / `setState` 写入.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { TEST_DESKTOP_CONFIG, type FixtureWindowId } from '../../test/desktopFixture';
import { installDomStub, type StubElement } from '../../test/domStub';
import { createDock, type DockHandle } from './Dock';

interface Fixture {
    readonly container: StubElement;
    readonly dock: DockHandle;
    /** 上报的窗口 id:库侧是不透明字符串,这里按 string 收. */
    readonly selected: string[];
    readonly actions: string[];
}

function setup(): Fixture {
    installDomStub();
    const container = document.createElement('div') as unknown as StubElement;
    container.id = 'dock';
    const selected: string[] = [];
    const actions: string[] = [];
    const dock = createDock(container as unknown as HTMLElement, TEST_DESKTOP_CONFIG.windows, {
        onSelect: (id) => selected.push(id),
        onRestoreAll: () => actions.push('restore-all'),
    });
    return { container, dock, selected, actions };
}

function buttonOf(container: StubElement, id: FixtureWindowId): StubElement {
    const button = container.querySelector<StubElement>(`.dock-btn[data-window="${id}"]`);
    if (!button) throw new Error(`Dock 里没有 ${id} 的按钮`);
    return button;
}

beforeEach(() => {
    installDomStub();
});

describe('createDock', () => {
    it('五个按钮由清单生成,顺序一致,内容来自配置', () => {
        const { container } = setup();
        const buttons = container.querySelectorAll<StubElement>('.dock-btn');

        expect(buttons.map((button) => button.getAttribute('data-window')))
            .toEqual(TEST_DESKTOP_CONFIG.windows.map((spec) => spec.id));
        for (const spec of TEST_DESKTOP_CONFIG.windows) {
            const button = buttonOf(container, spec.id);
            expect(button.title).toBe(spec.title);
            expect(button.querySelector<StubElement>('.dock-btn-label')?.textContent)
                .toBe(spec.dock.label);
            expect(button.getAttribute('aria-pressed')).toBe('false');
        }
    });

    it('点击上报窗口 id,不在这里解释状态', () => {
        const { container, selected } = setup();

        buttonOf(container, 'process').dispatch('click');
        buttonOf(container, 'source').dispatch('click');

        expect(selected).toEqual(['process', 'source']);
    });

    it('激活态与隐藏态都由 dock 自己写', () => {
        const { container, dock } = setup();

        dock.setActive('params');
        expect(buttonOf(container, 'params').classList.contains('is-active')).toBe(true);
        expect(buttonOf(container, 'params').getAttribute('aria-pressed')).toBe('true');
        expect(container.querySelectorAll<StubElement>('.dock-btn.is-active')).toHaveLength(1);

        dock.setActive(null);
        expect(container.querySelectorAll<StubElement>('.dock-btn.is-active')).toHaveLength(0);

        dock.buttons.get('objects')!.setState('minimized');
        expect(buttonOf(container, 'objects').getAttribute('data-state')).toBe('minimized');
        // 状态只有 `data-state` 一份(CSS 按它淡化按钮):按钮里不再有第二个装饰元素.
        expect(buttonOf(container, 'objects').querySelector<StubElement>('.dock-btn-state')).toBeNull();
    });

    it('唯一的桌面动作按钮(全部还原)上报意图', () => {
        const { container, actions } = setup();

        const buttons = container.querySelectorAll<StubElement>('.dock-action');
        expect(buttons).toHaveLength(1);
        container.querySelector<StubElement>('[data-dock-action="restore-all"]')!.dispatch('click');

        expect(actions).toEqual(['restore-all']);
    });

    it('内容是 .dock 的两个直接子节点:按钮组在左,桌面动作区在右(没有中间层)', () => {
        const { container } = setup();

        // 顶部通栏任务栏不再需要"内容宽度"那层包装:盒子就是 .dock 自己.
        expect(container.querySelector<StubElement>('.dock-inner')).toBeNull();
        expect(container.children).toHaveLength(2);
        const [first, second] = container.children as StubElement[];
        expect(first.classList.contains('dock-group')).toBe(true);
        expect(second.classList.contains('dock-actions')).toBe(true);
    });

    it('dispose 清空内容与状态', () => {
        const { container, dock } = setup();

        dock.dispose();

        expect(container.children).toHaveLength(0);
        expect(dock.buttons.size).toBe(0);
    });
});
