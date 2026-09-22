/**
 * 按钮控件(`<button type="button">`).
 *
 * 库内所有按钮的统一件.现在的消费者有五处:
 * - 系数滑块的重置(`reset`,`slider-field-reset`);
 * - 求值行末的"过程"(`row-process-btn`);
 * - 行末显隐(`row-visibility-btn`,见 `shared/rowDom.ts`);
 * - **窗口标题栏的控制按钮**(`window-control-btn`,见 `desktop/WindowFrame.ts`);
 * - 库示例页的 RUN.
 *
 * 它们共同的部分是:永远是 `type="button"`(不该在任何地方触发表单提交),
 * 有独立的可访问名,可置灰,文案会变 -- 这些收在这里.
 *
 * 与 `Switch` / `Segmented` 一致:选项只描述**外观**,点击回调在拿到句柄后
 * 用 `onClick(listener)` 注册.这样"建控件"与"接线"分开,回调也能引用尚未
 * 定义的闭包(如参数行里互相依赖的写值函数).
 *
 * 类名由调用方给(`slider-field-reset` / `row-visibility-btn` / `window-control-btn`),
 * 样式仍归 CSS:库不替按钮决定长什么样(见 `styles/widgets.css` 的头).
 */
import { create_element } from './dom';

export interface ButtonOptions {
    text: string;
    /** 样式类名;沿用现有 CSS(`.param-reset-btn` / `.row-visibility-btn` ...). */
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
    const element = create_element('button', { class: options.class }, options.text);
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
