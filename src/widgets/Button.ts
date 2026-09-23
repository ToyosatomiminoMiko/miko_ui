/**
 * 按钮控件(`<button type="button">`).
 *
 * 库内所有按钮的统一件.库内的调用点:
 * - 系数滑块的重置(`reset`,`slider-field-reset`,见 `widgets/Slider.ts`);
 * - 行末显隐(`row-visibility-btn`,见 `shared/rowDom.ts`);
 * - **窗口标题栏的控制按钮**(`window-control-btn`,见 `desktop/WindowFrame.ts`);
 * - **窗口按钮与"全部还原"**(`dock-btn` / `dock-action`,见 `desktop/Dock.ts`);
 * - 库示例页的计数按钮(`计数 +1`,见 `example/main.ts`).
 *
 * 它们共同的部分是:永远是 `type="button"`(不该在任何地方触发表单提交),
 * 可给独立可访问名,可置灰,文案会变 -- 这些收在这里.
 *
 * 与 `Switch` / `Segmented` 一致:选项只描述**外观**,点击回调在拿到句柄后
 * 用 `onClick(listener)` 注册.这样"建控件"与"接线"分开,回调也能引用尚未
 * 定义的闭包(如参数行里互相依赖的写值函数).
 *
 * **每个按钮都带基线类 `.ui-button`**,`options.class` 再叠在它后面.这不是装饰:
 * 不写基线,浏览器就按 UA 的那套画按钮 -- 自带圆角,底色,边框与字体.本项目的
 * token 里四个 `--radius-*` 都是 0,于是那圈 UA 圆角看起来就像"按钮从别处继承了
 * 圆角".基线只给盒模型 / 描边 / 悬停 / 焦点 / 禁用态,写成 `:where(.ui-button)`
 * 的零优先级规则,所以任何变体类(如 `row-visibility-btn`)或消费者自己的类都能
 * 盖住它,与样式表加载顺序无关(见 `styles/widgets.css` 的"按钮基线").
 *
 * 另有一类类名只是**定位钩子**,不带任何声明:`slider-field-reset` /
 * `window-control-btn`.按钮之间真正的差别是行为(点下去写哪份状态)和位置,
 * 不是长相,所以能同款就同款.
 */
import { create_element } from './dom';

/** 基线类名:每个按钮都带;样式在 `styles/widgets.css`. */
const BASE_CLASS = 'ui-button';

export interface ButtonOptions {
    text: string;
    /** 追加类名,叠在基线 `.ui-button` 之后(多为定位钩子,见文件头). */
    class?: string;
    ariaLabel?: string;
    title?: string;
    disabled?: boolean;
}

export interface ButtonHandle {
    readonly element: HTMLButtonElement;
    /** 注册点击回调;返回退订函数. */
    onClick(listener: () => void): () => void;
    setText(text: string): void;
    setDisabled(disabled: boolean): void;
    dispose(): void;
}

export function createButton(options: ButtonOptions): ButtonHandle {
    const className = options.class ? `${BASE_CLASS} ${options.class}` : BASE_CLASS;
    const element = create_element('button', { class: className }, options.text);
    // 页面上没有表单,但显式声明 type 才不会在将来被塞进 <form> 时变成提交按钮
    element.type = 'button';
    if (options.ariaLabel !== undefined) {
        element.setAttribute('aria-label', options.ariaLabel);
    }
    if (options.title !== undefined) element.title = options.title;
    element.disabled = options.disabled ?? false;

    const listeners = new Set<() => void>();
    const abort = new AbortController();
    element.addEventListener('click', () => {
        for (const listener of [...listeners]) listener();
    }, { signal: abort.signal });

    return {
        element,
        onClick(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        setText: (text) => {
            element.textContent = text;
        },
        setDisabled: (disabled) => {
            element.disabled = disabled;
        },
        dispose() {
            abort.abort();
            listeners.clear();
        },
    };
}
