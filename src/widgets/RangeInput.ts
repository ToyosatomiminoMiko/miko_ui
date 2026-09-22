/**
 * 滑杆控件(裸 `<input type="range">`).
 *
 * 这是"拖动取值"的最小件:`Slider`(系数滑块)把它与数值框、重置按钮组合成
 * 一条完整参数行;需要**只**放一条滑杆时(不想带名称/数值/重置),直接用本件.
 *
 * 它与数字框(`NumberField`)是**同一个 `signal<number>` 的两个显示入口**:
 * 滑杆粗调,数字框精调.两边各自把用户的操作写回那个信号(归一化只挂在数字框
 * 上,见 `NumberFieldOptions.normalize`),控件之间不互相写,也不各自留一份
 * 缓存 -- 本控件只报"用户拖到多少".
 *
 * 产出的结构与手写 HTML 一致(`<input type="range" min max step>`);类名由
 * 调用方所在的容器决定(见 `styles/widgets.css` 的 `.slider-field-range` /
 * `.control-row input[type="range"]`),本件自己不设类名.
 *
 * `value` 可以是普通值或 signal:给 signal 时滑杆由绑定驱动,拖动写回它.
 */
import { peekValue, setValue, watchValue, type ValueSource } from '../reactive';
import { create_element, nextWidgetId } from './dom';

/**
 * 滑杆的缺省区间:调用方不写 `min` / `max` / `step` 时用它兜底.
 *
 * 单一来源:裸滑杆与系数滑块(`Slider`)都读这一份,所以"两条入口的缺省口径"
 * 永远不会分叉.缺省只负责"没写"的情况 -- 写了 `value` 却落在区间外时,浏览器
 * 会把滑杆夹到端点(与数值框文本可能不一致),真实控件请显式给全三项.
 */
export const DEFAULT_RANGE = { min: 0, max: 1, step: 0.01 } as const;

export interface RangeInputOptions {
    /** 初值,或一个会驱动本控件的 signal. */
    value: ValueSource<number>;
    /** 下限;省略取 {@link DEFAULT_RANGE}. */
    min?: number;
    /** 上限;省略取 {@link DEFAULT_RANGE}. */
    max?: number;
    /** 步长;省略取 {@link DEFAULT_RANGE}. */
    step?: number;
    /**
     * 可访问名.放进带可见 `<label for>` 的复合件(如 `Slider`)里时省略:
     * 可见标签已经命名了滑杆,再给 `aria-label` 会念两遍.
     */
    ariaLabel?: string;
}

/** 滑杆句柄:根节点就是那个 `<input>`;外部一律拿句柄,不按 id 查节点. */
export interface RangeInputHandle {
    /** 根节点,插到容器里用这个.本控件的根就是那个 `<input>`,与 `input` 同节点. */
    readonly element: HTMLInputElement;
    /** 原生 range:标签关联(`<label for>`)、属性级写入(`min`/`max`)用它. */
    readonly input: HTMLInputElement;
    get(): number;
    /** 程序化写值;不触发 `onInput`,也不写回值源. */
    set(value: number): void;
    /** 注册拖动回调;返回退订函数. */
    onInput(listener: (value: number) => void): () => void;
    dispose(): void;
}

export function createRangeInput(options: RangeInputOptions): RangeInputHandle {
    const source = options.value;
    const input = create_element('input');
    input.type = 'range';
    input.id = nextWidgetId('range');
    input.min = String(options.min ?? DEFAULT_RANGE.min);
    input.max = String(options.max ?? DEFAULT_RANGE.max);
    input.step = String(options.step ?? DEFAULT_RANGE.step);
    input.value = String(peekValue(source));
    if (options.ariaLabel !== undefined) {
        input.setAttribute('aria-label', options.ariaLabel);
    }

    const listeners = new Set<(value: number) => void>();
    const abort = new AbortController();
    input.addEventListener('input', () => {
        const value = Number(input.value);
        // 用户拖动:先写回值源(signal),再通知订阅者.
        setValue(source, value);
        for (const listener of [...listeners]) listener(value);
    }, { signal: abort.signal });

    // value 是 signal 时由它驱动 DOM;普通值只在建控件时用一次.
    const stopSource = watchValue(source, (next) => {
        input.value = String(next);
    });

    return {
        element: input,
        input,
        get: () => Number(input.value),
        set: (value) => {
            // 程序化写值只改控件本身,不写回值源.
            input.value = String(value);
        },
        onInput(listener) {
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
