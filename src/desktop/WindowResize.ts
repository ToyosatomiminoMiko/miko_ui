/**
 * 八向缩放的**手柄绑定**:把某根手柄上的指针位置交给调用方.
 *
 * 本模块只做 DOM 接线,不认识 x/y/w/h:几何解释(`applyResize`)与夹取
 * (`resizeGeometry`)都是 `WindowGeometry.ts` 的纯函数,方向来自手柄的
 * `data-window-resize`,窗口状态由调用方通过 `canStart` 表达.
 *
 * **报的是指针的绝对位置,不是逐帧增量.** 缩放按"指针相对起手位置的总位移"
 * 解释(理由见 `resizeGeometry` 的头注):移动边要始终落在指针底下,被最小尺寸
 * 夹住期间指针退回界内之前不该再动.逐帧增量做不到这一点 -- 夹住时被丢掉的
 * 位移没有记录,指针一回移窗口就暴涨.拖动那边相反,要的是"夹住后回退立刻跟手",
 * 所以拖动仍然只吃增量,两条路径在这里刻意分家.
 *
 * 拖动只有 `shared/dragGesture.ts` 一份,光标只由 CSS 给(起手时读
 * `getComputedStyle(handle).cursor`),`is-dragging` 由共用件负责,解绑走
 * `{ signal }`.
 */
import { bindDragGesture } from '../shared/dragGesture';
import type { ResizeDirection } from './WindowGeometry';

// 方向词表与纯算术住在几何模块:别处(含消费者)从本模块拿到的名字不变.
export type { ResizeDirection } from './WindowGeometry';
export { applyResize, resizeGeometry } from './WindowGeometry';

/**
 * 八根手柄的方向清单:顺序即 DOM 顺序.
 *
 * 角 = 两轴并集,所以 `WindowGeometry` 里的判断用 `includes`:一个 `se` 同时
 * 命中 `e` 与 `s`.
 */
export const RESIZE_DIRECTIONS: readonly ResizeDirection[] = [
    'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw',
];

/** 指针当前在视口中的位置(原始事件的 `clientX` / `clientY`,不换算成任何几何量). */
export interface PointerPosition {
    readonly x: number;
    readonly y: number;
}

/** 一次缩放要回调的事:可否起手 / 起手 / 每次位移 / 收尾. */
export interface WindowResizeHandlers {
    /**
     * 是否允许这次按下起手(默认允许).返回 false 时共用件什么都不做:不起手,
     * 不换光标,不加 `is-dragging`,也不 `preventDefault`.
     *
     * 窗口用它表达"最大化态下缩放无意义"(几何由 CSS 类接管).CSS 那边会把
     * 手柄一起隐藏,这里是第二道闸:不依赖样式表也算得对.
     */
    canStart?(): boolean;
    /**
     * 已起手(`preventDefault` 完成,光标已换).
     *
     * 参数是这次的 `pointerdown`:窗口要在这里记下**这次手势的锚**(当前几何与
     * 指针起点),后面每帧都相对它算总位移.
     */
    onStart(event: PointerEvent): void;
    /** 每次位移:方向 + 指针当前的位置(不是增量). */
    onResize(direction: ResizeDirection, pointer: PointerPosition): void;
    /** 松手 / 取消 / 被解绑. */
    onEnd(): void;
}

/** 把某根手柄接到回调上;DOM 部分只做这一件事. */
export function bindWindowResize(
    handle: HTMLElement,
    signal: AbortSignal,
    direction: ResizeDirection,
    handlers: WindowResizeHandlers,
): void {
    bindDragGesture(handle, signal, {
        canStart: () => handlers.canStart?.() ?? true,
        onStart: (event) => handlers.onStart(event),
        // 增量在这里丢掉:缩放要的是"指针在哪",见文件头的说明.
        onDelta: (_deltaX, _deltaY, event) => handlers.onResize(direction, {
            x: event.clientX,
            y: event.clientY,
        }),
        // 缩放没有"松手才生效"的待落地状态,所以取消与松手一样只做收尾.
        onEnd: () => handlers.onEnd(),
    });
}
