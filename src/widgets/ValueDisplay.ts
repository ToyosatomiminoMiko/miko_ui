/**
 * 只读数值显示:一个 `<output>` 裸件,以及复用 `.control-row` 的整行读数.
 *
 * ## 为什么要有它
 *
 * 库里 `createNumberRow` / `createSwitchRow` 都有,唯独"只读的值"没有,于是每个
 * 消费者都自己写一份读数行与一份 `.readout*` 样式(实测:两个消费者合计 8 处各自
 * 实现,零共享类名).同一份值因此在框里,滑杆旁,读数处显示成三种文本.
 *
 * 这一件把"只读的值"收成库内的唯一出口,并顺带补上消费者侧**两处全为零**的能力:
 *
 * 1. `<output>` 语义(`aria-live` 的处理见下);
 * 2. **全精度 `title`**:显示文本短,鼠标停上去看到真实值 -- `0.1 + 0.2` 显示
 *    `0.3`,`title="0.30000000000000004"`.这条替代"提高小数位直到看得出来".
 *
 * 等宽数字由样式层给(`styles/widgets.css` 的 `.ui-readout-value` 带
 * `font-variant-numeric: tabular-nums`),拖动滑杆时数字宽度不抖.
 *
 * ## 三条硬约定
 *
 * 1. **默认不播报**.HTML-AAM 把 `<output>` 映射成 `role="status"`(隐式 live
 *    region);拖动滑杆时它每帧都变,不关掉就是读屏轰炸.所以库里固定写
 *    `aria-live="off"`,`announce: true` 才交给 ARIA(`polite` + `atomic`).
 * 2. **显示文本走显示档**.默认口径是 `NUMBER_TEXT_DISPLAY`(定点 6 位去尾零,超量级
 *    回退科学计数法),不是 `String(v)` -- 读数要的是"读得懂",不是"一位不差";
 *    一位不差的那个出口是 `title`.
 * 3. **只读,不进 Tab 序**.显示件不接收键盘输入,所以不给 `tabindex`;"点一下变可
 *    编辑"那条路属于文本编辑件,不在这里顺手造.
 *
 * ## 与口径层的关系
 *
 * `text` 收的是 {@link ValueTextSource}(只要 `toText`):显示件不需要把文本读回值,
 * 所以不必被迫实现一个假的 `fromText`.把 `NUMBER_TEXT_EDIT` / `NUMBER_TEXT_DISPLAY`
 * 这类完整 `ValueText` 直接传进来同样成立 -- 这正是"一套口径喂多处"的用法.
 *
 * `render` 是"文本之后"的那一步:要看的是**排版结果**(公式)而不是文本本身时,把
 * `numberText({ syntax: 'latex' })` 的产出交给它就行(通常就是
 * `(text) => createFormulaElement(text, undefined, false)`).做成通用的
 * "文本 -> 节点"出口而不是给显示件加一个"公式变体",是为了不在这里认识任何排版器:
 * 库的 widgets 层因此仍然不认识 formula 层,消费者也不必自己拼一格 DOM.
 */
import { watchValue, type ValueSource } from '../reactive';
import { NUMBER_TEXT_DISPLAY } from '../shared/numberText';
import type { ValueTextSource } from '../shared/valueText';
import { create_element } from './dom';
import { createRow } from './Row';

/** 默认读数文本的占位符(`null` / `undefined` 时显示):空值不装成 0. */
const DEFAULT_PLACEHOLDER = '-';

/**
 * 默认口径:`number` 走显示档,其余 `String()`.
 *
 * 泛型默认值只能这么写:`ValueDisplay<T>` 可以是任意 `T`(消费者的读数不只是数值,
 * 也有文案选择这种 `string | null`),运行时按 `typeof` 分派.
 */
const DEFAULT_VALUE_TEXT: ValueTextSource<unknown> = {
    toText: (value) => (typeof value === 'number' ? NUMBER_TEXT_DISPLAY.toText(value) : String(value)),
};

export interface ValueDisplayOptions<T> {
    /** 初值,或一个会驱动本显示件的 signal. */
    readonly value: ValueSource<T>;
    /**
     * 显示口径;默认:`number` 用 {@link NUMBER_TEXT_DISPLAY},其余 `String()`.
     *
     * 要给"读数与输入框逐字符相同"就用同一个 `ValueText` 对象喂给两边.
     */
    readonly text?: ValueTextSource<T>;
    /**
     * 把**显示文本**换成节点(公式排版等);默认直接用 `textContent`.
     *
     * 收的是"文本 -> 节点"的纯函数,所以本件不必认识任何排版器:要一条 LaTeX 读数就
     * 传 `(text) => createFormulaElement(text, undefined, false)` -- 这正是
     * `numberText({ syntax: 'latex' })` 的落点.
     *
     * 只有非空值走它:空值(`null` / `undefined`)永远显示 {@link placeholder} 纯文本,
     * 所以不要指望在这里处理"公式渲染失败".
     */
    readonly render?: (text: string) => Node;
    /**
     * 全精度文本,写进 `title`;默认 `String(value)`(数值的最短往返表示).
     *
     * 它在**显示文本被舍入**时才是信息:显示 `0.3`,`title` 给
     * `0.30000000000000004`.
     */
    readonly exact?: (value: T) => string;
    /** 空值(`null` / `undefined`)的文案;默认 `'-'`. */
    readonly placeholder?: string;
    /** 值变化是否让读屏播报;默认 `false`(见文件头第 1 条). */
    readonly announce?: boolean;
    /** `<output for=...>`:关联"产生这个值的控件"的 id 列表. */
    readonly forIds?: readonly string[];
    /** 追加在 `.ui-readout-value` 之后的消费者类名(与 `createButton` 同一条约定). */
    readonly class?: string;
}

/** 读数句柄:`element` 插进容器,`set` 就地改文本(不写回值源). */
export interface ValueDisplayHandle<T> {
    /** 根节点(`<output class="ui-readout-value">`). */
    readonly element: HTMLOutputElement;
    /** 程序化写值;只改显示,不写回值源,也不触发任何回调. */
    set(value: T): void;
    /** 解绑与值源的订阅. */
    dispose(): void;
}

export function createValueDisplay<T>(options: ValueDisplayOptions<T>): ValueDisplayHandle<T> {
    const text = options.text ?? (DEFAULT_VALUE_TEXT as ValueTextSource<T>);
    const exact = options.exact ?? ((value: T) => String(value));
    const placeholder = options.placeholder ?? DEFAULT_PLACEHOLDER;
    const announce = options.announce ?? false;
    const renderNode = options.render;

    const output = create_element(
        { tag: 'output' },
        {
            // 基线类在前,消费者类在后:后者才能盖住前者(与 createButton 同一条约定).
            class: options.class === undefined
                ? 'ui-readout-value'
                : `ui-readout-value ${options.class}`,
            'aria-live': announce ? 'polite' : 'off',
            for: options.forIds === undefined || options.forIds.length === 0
                ? undefined
                : options.forIds.join(' '),
        },
    );
    if (announce) output.setAttribute('aria-atomic', 'true');

    const render = (value: T): void => {
        // 泛型上与 null 比较会被 TS 判成"没有重叠",先落到 unknown 再判.
        const raw: unknown = value;
        if (raw === null || raw === undefined) {
            output.textContent = placeholder;
            // 空值不该留着一个"上一个值的全精度"提示.
            output.removeAttribute('title');
            return;
        }
        output.title = exact(value);
        const visible = text.toText(value);
        if (renderNode === undefined) {
            output.textContent = visible;
        } else {
            // 换成节点而不是追加:同一格反复更新时不能越堆越多.
            output.replaceChildren(renderNode(visible));
        }
    };

    // `watchValue` 订阅时立刻回调一次,所以初值不必另写一条路径.
    const stop = watchValue(options.value, render);

    return {
        element: output,
        set: render,
        dispose: stop,
    };
}

/**
 * 一整行读数:`<div class="control-row"><span class="ui-readout-name">名字</span>值</div>`.
 *
 * 复用 `.control-row` 这条"文字 + 控件"的行规则,所以行间距/字号/颜色与参数行一致,
 * 消费者不必为读数再写一套行布局;`name` 节点返回给需要改文案的调用方(与
 * `createNumberRow` 返回 `label` 同一个理由).
 *
 * 名字用 `<span>` 而不是 `<label for>`:读数没有可关联的控件,`for` 指不到东西,
 * 而 `<label>` 不带 `for` 会退化成"没有关联的标签",读屏语义反而更差.
 */
export function createReadoutRow<T>(
    name: string,
    options: ValueDisplayOptions<T>,
): {
    readonly row: HTMLDivElement;
    readonly name: HTMLSpanElement;
    readonly value: ValueDisplayHandle<T>;
} {
    const value = createValueDisplay(options);
    const nameElement = create_element({ tag: 'span' }, { class: 'ui-readout-name' }, name);
    return { row: createRow(nameElement, value.element), name: nameElement, value };
}
