/**
 * `mountDesktop` 的装配契约(D1).
 *
 * 库的职责从"按 id 找宿主"反过来变成"自己建容器、把消费者给的内容搬进去":
 * 这一层要守住的是
 * 1. 三层容器与每个窗口的正文容器都由库建,消费者不需要写任何带 id 的宿主;
 * 2. 消费者给的正文节点是**搬进去的**,不是重建的(节点身份不变);
 * 3. `dispose()` 把正文节点还回桌面根,不随外壳一起丢;
 * 4. 库不读全局 `document`(节点建在 `root.ownerDocument` 上).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { installDomStub, type DomStub, type StubElement } from '../../test/domStub';
import { DEFAULT_DESKTOP_CONFIG, type WindowConfigEntry } from './types';
import { mountDesktop } from './mountDesktop';

let stub: DomStub;

/**
 * 这一层测的是"库怎么装配",窗口清单是输入的一部分,所以由测试自己给.
 *
 * 不借用 `DEFAULT_DESKTOP_CONFIG.windows`:库的默认配置**不带任何应用窗口**
 * (窗口标题 / dock 文案 / 几何锚点都是应用特有的,见 `types.ts`),那份空清单
 * 在这里什么也测不出来.
 */
const WINDOWS: readonly WindowConfigEntry[] = [
    {
        id: 'source',
        title: '源码',
        dock: { label: '源码' },
        defaultGeometry: { x: { at: 16 }, y: { at: 16 }, w: { at: 420 }, h: { at: 260 } },
        minSize: { w: 240, h: 160 },
    },
    {
        id: 'view',
        title: '视图',
        dock: { label: '视图' },
        defaultGeometry: { x: { at: 16 }, y: { at: 16 }, w: { at: 420 }, h: { at: 260 } },
        minSize: { w: 240, h: 160 },
    },
];

beforeEach(() => {
    stub = installDomStub();
});

function mount(options: { background?: HTMLElement[] } = {}) {
    const root = stub.document.createElement('div');
    root.id = 'app';
    root.offsetWidth = 1280;
    root.offsetHeight = 800;
    stub.document.body.append(root);

    const content: Record<string, HTMLElement> = {};
    for (const spec of WINDOWS) {
        content[spec.id] = stub.document.createElement('div') as unknown as HTMLElement;
    }

    const desktop = mountDesktop(root as unknown as HTMLElement, {
        ...DEFAULT_DESKTOP_CONFIG,
        windows: WINDOWS,
        background: options.background,
        content: (id) => ({ body: [content[id] ?? ''] }),
    });
    return { root, desktop, content };
}

function windowOf(layer: StubElement, id: string): StubElement {
    const found = layer.querySelector(`[data-window="${id}"]`);
    if (!found) throw new Error(`找不到窗口 ${id}`);
    return found as unknown as StubElement;
}

describe('mountDesktop', () => {
    it('三层容器由库建在 root 里,类名与 CSS 约定一致', () => {
        const { root, desktop } = mount();

        expect(root.querySelector('.window-layer')).toBe(desktop.windowLayer as unknown as StubElement);
        expect(root.querySelector('.snap-preview')).toBe(desktop.snapPreview as unknown as StubElement);
        expect(root.querySelector('.dock')).toBe(desktop.dock as unknown as StubElement);
        // 顺序:窗口层 -> 吸附预览 -> Dock(吸附预览画在窗口层之下,靠配置的 z-index).
        expect(root.children.slice(-3)).toEqual([
            desktop.windowLayer as unknown as StubElement,
            desktop.snapPreview as unknown as StubElement,
            desktop.dock as unknown as StubElement,
        ]);
    });

    it('每个配置窗口都建出外壳与正文容器', () => {
        const { desktop } = mount();
        const layer = desktop.windowLayer as unknown as StubElement;

        expect(layer.querySelectorAll('.window')).toHaveLength(WINDOWS.length);
        for (const spec of WINDOWS) {
            expect(windowOf(layer, spec.id).querySelector('.window-body')).not.toBeNull();
        }
    });

    it('消费者给的正文节点被原样搬进对应窗口(节点身份不变)', () => {
        const { desktop, content } = mount();
        const layer = desktop.windowLayer as unknown as StubElement;

        for (const spec of WINDOWS) {
            const body = windowOf(layer, spec.id).querySelector('.window-body') as unknown as StubElement;
            expect(body.children).toContain(content[spec.id] as unknown as StubElement);
        }
    });

    it('背景内容直接挂在 root 上,不额外套一层', () => {
        const background = stub.document.createElement('div');
        background.id = 'viewport';
        const { root } = mount({ background: [background as unknown as HTMLElement] });

        expect(root.children[0]).toBe(background);
    });

    it('dispose 把正文节点还回 root,并删掉三层容器', () => {
        const { root, desktop, content } = mount();
        const source = content[WINDOWS[0].id];

        desktop.dispose();

        expect(root.querySelector('.window-layer')).toBeNull();
        expect(root.querySelector('.dock')).toBeNull();
        expect(root.querySelector('.snap-preview')).toBeNull();
        // 正文节点没有跟着外壳一起消失:它被还回 root.
        expect((source as unknown as StubElement).parentElement).toBe(root);
    });
});
