/**
 * `WindowManager` 的状态机 / 焦点 / z-order / 几何写入.
 *
 * 几条"只在真机上很难定位"的回归被钉在这里:
 * - 拖动一帧之后 `z-index` 仍在(几何写入用了 `cssText` 就会把它清掉);
 * - 进入最大化会清掉四条行内几何(不清就是"点了没反应");
 * - 还原按 `restore` 逐像素写回;
 * - 隐藏态用 `inert` + `aria-hidden` 而不是 `display: none`;
 * - `focus()` 默认不夺 DOM 焦点,`reveal()` 才夺(否则编辑器光标会丢).
 *
 * 拖动路径能在桩里完整跑:桩实现了 `setPointerCapture` 的重定向语义,
 * `getComputedStyle` 也给得出 `cursor`(桩不解析样式表,取行内值或默认值).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { TEST_DESKTOP_CONFIG, type FixtureWindowId } from '../../test/desktopFixture';
import { installDomStub, type DomStub, type StubElement } from '../../test/domStub';
import { WindowManager } from './WindowManager';

const WINDOW = TEST_DESKTOP_CONFIG;

interface Fixture {
    readonly stub: DomStub;
    readonly root: StubElement;
    readonly layer: StubElement;
    readonly dock: StubElement;
    readonly snap: StubElement;
    readonly manager: WindowManager;
    /** 各窗口正文里由测试放进去的内容节点(dispose 后应当还回 root). */
    readonly bodies: Map<string, StubElement>;
}

function setup(desktopW = 1280, desktopH = 800): Fixture {
    const stub = installDomStub();
    const root = stub.document.createElement('div');
    root.id = 'app';
    root.offsetWidth = desktopW;
    root.offsetHeight = desktopH;
    stub.document.body.append(root);

    // 正文节点由消费者提供:库自己建 .window-body,这里只给内容.
    const bodies = new Map<string, StubElement>();
    for (const spec of WINDOW.windows) {
        bodies.set(spec.id, stub.document.createElement('div'));
    }

    const layer = stub.document.createElement('div');
    layer.id = 'window-layer';
    const snap = stub.document.createElement('div');
    snap.id = 'snap-preview';
    const dock = stub.document.createElement('div');
    dock.id = 'dock';
    root.append(layer, snap, dock);

    const manager = new WindowManager(
        WINDOW,
        layer as unknown as HTMLElement,
        dock as unknown as HTMLElement,
        snap as unknown as HTMLElement,
        (id) => ({ body: [bodies.get(id) as unknown as Node] }),
    );
    manager.bind();
    return { stub, root, layer, dock, snap, manager, bodies };
}

function windowOf(layer: StubElement, id: FixtureWindowId): StubElement {
    const found = layer.querySelector(`[data-window="${id}"]`);
    if (!found) throw new Error(`找不到窗口 ${id}`);
    return found as unknown as StubElement;
}

function titleOf(layer: StubElement, id: FixtureWindowId): StubElement {
    return windowOf(layer, id).querySelector('.window-title') as unknown as StubElement;
}

/** 在标题栏上拖一次(按下 -> 移动 -> 松开). */
function dragTitle(
    layer: StubElement,
    id: FixtureWindowId,
    from: { x: number; y: number },
    to: { x: number; y: number },
    pointerId = 1,
): void {
    const title = titleOf(layer, id);
    title.dispatch('pointerdown', { clientX: from.x, clientY: from.y, pointerId });
    title.dispatch('pointermove', { clientX: to.x, clientY: to.y, pointerId });
    title.dispatch('pointerup', { clientX: to.x, clientY: to.y, pointerId });
}

beforeEach(() => {
    installDomStub();
});

describe('bind:装配', () => {
    it('五个窗口都建出来,正文内容被搬进各自的 .window-body', () => {
        const { layer, bodies, manager } = setup();

        expect(layer.querySelectorAll<StubElement>('.window')).toHaveLength(5);
        for (const spec of WINDOW.windows) {
            const body = windowOf(layer, spec.id).querySelector('.window-body') as unknown as StubElement;
            expect(body.children, spec.id).toContain(bodies.get(spec.id));
            expect(manager.getState(spec.id)).toBe('normal');
        }
    });

    it('默认几何按当前桌面写成行内样式(1280x800)', () => {
        const { layer } = setup();
        const source = windowOf(layer, 'source');

        expect(source.style.getPropertyValue('left')).toBe('16px');
        // `y: { at: 16 }` 从工作区上沿(顶部任务栏下沿 = 40px)量起.
        expect(source.style.getPropertyValue('top')).toBe('56px');
        expect(source.style.getPropertyValue('width')).toBe('420px');
        expect(source.style.getPropertyValue('height')).toBe('506px');
    });

    it('Dock 的按钮由清单生成,顺序一致,初始激活是初始焦点窗口', () => {
        const { dock } = setup();
        const buttons = dock.querySelectorAll<StubElement>('.dock-btn');

        expect(buttons.map((button) => button.getAttribute('data-window')))
            .toEqual(WINDOW.windows.map((spec) => spec.id));
        expect(dock.querySelector<StubElement>('.dock-btn.is-active')?.getAttribute('data-window')).toBe('source');
        expect(dock.querySelectorAll<StubElement>('.dock-action')).toHaveLength(1);
    });

    it('三层容器的 z-index 来自配置:窗口层在视口之上,Dock 最高,预览在层之下', () => {
        const { layer, dock, snap } = setup();
        const layerZ = Number(layer.style.getPropertyValue('z-index'));
        const dockZ = Number(dock.style.getPropertyValue('z-index'));
        const snapZ = Number(snap.style.getPropertyValue('z-index'));

        expect(layerZ).toBe(WINDOW.z.windowLayer);
        expect(dockZ).toBe(WINDOW.z.dock);
        expect(snapZ).toBe(WINDOW.z.snapPreview);
        // Dock 必须压过窗口层里的任何窗口(否则窗口会盖住 Dock,而且点不到);
        // 缺这一条时 .window 的正 z-index 会把 z-index:auto 的 Dock 盖住.
        expect(dockZ).toBeGreaterThan(layerZ);
        expect(snapZ).toBeLessThan(layerZ);
    });

    it('两个外壳尺寸由 config 写到 root 的 CSS 变量上,dispose 撤掉', () => {
        const { root, manager } = setup();

        // 运行期唯一来源是 DesktopConfig:几何与 CSS 读的是同一份数.
        expect(root.style.getPropertyValue('--dock-reserve')).toBe(`${WINDOW.dockReserve}px`);
        expect(root.style.getPropertyValue('--window-header-height')).toBe(`${WINDOW.headerHeight}px`);

        manager.dispose();

        // 行内变量跟着挂载一起撤,不给下一个实例留旧尺寸.
        expect(root.style.getPropertyValue('--dock-reserve')).toBe('');
        expect(root.style.getPropertyValue('--window-header-height')).toBe('');
    });

    it('五个窗口的初始 z-index 都写到 DOM 上,不靠 DOM 顺序', () => {
        const { layer } = setup();
        const zs = WINDOW.windows.map((spec) =>
            Number(windowOf(layer, spec.id).style.getPropertyValue('z-index')));

        expect(zs.every((value) => value > 0)).toBe(true);
        // 初始焦点是清单里的第一个窗口(source),它的 z 最高;其余按清单顺序递增.
        expect(zs[0]).toBeGreaterThan(Math.max(...zs.slice(1)));
        expect(zs.slice(1)).toEqual([...zs.slice(1)].sort((a, b) => a - b));
    });

    it('bind 只能调用一次(dispose 后重建会静默产出不可交互的窗口,所以直接抛)', () => {
        const { manager } = setup();

        expect(() => manager.bind()).toThrow(/只能调用一次/);
    });

    it('小桌面(1280x700)上默认几何也过夹取:不小于 minSize,底边不留进标题栏外', () => {
        const { manager } = setup(1280, 700);
        const view = WINDOW.windows.find((spec) => spec.id === 'view')!;

        // raw resolveDefaultGeometry 在这里只给 178(见 WindowGeometry.test.ts
        // 的说明),夹取后必须顶到 minSize.h.
        expect(manager.getGeometry('view').h).toBeGreaterThanOrEqual(view.minSize.h);
    });

    it('极矮桌面(1280x350)上 objects 的标题栏仍留在桌内(y >= 0)', () => {
        const { manager } = setup(1280, 350);

        for (const spec of WINDOW.windows) {
            const geometry = manager.getGeometry(spec.id);
            expect(geometry.y, `${spec.id}.y`).toBeGreaterThanOrEqual(0);
            expect(geometry.y, `${spec.id}.y`).toBeLessThanOrEqual(350 - WINDOW.headerMinVisible);
            expect(geometry.h, `${spec.id}.h`).toBeGreaterThan(0);
        }
    });
});

describe('焦点与 z-order', () => {
    it('窗口上的 pointerdown(捕获阶段)把该窗口提到最高', () => {
        const { layer, manager } = setup();
        const source = windowOf(layer, 'source');
        const params = windowOf(layer, 'params');
        const sourceZ = Number(source.style.getPropertyValue('z-index'));

        params.dispatch('pointerdown', { clientX: 900, clientY: 20, pointerId: 1 });

        expect(Number(params.style.getPropertyValue('z-index'))).toBeGreaterThan(sourceZ);
        expect(params.classList.contains('is-focused')).toBe(true);
        expect(source.classList.contains('is-focused')).toBe(false);
        expect(manager.getState('params')).toBe('normal');
    });

    it('z 单调递增,不做取模回收', () => {
        const { layer, manager } = setup();
        const params = windowOf(layer, 'params');
        const seen: number[] = [];

        for (let i = 0; i < 5; i += 1) {
            manager.focus('params');
            seen.push(Number(params.style.getPropertyValue('z-index')));
        }
        manager.focus('source');

        expect(seen).toEqual([...seen].sort((a, b) => a - b));
        expect(seen[seen.length - 1]).toBeLessThan(Number(windowOf(layer, 'source').style.getPropertyValue('z-index')));
    });

    it('拖动不会清掉 z-index(几何写入不走 cssText)', () => {
        const { layer, manager } = setup();
        const source = windowOf(layer, 'source');
        manager.focus('source');
        const focusedZ = Number(source.style.getPropertyValue('z-index'));
        expect(focusedZ).toBeGreaterThan(0);

        dragTitle(layer, 'source', { x: 600, y: 100 }, { x: 620, y: 120 });

        // 拖动会顺手提升焦点(z 更大),但**绝不能**把 z-index 清成空字符串
        // (cssText 写法就会那样).
        const draggedZ = source.style.getPropertyValue('z-index');
        expect(draggedZ).not.toBe('');
        expect(Number(draggedZ)).toBeGreaterThanOrEqual(focusedZ);
        // 几何确实变了(不是"什么都没发生"导致的假通过).
        expect(source.style.getPropertyValue('left')).toBe('36px');
    });

    it('focus 默认不夺 DOM 焦点,显式 takeDomFocus 才夺', () => {
        const { layer, manager } = setup();
        const params = windowOf(layer, 'params');
        const focused: string[] = [];
        (params as unknown as { focus: () => void }).focus = () => focused.push('params');

        manager.focus('params');
        expect(focused).toEqual([]);

        manager.focus('params', { takeDomFocus: true });
        expect(focused).toEqual(['params']);
    });

    it('最小化当前焦点窗口后,焦点交给可见窗口中 z 最高者', () => {
        const { layer, manager } = setup();
        manager.focus('params');
        manager.setMinimized('params', true);

        const focused = WINDOW.windows
            .map((spec) => spec.id)
            .filter((id) => windowOf(layer, id).classList.contains('is-focused'));
        expect(focused).toHaveLength(1);
        expect(focused[0]).not.toBe('params');
    });
});

describe('状态机', () => {
    it('最小化:几何不变,隐藏但不用 display:none', () => {
        const { layer, dock, manager } = setup();
        const before = manager.getGeometry('source');

        manager.setMinimized('source', true);

        const element = windowOf(layer, 'source');
        expect(manager.getState('source')).toBe('minimized');
        expect(element.classList.contains('is-hidden')).toBe(true);
        expect(element.inert).toBe(true);
        expect(element.getAttribute('aria-hidden')).toBe('true');
        expect(element.style.display).not.toBe('none');
        expect(manager.getGeometry('source')).toEqual(before);
        expect(dock.querySelector<StubElement>('.dock-btn[data-window="source"]')?.getAttribute('data-state'))
            .toBe('minimized');
    });

    it('还原回原几何并夺回焦点', () => {
        const { layer, manager } = setup();
        const before = manager.getGeometry('source');

        manager.setMinimized('source', true);
        manager.setMinimized('source', false);

        const element = windowOf(layer, 'source');
        expect(manager.getState('source')).toBe('normal');
        expect(element.inert).toBe(false);
        expect(manager.getGeometry('source')).toEqual(before);
        expect(element.classList.contains('is-focused')).toBe(true);
    });

    it('最大化:进入清掉四条行内几何,退出按 restore 逐像素写回', () => {
        const { layer, manager } = setup();
        const before = manager.getGeometry('source');
        const element = windowOf(layer, 'source');

        manager.setMaximized('source', true);

        expect(manager.getState('source')).toBe('maximized');
        expect(element.classList.contains('is-maximized')).toBe(true);
        for (const name of ['left', 'top', 'width', 'height'] as const) {
            expect(element.style.getPropertyValue(name), name).toBe('');
        }
        // 最大化不改 geometry.
        expect(manager.getGeometry('source')).toEqual(before);
        expect(element.style.getPropertyValue('z-index')).not.toBe('');

        manager.setMaximized('source', false);

        expect(manager.getState('source')).toBe('normal');
        expect(element.style.getPropertyValue('left')).toBe('16px');
        expect(element.style.getPropertyValue('height')).toBe('506px');
        expect(manager.getGeometry('source')).toEqual(before);
    });

    it('最大化/还原走两轮:第二轮必须回到中途挪过的位置(restore 不留旧值)', () => {
        const { manager } = setup();
        const moved = { x: 300, y: 200, w: 420, h: 300 };

        manager.setMaximized('source', true);
        manager.setMaximized('source', false);
        manager.setGeometry('source', moved);

        manager.setMaximized('source', true);
        manager.setMaximized('source', false);

        expect(manager.getGeometry('source')).toEqual(moved);
    });

    it('隐藏期间桌面变小:最小化的窗口也会被收回桌内,恢复后抓得到', () => {
        const { root, manager } = setup();
        manager.setGeometry('params', { x: 900, y: 100, w: 420, h: 300 });
        manager.setGeometry('process', { x: 900, y: 100, w: 420, h: 300 });
        manager.setMinimized('params', true);
        manager.setMinimized('process', true);

        root.offsetWidth = 600;
        root.offsetHeight = 500;
        manager.onDesktopResize();

        manager.setMinimized('params', false);
        manager.setMinimized('process', false);

        for (const id of ['params', 'process'] as const) {
            const geometry = manager.getGeometry(id);
            expect(geometry.x, `${id}.x`).toBeGreaterThanOrEqual(0);
            expect(geometry.x + geometry.w, `${id} 右边界`).toBeLessThanOrEqual(600);
            expect(geometry.y, `${id}.y`).toBeLessThanOrEqual(500 - WINDOW.headerMinVisible);
        }
    });

    it('最大化不换按钮文案:actions 是静态配置', () => {
        const { layer, manager } = setup();
        const element = windowOf(layer, 'source');
        const texts = (): string[] =>
            element.querySelectorAll<StubElement>('.window-control-btn').map((button) => button.textContent);

        expect(texts()).toEqual(['min', 'max']);

        manager.setMaximized('source', true);
        expect(texts()).toEqual(['min', 'max']);
    });

    it('setGeometry 过夹取:小于最小尺寸会被顶到下限', () => {
        const { manager } = setup();

        manager.setGeometry('source', { x: 0, y: 0, w: 10, h: 10 });
        expect(manager.getGeometry('source')).toMatchObject({ w: 300, h: 220 });
    });

    it('restoreAll 把五个窗口复位成默认几何与 normal 态', () => {
        const { manager } = setup();
        manager.setMaximized('source', true);
        manager.setMinimized('params', true);
        manager.setGeometry('objects', { x: 5, y: 5, w: 500, h: 260 });

        manager.restoreAll();

        for (const spec of WINDOW.windows) expect(manager.getState(spec.id)).toBe('normal');
        expect(manager.getGeometry('source')).toEqual({ x: 16, y: 56, w: 420, h: 506 });
        expect(manager.getGeometry('objects')).toEqual({ x: 452, y: 524, w: 376, h: 260 });
    });

    it('桌面变小后 normal 窗口被夹回桌内', () => {
        const { root, manager } = setup();
        expect(manager.getGeometry('params').x).toBe(844);

        root.offsetWidth = 600;
        root.offsetHeight = 500;
        manager.onDesktopResize();

        // resize 是外部变化:窗口整体收回桌内(x = dW - w 而不是挂出去),
        // 与"拖动可以挂出边缘"的夹取分工不同.
        const params = manager.getGeometry('params');
        expect(params.x).toBe(600 - params.w);
        expect(params.x + params.w).toBeLessThanOrEqual(600);
        expect(params.y).toBeLessThanOrEqual(500 - WINDOW.headerMinVisible);
    });

    it('几何变化会通知订阅者', () => {
        const { manager } = setup();
        const seen: string[] = [];
        const off = manager.onGeometryChange((id) => seen.push(id));

        manager.setGeometry('source', { x: 20, y: 20, w: 420, h: 465 });
        expect(seen).toEqual(['source']);

        off();
        manager.setGeometry('source', { x: 30, y: 30, w: 420, h: 465 });
        expect(seen).toEqual(['source']);
    });
});

describe('拖动 / 吸附', () => {
    it('拖标题栏:增量移动 + 夹取,并且挂 is-dragging 类', () => {
        const { layer, manager } = setup();
        const title = titleOf(layer, 'source');
        const element = windowOf(layer, 'source');

        title.dispatch('pointerdown', { clientX: 100, clientY: 20, pointerId: 1 });
        expect(element.classList.contains('is-dragging')).toBe(true);

        title.dispatch('pointermove', { clientX: 120, clientY: 40, pointerId: 1 });
        expect(manager.getGeometry('source')).toMatchObject({ x: 36, y: 76 });

        title.dispatch('pointermove', { clientX: 130, clientY: 45, pointerId: 1 });
        expect(manager.getGeometry('source')).toMatchObject({ x: 46, y: 81 });

        title.dispatch('pointerup', { clientX: 130, clientY: 45, pointerId: 1 });
        expect(element.classList.contains('is-dragging')).toBe(false);
    });

    it('拖到左边缘:预览半屏,松手落地成半屏', () => {
        const { layer, snap, manager } = setup();
        const title = titleOf(layer, 'source');

        title.dispatch('pointerdown', { clientX: 600, clientY: 400, pointerId: 1 });
        title.dispatch('pointermove', { clientX: 4, clientY: 400, pointerId: 1 });

        expect(snap.classList.contains('is-open')).toBe(true);
        expect(snap.style.getPropertyValue('width')).toBe('640px');

        title.dispatch('pointerup', { clientX: 4, clientY: 400, pointerId: 1 });

        expect(manager.getGeometry('source')).toEqual({ x: 0, y: 40, w: 640, h: 760 });
        expect(snap.classList.contains('is-open')).toBe(false);
    });

    it('拖到上边缘:预览最大化,松手进入 maximized', () => {
        const { layer, snap, manager } = setup();
        const title = titleOf(layer, 'source');
        const element = windowOf(layer, 'source');

        title.dispatch('pointerdown', { clientX: 600, clientY: 300, pointerId: 1 });
        title.dispatch('pointermove', { clientX: 600, clientY: 4, pointerId: 1 });

        expect(snap.classList.contains('is-open')).toBe(true);
        expect(manager.getState('source')).toBe('normal');

        title.dispatch('pointerup', { clientX: 600, clientY: 4, pointerId: 1 });

        expect(manager.getState('source')).toBe('maximized');
        expect(element.style.getPropertyValue('left')).toBe('');
    });

    it('磁吸:靠近另一窗口的边时贴上去,但只在这一次移动里生效', () => {
        const { layer, manager } = setup();
        const title = titleOf(layer, 'source');

        // objects 的左边在 x=452;把 source 拖到 x=454 附近应贴到 452.
        title.dispatch('pointerdown', { clientX: 600, clientY: 100, pointerId: 1 });
        title.dispatch('pointermove', { clientX: 600 + 438, clientY: 100, pointerId: 1 });
        expect(manager.getGeometry('source').x).toBe(452);

        // 下一次移动基于**没被磁吸修正过**的值(16 + 438 = 454)继续累计:
        // 修正只在"这一次移动"里生效,不能变成下一段的基准(否则慢速拖动会被
        // 反复吸回,见下面那条回归).
        title.dispatch('pointermove', { clientX: 600 + 458, clientY: 100, pointerId: 1 });
        expect(manager.getGeometry('source').x).toBe(474);
    });

    it('慢速拖动:每帧几像素也要能离开与另一个窗口共用的边(磁吸不是死区)', () => {
        const { layer, manager } = setup();
        const title = titleOf(layer, 'source');

        // source 与 view 都在 x=16:每一帧只走 2px,位移全程落在磁吸阈值(8px)内.
        title.dispatch('pointerdown', { clientX: 100, clientY: 20, pointerId: 1 });
        for (let step = 1; step <= 20; step += 1) {
            title.dispatch('pointermove', { clientX: 100 + step * 2, clientY: 20, pointerId: 1 });
        }
        title.dispatch('pointerup', { clientX: 140, clientY: 20, pointerId: 1 });

        // 40px 的指针位移必须真的走完,不能被"每帧都被吸回 16"吃掉.
        expect(manager.getGeometry('source').x).toBe(56);
    });

    it('双击标题栏 = 最大化 / 再双击还原(不起手拖动)', () => {
        const { layer, manager } = setup();
        const title = titleOf(layer, 'source');
        const element = windowOf(layer, 'source');
        const before = manager.getGeometry('source');

        title.dispatch('pointerdown', { clientX: 600, clientY: 20, pointerId: 1, timeStamp: 1000 });
        title.dispatch('pointerup', { clientX: 600, clientY: 20, pointerId: 1, timeStamp: 1010 });
        // 第一次按下是普通拖动起手,松开后什么也没变.
        expect(manager.getState('source')).toBe('normal');

        title.dispatch('pointerdown', { clientX: 600, clientY: 20, pointerId: 2, timeStamp: 1100 });
        expect(manager.getState('source')).toBe('maximized');
        expect(element.classList.contains('is-dragging')).toBe(false);
        expect(manager.getGeometry('source')).toEqual(before);
        title.dispatch('pointerup', { clientX: 600, clientY: 20, pointerId: 2, timeStamp: 1110 });

        // 真实的双击序列是 down-up-down-up:第二次双击的第一次按下只是普通拖动起手.
        title.dispatch('pointerdown', { clientX: 600, clientY: 20, pointerId: 3, timeStamp: 1200 });
        title.dispatch('pointerup', { clientX: 600, clientY: 20, pointerId: 3, timeStamp: 1210 });
        title.dispatch('pointerdown', { clientX: 600, clientY: 20, pointerId: 4, timeStamp: 1300 });
        expect(manager.getState('source')).toBe('normal');
        expect(manager.getGeometry('source')).toEqual(before);
        expect(element.classList.contains('is-dragging')).toBe(false);
        title.dispatch('pointerup', { clientX: 600, clientY: 20, pointerId: 4, timeStamp: 1310 });
    });

    it('两次按下间隔超过阈值时只是两次拖动,不触发最大化', () => {
        const { layer, manager } = setup();
        const title = titleOf(layer, 'source');

        title.dispatch('pointerdown', { clientX: 600, clientY: 20, pointerId: 1, timeStamp: 1000 });
        title.dispatch('pointerup', { clientX: 600, clientY: 20, pointerId: 1, timeStamp: 1010 });
        title.dispatch('pointerdown', { clientX: 600, clientY: 20, pointerId: 2, timeStamp: 2000 });

        expect(manager.getState('source')).toBe('normal');
        expect(windowOf(layer, 'source').classList.contains('is-dragging')).toBe(true);
    });

    it('最大化态下拖标题栏:先还原再跟手', () => {
        const { layer, manager } = setup();
        const before = manager.getGeometry('source');
        manager.setMaximized('source', true);

        // 最大化窗口的标题栏在 y = dockReserve(40)..76;往下拖到吸附阈值
        // (dockReserve + snap.edge = 56)之外,免得"拖到顶部 = 最大化"又把它吸回去.
        dragTitle(layer, 'source', { x: 600, y: 60 }, { x: 620, y: 80 });

        expect(manager.getState('source')).toBe('normal');
        expect(manager.getGeometry('source')).toEqual({ ...before, x: before.x + 20, y: before.y + 20 });
    });
});

describe('Dock 点击分派', () => {
    function clickDock(dock: StubElement, id: FixtureWindowId): void {
        const button = dock.querySelector(`[data-window="${id}"]`) as unknown as StubElement;
        button.dispatch('click');
    }

    it('normal 且已是焦点 -> 最小化;再点 -> 恢复', () => {
        const { dock, manager } = setup();
        const before = manager.getGeometry('source');

        clickDock(dock, 'source');
        expect(manager.getState('source')).toBe('minimized');

        clickDock(dock, 'source');
        expect(manager.getState('source')).toBe('normal');
        expect(manager.getGeometry('source')).toEqual(before);
    });

    it('normal 但不是焦点 -> 只提升焦点', () => {
        const { layer, dock, manager } = setup();

        clickDock(dock, 'objects');

        expect(manager.getState('objects')).toBe('normal');
        expect(windowOf(layer, 'objects').classList.contains('is-focused')).toBe(true);
    });

    it('maximized -> 还原成 normal', () => {
        const { dock, manager } = setup();
        manager.setMaximized('params', true);

        clickDock(dock, 'params');

        expect(manager.getState('params')).toBe('normal');
    });

    it('唯一的桌面动作(全部还原)接到 WindowManager 上', () => {
        const { dock, manager } = setup();
        manager.setMaximized('source', true);
        manager.setMinimized('objects', true);

        const restore = dock.querySelector('[data-dock-action="restore-all"]') as unknown as StubElement;
        restore.dispatch('click');

        expect(manager.getState('source')).toBe('normal');
        expect(manager.getState('objects')).toBe('normal');
        expect(manager.getGeometry('source')).toEqual({ x: 16, y: 56, w: 420, h: 506 });
    });
});

describe('dispose', () => {
    it('宿主还回 #app,窗口与 Dock 清空,resize 监听摘掉', () => {
        const { stub, root, layer, dock, bodies, manager } = setup();
        const sourceHost = bodies.get('source')!;

        manager.dispose();

        expect(layer.children).toHaveLength(0);
        expect(dock.children).toHaveLength(0);
        expect(sourceHost.parentElement).toBe(root);
        // 监听已摘:再派发 resize 不会碰到已释放的状态.
        expect(() => stub.window.dispatch('resize')).not.toThrow();
        expect(() => manager.onDesktopResize()).not.toThrow();
    });
});
