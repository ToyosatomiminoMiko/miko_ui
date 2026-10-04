/**
 * 指针拖动:按下起手 / 移动累计 / 松开收尾,收尾时复位光标与拖动标记.
 *
 * 库内**唯一一份**拖动实现,两个消费者:`desktop/WindowManager`(窗口标题栏拖动)
 * 与 `desktop/WindowResize`(八根 `[data-window-resize]` 手柄的八向缩放).按下起手 /
 * 累计位移 / 收尾复位 `document.body.style.cursor` 这套流程写两份,就会在细节上
 * 分叉(收尾监听绑在谁身上,光标写死还是读计算样式),所以光标只有一个来源(CSS),
 * 收尾只有一条路径(signal).
 *
 * 两个刻意的设计点:
 * - **增量而非"起点 + 总位移"**:比例/宽度被上下限夹住之后,指针回退一小段
 *   就能立刻重新跟手,不会出现一段"死区".
 * - **位移是像素原始值**,怎么解释(加到宽度上还是减到宽度上,除以容器高度
 *   变成比例)由 `onDelta` 的实现决定,本模块不认识"宽/高/比例"任何一个概念.
 *
 * 收尾:pointerup / pointercancel 绑在 handle 自己身上(见下方监听说明),并给
 * handle 加 `is-dragging` 类供 CSS 表达拖动中状态.三种收尾路径(松手 / 取消 /
 * 解绑)都汇到 `onEnd(reason)` 一处,但**原因不合并**:要落地结果的消费者得靠
 * 它区分"用户松手"与"这次拖动被取消了".
 */

/** 拖动收尾的原因:松手 / 指针被取消 / 解绑(signal abort). */
export type DragEndReason = 'pointerup' | 'pointercancel' | 'abort';

/** 拖动回调:按下,每次移动的像素位移,收尾. */
export interface DragGestureHandlers {
    /**
     * 是否允许这次按下起手(默认允许).
     *
     * 返回 false 时本模块**什么都不做**:不 `preventDefault`,不换光标,不加
     * `is-dragging`.消费者用它表达"当前这个东西不可拖"(如窗口已最小化),
     * 而不是在 `onDelta` 里反复判断.
     *
     * 参数是这次的 `pointerdown`:窗口用它判定"双击标题栏"(两次按下的间隔),
     * 并且要在**起手之前**就决定不拖,所以判断只能放在这里.不关心事件的实现
     * 照旧写 `canStart: () => ...`.
     */
    canStart?(event: PointerEvent): boolean;
    /**
     * 按下(已 `preventDefault`),光标已经换成拖动态.
     *
     * 参数是这次的 `pointerdown`;只用位移工作的消费者可以忽略它(TS 允许实现
     * 少写参数,如窗口的缩放手柄写 `onStart: () => {}`).
     */
    onStart(event: PointerEvent): void;
    /**
     * 指针位移(像素,原样);`deltaX`/`deltaY` 都是"本次相对上次"的增量.
     *
     * 第三个参数是原始事件:窗口拖动用它按指针在桌面上的位置判定边缘吸附
     * (见 `desktop/WindowGeometry.resolveEdgeSnap`).
     */
    onDelta(deltaX: number, deltaY: number, event: PointerEvent): void;
    /**
     * 收尾(只有真正起手过的拖动才回调),用于复位只属于这次拖动的外部状态.
     *
     * **必须看 `reason`**:`pointercancel` 与被解绑都不是"用户决定放在这里",
     * 把结果落地的消费者(窗口拖动会在松手时提交吸附)要在此时丢掉待落地的
     * 意图,否则一次取消或一次 `dispose` 会凭空改掉状态.
     *
     * 实现可以少写这个参数(`onEnd: () => ...` 仍然合法):不需要区分原因的
     * 消费者(缩放手柄)只关心"结束了".
     */
    onEnd(reason: DragEndReason): void;
}

/**
 * 把拖动装到一个元素上.
 *
 * @param handle        起手元素(分隔条 / 标题栏)
 * @param signal        解绑信号:abort 时摘掉监听,并且**正在进行的拖动也一并
 *                      收尾**(否则拖动中被 dispose 会留下拖动态光标)
 * @param handlers      回调
 * @param onCursorReset 收尾后恢复光标的方式;默认清空 handle 所属 document 的
 *                      `body.style.cursor`(从 handle 反查,不摸全局 document)
 */
export function bindDragGesture(
    handle: HTMLElement,
    signal: AbortSignal,
    handlers: DragGestureHandlers,
    onCursorReset: () => void = () => {
        handle.ownerDocument.body.style.cursor = '';
    },
): void {
    let lastX = 0;
    let lastY = 0;
    let active = false;
    let pointerId = -1;
    let aborted = false;

    const end = (reason: DragEndReason): void => {
        if (!active) return;
        active = false;
        if (pointerId !== -1 && handle.hasPointerCapture?.(pointerId)) {
            handle.releasePointerCapture(pointerId);
        }
        pointerId = -1;
        handle.classList.remove('is-dragging');
        onCursorReset();
        handlers.onEnd(reason);
    };

    const onPointerMove = (event: PointerEvent): void => {
        if (!active) return;
        const deltaX = event.clientX - lastX;
        const deltaY = event.clientY - lastY;
        lastX = event.clientX;
        lastY = event.clientY;
        handlers.onDelta(deltaX, deltaY, event);
    };

    // signal 已经 abort 时不再注册:bind 之后立刻 dispose 的路径不该留下监听.
    if (signal.aborted) return;

    handle.addEventListener('pointerdown', (event: PointerEvent) => {
        if (active) return;
        if (handlers.canStart?.(event) === false) return;
        event.preventDefault();
        active = true;
        pointerId = event.pointerId;
        lastX = event.clientX;
        lastY = event.clientY;
        // 指针捕获:拖出分隔条(甚至拖出窗口)仍能收到 pointermove,
        // 触屏/触控笔也不会被浏览器的手势识别抢走.
        handle.setPointerCapture?.(event.pointerId);
        handle.classList.add('is-dragging');
        // 光标取自 handle 自己的计算样式(CSS 是唯一真相源),不在 TS 里再写一份.
        handle.ownerDocument.body.style.cursor = getComputedStyle(handle).cursor;
        handlers.onStart(event);
    }, { signal });

    /**
     * move / up / cancel 绑在**起手元素自己**身上,不是 window.
     *
     * `setPointerCapture` 会把该 pointerId 的后续指针事件重定向到捕获元素,
     * 所以绑在捕获元素上最直接:不必依赖"事件还要冒泡一层到 window",也不必在
     * 没拖动的时候让全局每次指针移动都过一遍监听(捕获之后 move 就不再在
     * document/window 上派发,绑那边等于白等).指针跑出 handle 也照样收得到,
     * 正是捕获要解决的问题.
     *
     * 没按下时这些监听一直挂着,但每个事件只做一次 `active` 判断,代价可忽略.
     * 解绑走同一个 signal,所以 dispose 不需要额外记账.
     */
    handle.addEventListener('pointermove', onPointerMove, { signal });
    handle.addEventListener('pointerup', () => end('pointerup'), { signal });
    handle.addEventListener('pointercancel', () => end('pointercancel'), { signal });

    signal.addEventListener('abort', () => {
        if (aborted) return;
        aborted = true;
        end('abort');
    }, { once: true });
}
