/**
 * 八向缩放的**手柄绑定**:把某根手柄上的指针位移翻译成 `(方向, dx, dy)` 回调.
 *
 * 本模块只做 DOM 接线,不认识 x/y/w/h:几何解释(`applyResize`)与夹取
 * (`resizeGeometry`)都是 `WindowGeometry.ts` 的纯函数,方向来自手柄的
 * `data-window-resize`,窗口状态由调用方通过 `canStart` 表达.这样拖动与缩放
 * 两条路径的形状就一致了 -- 管理器起手,共用件报增量,纯函数解释,管理器落地.
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
    /** 已起手(`preventDefault` 完成,光标已换). */
    onStart(): void;
    /** 每次位移:方向 + 本次的像素增量(原样,未解释). */
    onResize(direction: ResizeDirection, dx: number, dy: number): void;
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
        onStart: () => handlers.onStart(),
        onDelta: (dx, dy) => handlers.onResize(direction, dx, dy),
        // 缩放没有"松手才生效"的待落地状态,所以取消与松手一样只做收尾.
        onEnd: () => handlers.onEnd(),
    });
}
