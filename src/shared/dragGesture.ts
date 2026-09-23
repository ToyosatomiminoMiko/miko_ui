/**
 * 指针拖动:按下起手 / 移动累计 / 松开收尾,收尾时复位光标与拖动标记.
 *
 * 这是库内**唯一一份**拖动实现,两个消费者:
 * - `desktop/WindowManager`:窗口标题栏的拖动(移动整个窗口);
 * - `desktop/WindowResize`:八根 `[data-window-resize]` 手柄的八向缩放.
 *
 * 为什么必须共用:按下起手 / 累计位移 / 收尾复位 `document.body.style.cursor`
 * 这套流程写两份,就会在细节上分叉(收尾监听绑在谁身上,光标写死还是读计算
 * 样式),分叉处就是理解偏差的藏身处.收成一份之后,光标只有一个来源(CSS),
 * 收尾只有一条路径(signal).
 *
 * 两个刻意的设计点:
 * - **增量而非"起点 + 总位移"**:比例/宽度被上下限夹住之后,指针回退一小段
 *   就能立刻重新跟手,不会出现一段"死区".
 * - **位移是像素原始值**,怎么解释(加到宽度上还是减到宽度上,除以容器高度
 *   变成比例)由 `onDelta` 的实现决定,本模块不认识"宽/高/比例"任何一个概念.
 *
 * 收尾方式:pointerup / pointercancel 绑在 handle 自己身上,靠起手时的
 * `setPointerCapture` 收事件(指针可能已经离开 handle 甚至离开窗口),并给
 * handle 加 `is-dragging` 类供 CSS 表达拖动中状态.
 */

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
     * 少写参数,如 `desktop/WindowResize` 写 `onStart: () => {}`).
     */
    onStart(event: PointerEvent): void;
    /**
     * 指针位移(像素,原样);`deltaX`/`deltaY` 都是"本次相对上次"的增量.
     *
     * 第三个参数是原始事件:窗口拖动用它按指针在桌面上的位置判定边缘吸附
     * (见 `desktop/WindowGeometry.resolveEdgeSnap`).
     */
    onDelta(deltaX: number, deltaY: number, event: PointerEvent): void;
    /** 松开 / 取消 / 被解绑;只有真正起手过的拖动才回调,用于复位只属于这次拖动的外部状态. */
    onEnd(): void;
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

    const end = (): void => {
        if (!active) return;
        active = false;
        if (pointerId !== -1 && handle.hasPointerCapture?.(pointerId)) {
            handle.releasePointerCapture(pointerId);
        }
        pointerId = -1;
        handle.classList.remove('is-dragging');
        onCursorReset();
        handlers.onEnd();
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
    handle.addEventListener('pointerup', end, { signal });
    handle.addEventListener('pointercancel', end, { signal });

    signal.addEventListener('abort', () => {
        if (aborted) return;
        aborted = true;
        end();
    }, { once: true });
}
