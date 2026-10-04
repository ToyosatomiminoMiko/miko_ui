/**
 * 八向缩放的**手柄绑定**:方向 + 指针增量 -> 回调.
 *
 * 几何解释与夹取是 `WindowGeometry.ts` 的纯函数,这里只验 DOM 接线(起手闸门,
 * 增量原样透传,起手/收尾成对).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { installDomStub, type StubElement } from '../testing/domStub';
import type { ResizeDirection } from './WindowGeometry';
import {
    applyResize,
    bindWindowResize,
    RESIZE_DIRECTIONS,
    type PointerPosition,
    type WindowResizeHandlers,
} from './WindowResize';

const START = { x: 100, y: 200, w: 400, h: 300 };

beforeEach(() => {
    installDomStub();
});

describe('applyResize', () => {
    it('east / south 只动一条', () => {
        expect(applyResize(START, 'e', 10, 5)).toEqual({ x: 100, y: 200, w: 410, h: 300 });
        expect(applyResize(START, 's', 10, 5)).toEqual({ x: 100, y: 200, w: 400, h: 305 });
    });

    it('west / north 同时动坐标与尺寸', () => {
        expect(applyResize(START, 'w', 10, 5)).toEqual({ x: 110, y: 200, w: 390, h: 300 });
        expect(applyResize(START, 'n', 10, 5)).toEqual({ x: 100, y: 205, w: 400, h: 295 });
    });

    it('四个角是两轴之并', () => {
        expect(applyResize(START, 'se', 10, 5)).toEqual({ x: 100, y: 200, w: 410, h: 305 });
        expect(applyResize(START, 'sw', 10, 5)).toEqual({ x: 110, y: 200, w: 390, h: 305 });
        expect(applyResize(START, 'ne', 10, 5)).toEqual({ x: 100, y: 205, w: 410, h: 295 });
        expect(applyResize(START, 'nw', 10, 5)).toEqual({ x: 110, y: 205, w: 390, h: 295 });
    });

    it('零位移不改几何;负位移反向', () => {
        expect(applyResize(START, 'nw', 0, 0)).toEqual(START);
        expect(applyResize(START, 'e', -10, 0).w).toBe(390);
        expect(applyResize(START, 'w', -10, 0)).toEqual({ x: 90, y: 200, w: 410, h: 300 });
    });

    it('八个方向都有定义,且没有重复', () => {
        expect(new Set(RESIZE_DIRECTIONS).size).toBe(8);
        for (const direction of RESIZE_DIRECTIONS) {
            expect(applyResize(START, direction, 0, 0)).toEqual(START);
        }
    });
});

describe('bindWindowResize', () => {
    interface Calls {
        started: number;
        ended: number;
        readonly moves: { direction: ResizeDirection; pointer: PointerPosition }[];
    }

    function setup(options: { canStart?: () => boolean } = {}): {
        handle: StubElement;
        calls: Calls;
        controller: AbortController;
    } {
        const handle = document.createElement('div') as unknown as StubElement;
        // 真标记里八根手柄的光标由 styles/desktop.css 给;桩不解析样式表,拖动读到的
        // 光标要像真标记那样写在元素上.
        handle.style.cursor = 'nwse-resize';

        const calls: Calls = { started: 0, ended: 0, moves: [] };
        const handlers: WindowResizeHandlers = {
            canStart: options.canStart,
            onStart: () => { calls.started += 1; },
            onResize: (direction, pointer) => calls.moves.push({ direction, pointer }),
            onEnd: () => { calls.ended += 1; },
        };
        const controller = new AbortController();
        bindWindowResize(
            handle as unknown as HTMLElement,
            controller.signal,
            'se',
            handlers,
        );
        return { handle, calls, controller };
    }

    it('拖一根手柄:方向与指针位置原样透传,起手/收尾各一次', () => {
        const { handle, calls } = setup();

        handle.dispatch('pointerdown', { clientX: 500, clientY: 500, pointerId: 1 });
        expect(handle.classList.contains('is-dragging')).toBe(true);
        expect(calls.started).toBe(1);

        handle.dispatch('pointermove', { clientX: 510, clientY: 505, pointerId: 1 });
        handle.dispatch('pointermove', { clientX: 515, clientY: 508, pointerId: 1 });
        // 报的是指针的**绝对位置**,不是增量:缩放要靠它算"相对起手的总位移".
        expect(calls.moves).toEqual([
            { direction: 'se', pointer: { x: 510, y: 505 } },
            { direction: 'se', pointer: { x: 515, y: 508 } },
        ]);

        handle.dispatch('pointerup', { clientX: 515, clientY: 508, pointerId: 1 });
        expect(handle.classList.contains('is-dragging')).toBe(false);
        expect(calls.ended).toBe(1);
    });

    it('onStart 拿到的是这次 pointerdown(窗口靠它记锚)', () => {
        const handle = document.createElement('div') as unknown as StubElement;
        handle.style.cursor = 'nwse-resize';
        const downs: { x: number; y: number }[] = [];
        bindWindowResize(
            handle as unknown as HTMLElement,
            new AbortController().signal,
            'se',
            {
                onStart: (event) => downs.push({ x: event.clientX, y: event.clientY }),
                onResize: () => {},
                onEnd: () => {},
            },
        );

        handle.dispatch('pointerdown', { clientX: 436, clientY: 562, pointerId: 1 });
        expect(downs).toEqual([{ x: 436, y: 562 }]);
    });

    it('canStart 返回 false 时完全不起手(最大化态的闸门)', () => {
        const { handle, calls } = setup({ canStart: () => false });

        handle.dispatch('pointerdown', { clientX: 500, clientY: 500, pointerId: 1 });
        handle.dispatch('pointermove', { clientX: 600, clientY: 600, pointerId: 1 });

        expect(handle.classList.contains('is-dragging')).toBe(false);
        expect(calls.started).toBe(0);
        expect(calls.moves).toEqual([]);
        expect(calls.ended).toBe(0);
    });

    it('pointercancel 也算收尾(缩放没有待落地的结果,取消与松手同路)', () => {
        const { handle, calls } = setup();

        handle.dispatch('pointerdown', { clientX: 500, clientY: 500, pointerId: 1 });
        handle.dispatch('pointermove', { clientX: 510, clientY: 505, pointerId: 1 });
        handle.dispatch('pointercancel', { clientX: 510, clientY: 505, pointerId: 1 });

        expect(calls.ended).toBe(1);
        expect(handle.classList.contains('is-dragging')).toBe(false);
    });

    it('signal abort 后不再起手;拖动中被 abort 也会收尾', () => {
        const { handle, calls, controller } = setup();
        controller.abort();

        handle.dispatch('pointerdown', { clientX: 500, clientY: 500, pointerId: 1 });
        handle.dispatch('pointermove', { clientX: 600, clientY: 600, pointerId: 1 });
        expect(calls.moves).toEqual([]);
        expect(calls.started).toBe(0);

        const live = setup();
        live.handle.dispatch('pointerdown', { clientX: 500, clientY: 500, pointerId: 1 });
        live.controller.abort();
        expect(live.calls.ended).toBe(1);
        expect(live.handle.classList.contains('is-dragging')).toBe(false);
    });
});
