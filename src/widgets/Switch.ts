/**
 * 开关控件(`<input type="checkbox">` 的统一件).
 *
 * 产出的 DOM 直接复用 `styles/widgets.css` 的 `.switch` / `.slider`:
 *
 * ```html
 * <label class="switch">
 *   <input type="checkbox" id="ui-switch-1" aria-label="...">
 *   <span class="slider"></span>
 * </label>
 * ```
 *
 * 状态归属:控件自己持有勾选态(`input.checked` 就是状态),`get()` 读它,
 * `set()` 程序化写它,`onChange` 通知外部.外部(控制器)**不反向持有**一份
 * 布尔值再同步回来 -- 两个状态源会互相覆盖;控制器只在需要按配置打初值时
 * `set()` 一次.
 *
 * `value` 也可以直接给一个 **signal**:那时控件由绑定驱动 -- 值变了自己更新
 * DOM,用户切换写回 signal,调用方不必再写 `onChange` + `set()` 的手工回路.
 */
import { peekValue, setValue, watchValue, type ValueSource } from '../reactive';
import { create_element, nextWidgetId } from './dom';

export interface SwitchOptions {
    /** 初值,或一个会驱动本控件的 signal. */
    value: ValueSource<boolean>;
    /**
     * 可访问名.
     *
     * 用 {@link createSwitchRow} / {@link createInlineToggle} 放进带可见
     * `<label for>` 的行里时**必须省略**:可见标签已经命名了控件,再给
     * `aria-label` 会让读屏把名字念两遍.
     */
    ariaLabel?: string;
}

/** 开关句柄:外部只认它,不按 id 去 document 里找节点. */
export interface SwitchHandle {
    /** 根节点(`<label class="switch">`),插到行里用这个. */
    readonly element: HTMLLabelElement;
    /** 原生复选框:标签关联(`<label for>`)与 `checked` 级读写才用它. */
    readonly input: HTMLInputElement;
    get(): boolean;
    /** 程序化写值;不触发 `onChange`,也不写回值源(状态请写 signal). */
    set(value: boolean): void;
    /** 注册用户切换回调;返回退订函数. */
    onChange(listener: (value: boolean) => void): () => void;
    /** 解绑 DOM 监听并清空订阅者. */
    dispose(): void;
}

export function createSwitch(options: SwitchOptions): SwitchHandle {
    const source = options.value;
    const input = create_element('input');
    input.type = 'checkbox';
    input.id = nextWidgetId('switch');
    input.checked = peekValue(source);
    if (options.ariaLabel !== undefined) {
        input.setAttribute('aria-label', options.ariaLabel);
    }

    const element = create_element(
        'label',
        { class: 'switch' },
        input,
        create_element('span', { class: 'slider' }),
    );

    const listeners = new Set<(value: boolean) => void>();
    const abort = new AbortController();
    input.addEventListener('change', () => {
        // 用户切换:先写回值源(signal),再通知订阅者.
        setValue(source, input.checked);
        for (const listener of [...listeners]) listener(input.checked);
    }, { signal: abort.signal });

    // value 是 signal 时由它驱动 DOM;普通值只在建控件时用一次.
    const stopSource = watchValue(source, (next) => {
        input.checked = next;
    });

    return {
        element,
        input,
        get: () => input.checked,
        set: (value) => {
            // 程序化写值只改控件本身,不写回值源(否则外部 `set()` 会改到状态源).
            input.checked = value;
        },
        onChange(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        dispose() {
            abort.abort();
            stopSource();
            listeners.clear();
        },
    };
}
