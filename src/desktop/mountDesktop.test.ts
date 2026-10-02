/**
 * `mountDesktop` 的装配契约.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { installDomStub, type DomStub, type StubElement } from '../testing/domStub';
import { DEFAULT_DESKTOP_CONFIG, type WindowConfigEntry } from './types';
import { mountDesktop } from './mountDesktop';

let stub: DomStub;

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
