/**
 * 浮层控件(按钮 + 面板的开合).
 *
 * 负责四件事,全是"任何浮层都要有,写第二遍必错"的部分:
 * - **开合态唯一**:`.is-open` 类与 `aria-expanded` 由同一个 `apply` 写入,
 *   构造 / 触发按钮点击 / `open` / `close` / `toggle` / 外部点击 / dispose
 *   都走这一条路径;
 * - **aria 关系**:面板带 id 时把 `aria-controls` 指过去(构造时设定,HTML 里
 *   那份只是首帧占位);
 * - **点外部关闭**:绑定在 `bind(root)` 的根节点上;按钮与面板内部的点击都要
 *   显式排除 -- 按钮自己的 click 会冒泡到根,不排除就会"刚打开又被关掉";
 * - **焦点归还**:`close({ focusTrigger: true })` 交给键盘路径(如 Esc)用;
 *   鼠标点外部关闭不该把焦点抢回按钮.
 *
 * 不负责的:键盘路由(document 级 keydown 只由 `shared/KeyboardController.ts`
 * 绑一次,浮层把规则 `register` 进去),面板内容怎么渲染,选中后
 * 干什么 -- 那些留在各自的控制器里.
 *
 * 样式不在这里:浮层的外观由调用方给类名与 CSS,本控件只维护 `.is-open` 这
 * 一个约定俗成的开合类.
 */
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
    /** 把"点外部关闭"挂到根节点;可反复调用(旧监听先解绑). */
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
    let opened = false;

    if (panel.id) trigger.setAttribute('aria-controls', panel.id);

    /** 开合态的唯一写入点:状态,类名,aria 一起刷新. */
    const apply = (next: boolean): void => {
        opened = next;
        panel.classList.toggle('is-open', next);
        trigger.setAttribute('aria-expanded', String(next));
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
            ownAbort.abort();
            rootAbort?.abort();
            rootAbort = null;
            listeners.clear();
        },
    };
}
