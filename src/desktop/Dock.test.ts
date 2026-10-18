/**
 * Dock 的装配契约:窗口按钮由窗口清单生成,动作区是"消费者动作(清单顺序)
 * + 库的「全部还原」",点击只上报 id,激活态与隐藏态由 `setActive` / `setState`
 * 写入.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { TEST_DESKTOP_CONFIG, type FixtureWindowId } from '../../test/desktopFixture';
import { installDomStub, type StubElement } from '../testing/domStub';
import { createDock, type DockHandle } from './Dock';
import type { DockActionSpec } from './types';

interface Fixture {
    readonly container: StubElement;
    readonly dock: DockHandle;
    /** 上报的窗口 id:库侧是不透明字符串,这里按 string 收. */
    readonly selected: string[];
    /** 上报的桌面复位 / 消费者动作 id. */
    readonly actions: string[];
}

function setup(actions: readonly DockActionSpec[] = []): Fixture {
    installDomStub();
    const container = document.createElement('div') as unknown as StubElement;
    container.id = 'dock';
    const selected: string[] = [];
    const reported: string[] = [];
    const dock = createDock(
        container as unknown as HTMLElement,
        TEST_DESKTOP_CONFIG.windows,
        {
            onSelect: (id) => selected.push(id),
            onRestoreAll: () => reported.push('restore-all'),
            onAction: (id) => reported.push(id),
        },
        actions,
    );
    return { container, dock, selected, actions: reported };
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
            expect(button.textContent).toBe(spec.dock.label);
            // 按钮统一走 createButton:基线类由它给,外观不在这里声明.
            expect(button.classList.contains('ui-button')).toBe(true);
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
        // 状态只有 `data-state` 一份(CSS 按它淡化按钮):按钮里没有第二个装饰元素.
        expect(buttonOf(container, 'objects').querySelector<StubElement>('.dock-btn-state')).toBeNull();
    });

    it('没有消费者动作时,动作区只有库的「全部还原」并上报意图', () => {
        const { container, actions } = setup();

        const buttons = container.querySelectorAll<StubElement>('.dock-action');
        expect(buttons).toHaveLength(1);
        container.querySelector<StubElement>('[data-dock-action="restore-all"]')!.dispatch('click');

        expect(actions).toEqual(['restore-all']);
    });

    it('消费者动作按清单顺序排在「全部还原」左边,按钮结构与库动作一致', () => {
        const { container } = setup([
            { id: 'fit', text: '回正', title: '回到看得见的视角' },
            { id: 'reset', text: '归零' },
        ]);

        const area = container.querySelector<StubElement>('.dock-actions')!;
        // 动作区里全是按钮(桩的子节点联合类型含文本节点,这里按元素读文案)
        const texts = ([...area.children] as StubElement[]).map((child) => child.textContent);
        expect(texts).toEqual(['回正', '归零', '全部还原']);

        const [fit, reset] = [...area.children] as StubElement[];
        // 同一枚 `createButton` + `dock-action` 定位钩子 + `data-dock-action` = id
        for (const [button, id] of [[fit, 'fit'], [reset, 'reset']] as const) {
            expect(button.classList.contains('ui-button')).toBe(true);
            expect(button.classList.contains('dock-action')).toBe(true);
            expect(button.getAttribute('data-dock-action')).toBe(id);
            expect(button.getAttribute('type')).toBe('button');
        }
        // 悬停提示可选:给就给到 title,不给就不写
        expect(fit!.title).toBe('回到看得见的视角');
        expect(reset!.title).toBe('');
    });

    it('消费者动作点击只上报 id,顺序与点击顺序一致', () => {
        const { container, actions } = setup([
            { id: 'fit', text: '回正' },
            { id: 'reset', text: '归零' },
        ]);

        container.querySelector<StubElement>('[data-dock-action="reset"]')!.dispatch('click');
        container.querySelector<StubElement>('[data-dock-action="fit"]')!.dispatch('click');
        container.querySelector<StubElement>('[data-dock-action="restore-all"]')!.dispatch('click');

        expect(actions).toEqual(['reset', 'fit', 'restore-all']);
    });

    it('内容是 .dock 的两个直接子节点:按钮组在左,桌面动作区在右(没有中间层)', () => {
        const { container } = setup();

        // 顶部通栏任务栏不需要"内容宽度"那层包装:盒子就是 .dock 自己.
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
