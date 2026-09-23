/**
 * 系数滑块:一条完整的参数行 = **名称 + 滑杆 + 数值框 + 重置按钮**.
 *
 * 它是"拖动改一个系数"的复合件,把三个更小的件配在一起:
 *
 * ```text
 * <div class="slider-field [is-cyclic]">       <- 根,样式由 .slider-field 一处控制
 *   <input class="slider-field-range" type="range">   <- 粗调(RangeInput,类名由本件挂上)
 *   <div class="slider-field-meta">
 *     <label class="slider-field-label" for=滑杆>名称 <small>提示</small> <span class="slider-field-tag">cyclic</span></label>
 *     <input class="slider-field-value" type="number">  <- 精调(NumberField,类名由本件挂上)
 *     <button class="ui-button slider-field-reset">reset</button>  <- 重置(Button)
 *   </div>
 * </div>
 * ```
 *
 * ## 一份状态
 *
 * `value` 是滑杆与数值框**共同的唯一值源**:拖动写它,输入框归一化后写它,
 * 重置也写它;两个子控件各自订阅它更新自己.控件之间没有第二条同步回路,
 * 调用方也不需要再存一份"当前值".
 *
 * `Slider` 只是 `RangeInput` 的一种封装:**只**要一条裸滑杆时直接用
 * `createRangeInput`,不必为了一个 range 拖上名称与重置.
 *
 * ## 值与文本的分工
 *
 * - `normalize`(可选)收在数值框上:滑杆本身不会越界,不必再过一遍;
 * - `parse` / `format`(可选)决定"文本 <-> 值"的口径;`format` 同时用于重置
 *   按钮的 `title` / `aria-label`(点之前就能看到会回到多少);
 * - 数值框沿用 `NumberField` 的**保守策略**:`input` 阶段不改写用户正在编辑
 *   的文本(空串 / `1.` / `1e` 都不动输入框),归一化后的文本只在 `change`
 *   (失焦 / 回车)时落回输入框.
 *
 * ## 重置按钮
 *
 * 目标值是 `resetValue`(默认取建控件时的初值,也就是"声明值");它与拖动,
 * 输入走同一条"写值源"链路,所以外部订阅者会照常收到通知.按钮在下列两种
 * 情况下置灰:
 * 1. 值已经等于目标值;且
 * 2. 数值框文本已经是目标值的文本.
 *
 * 第 2 条不能省:清空输入框时解析失败,值源根本没变,写成 `1.` 这类文本时值
 * 也可能没变,但文本已经与目标值不同 -- 正需要用重置把它恢复回去,只比值的
 * 实现会让按钮在那一刻点不动.
 */
import {
    isSignal,
    onValueChange,
    peekValue,
    signal,
    watchValue,
    type Signal,
} from '../reactive';
import { createButton, type ButtonHandle } from './Button';
import { create_element } from './dom';
import { createNumberField, type NumberFieldHandle } from './NumberField';
import { createRangeInput, DEFAULT_RANGE, type RangeInputOptions } from './RangeInput';

/**
 * 系数滑块的配置.
 *
 * `value` / `min` / `max` / `step` 直接沿用裸滑杆的那一套(见
 * {@link RangeInputOptions}):缺省值只有 `DEFAULT_RANGE` 一份,这里不再抄一遍.
 * 数值框与滑杆拿到的是**同一份解析后的区间**,两条入口的上下限不会分叉.
 */
export interface SliderOptions extends Omit<RangeInputOptions, 'ariaLabel'> {
    /** 可见名称:既是 `<label for>` 的文本,也是数值框与重置按钮可访问名的来源. */
    label: string;
    /** 名称后的小字提示(单位 / 说明);省略时不建那个 `<small>`. */
    hint?: string;
    /** 循环类系数:名称后挂一枚 `cyclic` 徽章,并给根节点加 `is-cyclic`. */
    cyclic?: boolean;
    /** 重置目标值;默认取建控件时 `value` 的值(声明值). */
    resetValue?: number;
    /** 值 -> 文本;默认 `String()`.数值框与重置按钮的标题共用同一个口径. */
    format?(value: number): string;
    /** 文本 -> 值;默认 trim 后 `Number.isFinite` 校验.返回 null 表示不可解析. */
    parse?(text: string): number | null;
    /** 写回值源前的归一化(夹取 / 圆周回绕 / 取整...);默认原样.只挂在数值框上. */
    normalize?(value: number): number;
}

/** 系数滑块句柄:外部只认它,不按 id 去 document 里找节点. */
export interface SliderHandle {
    /** 根节点(`<div class="slider-field">`),插进容器用这个. */
    readonly element: HTMLDivElement;
    /** 名称标签:需要改文案时改它,不必再按 id 查. */
    readonly label: HTMLLabelElement;
    /** 原生 range:标签关联与细粒度写入用它. */
    readonly input: HTMLInputElement;
    /** 数值框句柄:`read` / `readText` / `write` 在它上面. */
    readonly number: NumberFieldHandle;
    /** 重置按钮句柄:`onClick` 已由本控件内部接好,外部一般只用它的元素. */
    readonly reset: ButtonHandle;
    /** 当前值(读的是那个唯一值源). */
    get(): number;
    /**
     * 注册值变化回调(拖动滑杆 / 数值框输入 / 重置都会触发);订阅时不回调.
     *
     * 值源是调用方的 signal 时,用 `onValueChange(signal, ...)` 也一样;
     * 这个入口是给"传普通值"的调用方留的通知出口.
     */
    onInput(listener: (value: number) => void): () => void;
    /** 解绑全部子控件与监听. */
    dispose(): void;
}

export function createSlider(options: SliderOptions): SliderHandle {
    const format = options.format ?? ((value: number) => String(value));
    const resetValue = options.resetValue ?? peekValue(options.value);

    /**
     * 唯一值源:调用方给的是 signal 就直接用它(它的订阅者照常收到改动);
     * 给普通值时控件自己建一个同值 signal -- 滑杆与数值框总得有个共同的值
     * 才能互相同步:两条入口各存一份就会分叉.
     */
    const external = options.value;
    const value: Signal<number> = isSignal<number>(external)
        ? (external as Signal<number>)
        : signal(peekValue(external));

    // 区间只解析一次,滑杆与数值框共用同一份(缺省值也只有 DEFAULT_RANGE 一份).
    const min = options.min ?? DEFAULT_RANGE.min;
    const max = options.max ?? DEFAULT_RANGE.max;
    const step = options.step ?? DEFAULT_RANGE.step;

    const range = createRangeInput({ value, min, max, step });
    const number = createNumberField({
        value,
        min,
        max,
        step,
        format,
        parse: options.parse,
        // 归一化只挂在数值框上:滑杆不会越界,再走一遍回绕反而会把"拖到 max"变成 min.
        normalize: options.normalize,
        // 可见 label 关联的是滑杆(一行里那个大热区);数值框单独命名.
        ariaLabel: options.cyclic ? `${options.label} 数值(循环)` : `${options.label} 数值`,
    });
    // 两个 input 的定位类名由本件挂上:RangeInput/NumberField 是裸件,外观交给复合件.
    range.element.classList.add('slider-field-range');
    number.input.classList.add('slider-field-value');
    const reset = createButton({
        class: 'slider-field-reset',
        text: 'reset',
        // 名字进 aria-label,目标值进 title:重置是"回到某个确定的值",点之前就该看到它是多少.
        title: `重置为 ${format(resetValue)}`,
        ariaLabel: `重置 ${options.label} 为 ${format(resetValue)}`,
    });

    // 循环参数在名字后挂一枚 `cyclic` 徽章:让"这个量在圆周上"看得见,
    // 但**不**给名字本身换颜色.
    // 名字与徽章之间那个空格只进可访问名(`<label for>` 的文本);flex 布局里
    // 纯空白文本节点不渲染,视觉间距仍由 CSS 的 gap 给.
    const tag = options.cyclic
        ? create_element('span', { class: 'slider-field-tag' }, 'cyclic')
        : null;
    const label = create_element(
        'label',
        { class: 'slider-field-label' },
        options.label,
        options.hint === undefined ? null : create_element('small', {}, options.hint),
        tag === null ? null : ' ',
        tag,
    );
    label.htmlFor = range.input.id;

    const element = create_element(
        'div',
        { class: 'slider-field' },
        range.element,
        create_element('div', { class: 'slider-field-meta' }, label, number.input, reset.element),
    );
    if (options.cyclic) element.classList.add('is-cyclic');

    /**
     * 是否已停在目标值上:值取自值源,文本取自数值框.
     *
     * 文本必须一起比(见文件头"重置按钮"):清空 / `1.` 这类文本态下值没变,
     * 但用户正需要重置把文本恢复回去.
     */
    const isAtResetValue = (): boolean =>
        value.peek() === resetValue && number.readText() === format(resetValue);

    const refreshResetAvailability = (): void => {
        reset.setDisabled(isAtResetValue());
    };

    // 值一变就刷新按钮可用态;`watchValue` 会立刻回调一次,所以初值也走这条.
    const stopValueWatch = watchValue(value, () => {
        refreshResetAvailability();
    });

    /**
     * `input` 阶段解析不出值时值源没变(控件不写回),但文本已经变了
     * (清空 / `-` / `1e`):可用态要跟着文本走,否则用户清空后反而点不了重置.
     */
    number.onInput((raw) => {
        if (raw === null) refreshResetAvailability();
    });

    /**
     * `change` 阶段:归一化结果已经进了值源(见 `NumberField.normalize`),
     * 这里把最终文本落到输入框上;解析失败时用当前值恢复文本,值不变也就不广播.
     */
    number.onCommit(() => {
        number.write(value.peek());
        refreshResetAvailability();
    });

    /**
     * 重置:回到目标值.
     *
     * 文本必须**显式**写回:值可能本来就在目标值上(用户只是把输入框清空了),
     * 那种情况下写信号是空操作,镜像不会动,不写文本输入框就会一直空着.
     */
    reset.onClick(() => {
        value.value = resetValue;
        number.write(resetValue);
        refreshResetAvailability();
    });

    const listeners = new Set<(value: number) => void>();
    const stopNotify = onValueChange(value, (next) => {
        for (const listener of [...listeners]) listener(next);
    });

    return {
        element,
        label,
        input: range.input,
        number,
        reset,
        get: () => value.peek(),
        onInput(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        dispose() {
            range.dispose();
            number.dispose();
            reset.dispose();
            stopValueWatch();
            stopNotify();
            listeners.clear();
        },
    };
}
