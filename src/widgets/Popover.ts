/**
 * 浮层控件(按钮 + 面板的开合 + 落点).
 *
 * 负责五件事,全是"任何浮层都要有,写第二遍必错"的部分:
 * - **开合态唯一**:`.is-open` 类与 `aria-expanded` 由同一个 `apply` 写入,
 *   构造 / 触发按钮点击 / `open` / `close` / `toggle` / 外部点击 / dispose
 *   都走这一条路径;
 * - **aria 关系**:面板带 id 时把 `aria-controls` 指过去(构造时设定,HTML 里
 *   那份只是首帧占位);
 * - **落点**:锚点(`.menu-anchor`)是零盒子(`display: contents`),没有
 *   `position: relative`,不能给绝对定位的面板当包含块 -- 打开时量触发件的矩形,
 *   给面板写 `left` / `top` / `min-width`,让它在视口边上翻转 / 夹取(算法在
 *   `overlayPlacement.ts`);开着的时候滚动 / 改窗口尺寸会重新量一次;
 * - **点外部关闭**:绑定在 `bind(root)` 的根节点上;按钮与面板内部的点击都要
 *   显式排除 -- 按钮自己的 click 会冒泡到根,不排除就会"刚打开又被关掉";
 * - **焦点归还**:`close({ focusTrigger: true })` 交给键盘路径(如 Esc)用;
 *   鼠标点外部关闭不该把焦点抢回按钮.
 *
 * 不负责的:面板内容怎么渲染,选中后干什么 -- 那些留在各自的控制器里.
 *
 * 样式不在这里:浮层的外观由调用方给类名与 CSS,本控件只维护 `.is-open` 这
 * 一个约定俗成的开合类;`.menu-popover` 的 `position: absolute` / `z-index`
 * 也归样式表,脚本只写坐标.
 */
import { placeOverlay } from './overlayPlacement';

/** 落点时浮层与视口边的最小空白(px):阴影 / 描边贴边会被切. */
const PLACEMENT_MARGIN = 8;

export interface PopoverOptions {
    /** 触发按钮. */
    trigger: HTMLElement;
    /** 浮层本体;带 id 时自动建立 `aria-controls` 关系. */
    panel: HTMLElement;
}

export interface PopoverHandle {
    readonly isOpen: boolean;
    open(): void;
    /** 关闭;`focusTrigger` 为真时把焦点交还触发按钮(键盘路径用). */
    close(options?: { focusTrigger?: boolean }): void;
    toggle(): void;
    /** 注册开合回调;返回退订函数. */
    onOpenChange(listener: (open: boolean) => void): () => void;
    /** 把"点外部关闭"挂到根节点(有 `trigger` 时);可反复调用. */
    bind(root: HTMLElement): void;
    /** 关闭浮层并摘掉全部监听. */
    dispose(): void;
}

export function createPopover(options: PopoverOptions): PopoverHandle {
    const { trigger, panel } = options;
    const listeners = new Set<(open: boolean) => void>();
    // 触发按钮的监听从构造起就有效;外部点击要等 bind(root) 知道根是谁.
    const ownAbort = new AbortController();
    let rootAbort: AbortController | null = null;
    /** 开着的时候挂的滚动 / 缩放监听;关上就 abort,不留常驻监听. */
    let trackingAbort: AbortController | null = null;
    let opened = false;

    if (panel.id) trigger.setAttribute('aria-controls', panel.id);

    /**
     * 把面板钉到触发件下方(贴不下就翻转 / 夹取).
     *
     * 面板是 `position: absolute` 的,`left` / `top` 相对**包含块**而不是视口:
     * 先把 `left/top` 归零,此时面板矩形的左上角就是包含块原点(视口坐标),量出来
     * 之后一减,就能把 `placeOverlay()` 给的视口坐标换回包含块坐标.面板此时已经是
     * `.is-open`(display:block),宽高都量得到.
     *
     * 为什么不直接读 `offsetParent`:包含块是它的 padding box,扣 border / 滚动偏移
     * 还得另算;归零再量只用两个矩形相减,没有"哪种定位祖先算 / 不算"的分支.
     */
    const place = (): void => {
        if (!opened) return;
        const view = trigger.ownerDocument.defaultView;
        if (view === null) return;
        const viewport = { width: view.innerWidth, height: view.innerHeight };
        if (viewport.width <= 0 || viewport.height <= 0) return;

        const triggerRect = trigger.getBoundingClientRect();
        // 先落 `min-width` 再量:宽度不小于触发件是"看起来连着"的一部分,要算进
        // 翻转 / 夹取的尺寸里.
        panel.style.setProperty('min-width', `${triggerRect.width}px`);
        panel.style.setProperty('left', '0px');
        panel.style.setProperty('top', '0px');
        panel.style.setProperty('right', 'auto');
        panel.style.setProperty('bottom', 'auto');
        const origin = panel.getBoundingClientRect();
        const target = placeOverlay({
            trigger: triggerRect,
            panel: { width: origin.width, height: origin.height },
            viewport,
            margin: PLACEMENT_MARGIN,
        });
        panel.style.setProperty('left', `${target.left - origin.left}px`);
        panel.style.setProperty('top', `${target.top - origin.top}px`);
    };

    /** 开着时跟住视口 / 滚动容器:触发件动了,浮层不能留在原地. */
    const track = (): void => {
        const view = trigger.ownerDocument.defaultView;
        if (view === null) return;
        trackingAbort?.abort();
        trackingAbort = new AbortController();
        const { signal } = trackingAbort;
        // capture:滚动事件不冒泡,窗口正文 / 列表这类内层滚动容器里的滚动也要接住.
        view.addEventListener('scroll', place, { capture: true, passive: true, signal });
        view.addEventListener('resize', place, { passive: true, signal });
    };

    const untrack = (): void => {
        trackingAbort?.abort();
        trackingAbort = null;
    };

    const apply = (next: boolean): void => {
        opened = next;
        panel.classList.toggle('is-open', next);
        trigger.setAttribute('aria-expanded', String(next));
        if (next) {
            // 先显示再量:display:none 的面板量出来是 0×0,落点会全是夹取结果.
            place();
            track();
        } else {
            untrack();
        }
        for (const listener of [...listeners]) listener(next);
    };

    const close = (closeOptions: { focusTrigger?: boolean } = {}): void => {
        if (!opened) return;
        apply(false);
        if (closeOptions.focusTrigger) trigger.focus();
    };

    // 初始态也由本控件写入,不依赖 HTML 里的占位属性
    apply(false);

    trigger.addEventListener('click', () => {
        apply(!opened);
    }, { signal: ownAbort.signal });

    return {
        get isOpen() {
            return opened;
        },
        open() {
            if (opened) return;
            apply(true);
        },
        close,
        toggle() {
            apply(!opened);
        },
        onOpenChange(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        bind(root) {
            rootAbort?.abort();
            rootAbort = new AbortController();
            root.addEventListener('click', (event) => {
                if (!opened) return;
                const target = event.target;
                if (
                    target instanceof Element
                    && (trigger.contains(target) || panel.contains(target))
                ) {
                    return;
                }
                close();
            }, { signal: rootAbort.signal });
        },
        dispose() {
            // 先复位 DOM 再摘监听:dispose 后浮层不能留在屏幕上.
            close();
            untrack();
            ownAbort.abort();
            rootAbort?.abort();
            rootAbort = null;
            listeners.clear();
        },
    };
}
