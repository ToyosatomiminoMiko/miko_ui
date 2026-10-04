/**
 * 数字输入控件(页面上所有 `<input type="number">` 的统一件):参数行的精调框
 * (与滑块共用同一个 `signal<number>`),以及线宽 / 大小这类单值输入.
 *
 * 控件只负责"读文本 / 写文本 / 通知",**不替调用方决定非法输入怎么办**:
 * 解析失败时 `onInput` / `onCommit` 收到 `null`,想即时回退就在回调里调
 * `write(上一个合法值)`(用户打不出中途态),想保留用户文本就什么都不做,
 * 只在 `change` 阶段归一化后写回 -- `input` 阶段的文本可能是空串或中途态,
 * 直接 `Number()` 会把空串吞成 0.
 *
 * `text` 是**唯一**的"值 ↔ 文本"出口(默认 {@link NUMBER_TEXT_EDIT}):显示文本与
 * 能被解析回来的文本是同一口径的两个方向,所以合成**一个对象**收,而不是两个回调 --
 * 显示要短,编辑要被 `Number()` 咬住,这两件事分开给就一定会各自漂移.
 *
 * 默认口径**不做舍入**.两条理由都来自 number 输入框本身:它会把不合法文本静默消毒成
 * 空串;而任何定点舍入都会在用户编辑时把值量化到那个位数上(见 `shared/numberText.ts`
 * 的"编辑档"一节).传进来的口径在建控件时过一次语法自检({@link assertEditSafe}),
 * 不合格**直接抛** -- 坏口径不该表现成"输入框莫名其妙变空".
 *
 * `value` 可以是普通值或 signal.给 signal 时有一个额外的小心处:用户输入的
 * 中途文本(`1.` / `0`)会被写回 signal,如果镜像更新立刻用 `text.toText` 改写文本,
 * 用户就打不出小数点了.所以**控件自己写进值源的那一次变化会被跳过**(见
 * `selfWrite`),文本只在别处改值时被规范化.
 */
import { peekValue, setValue, watchValue, type ValueSource } from '../reactive';
import { assertEditSafe, NUMBER_TEXT_EDIT } from '../shared/numberText';
import type { ValueText } from '../shared/valueText';
import { create_element, nextWidgetId } from './dom';

export interface NumberFieldOptions {
    /** 初值,或一个会驱动本控件的 signal. */
    value: ValueSource<number>;
    min?: number;
    max?: number;
    /**
     * 步长;也可以是 signal(步长随别处的状态变时).
     *
     * 与 `value` 同一套绑定语义:`input.step` 跟着它走.
     */
    step?: ValueSource<number>;
    /**
     * 可访问名.放进带可见 `<label for>` 的行里时省略.
     */
    ariaLabel?: string;
    /**
     * 值 ↔ 文本的口径;默认 {@link NUMBER_TEXT_EDIT}(无损,不做舍入).
     *
     * 必须是**编辑档**:输出要能被 `<input type="number">` 咬住.带单位或千位分隔符
     * 的文本会被浏览器静默消毒成空串,所以那种配置在这里**抛错**而不是静默生效
     * (判据见 `shared/numberText.ts` 的 {@link assertEditSafe}).
     *
     * 要给"固定两位小数"的外观(如 `0.9` 写成 `0.90`),用
     * `numberText({ syntax: 'edit', digits: 2, trimZeros: false })`,并保证
     * `digits` 覆盖本控件 `step` 的小数位,否则用户一编辑值就被量化.
     *
     * 自己实现 `ValueText` 时,**非有限值必须自己落到合法写法上**(通常给空串):
     * `String(NaN)` 与 `(NaN).toFixed(2)` 都是 `'NaN'`,会被浏览器消毒成空串.
     */
    text?: ValueText<number>;
    /**
     * 写回值源前的归一化(夹取 / 圆周回绕 / 取整...);默认原样.
     *
     * 只在"控件把用户输入写回 signal"这一条路上生效:**信号里永远不会出现
     * 未归一化的值**,于是绑在同一个信号上的其它控件(滑块)拿到的也是归一化
     * 后的值,不需要各自再夹一次.
     *
     * 它不影响 `read()` / `readText()`:那两个读的是用户眼前的文本.
     */
    normalize?(value: number): number;
}

/**
 * 数字框句柄.
 *
 * 与其它控件同一个句柄形状:`element` = 插进行里的根节点,`input` = 原生输入框.
 * 本控件的根就是那个 `<input>`,所以两者同节点.
 */
export interface NumberFieldHandle {
    /** 根节点,插到行里用这个.与 `input` 同节点. */
    readonly element: HTMLInputElement;
    /** 原生 number:标签关联(`<label for>`),属性级写入(`min`/`max`)用它. */
    readonly input: HTMLInputElement;
    /** 当前文本解析出的值;空串/中途态(`-` / `1e` / `.`)为 null. */
    read(): number | null;
    /** 当前原始文本;需要比对"文本是否被改过"时(如参数行重置按钮)用它. */
    readText(): string;
    /** 按口径写文本;只改控件本身,不写回值源. */
    write(value: number): void;
    /** 原样写文本(不做口径转换). */
    writeText(text: string): void;
    /** `input` 阶段(每次按键);参数已按口径解析,失败为 null. */
    onInput(listener: (value: number | null) => void): () => void;
    /** 原生 `change`(失焦/回车);参数同上,控件在该阶段也不改写文本. */
    onCommit(listener: (value: number | null) => void): () => void;
    dispose(): void;
}

export function createNumberField(options: NumberFieldOptions): NumberFieldHandle {
    const source = options.value;
    const text = options.text ?? NUMBER_TEXT_EDIT;
    // 坏口径的表现形式是"输入框莫名其妙变空,值没变,也不报错",在这里拦下来.
    if (!assertEditSafe(text)) {
        throw new TypeError(
            'createNumberField: text 的输出不是合法的 number 输入框文本'
            + '(带单位/千位分隔符/空格外字符都会被浏览器静默消毒成空串).'
            + '编辑框请用 NUMBER_TEXT_EDIT,或 numberText({ syntax: \'edit\' })',
        );
    }
    const parse = (raw: string): number | null => text.fromText(raw);

    const input = create_element({ tag: 'input' });
    input.type = 'number';
    input.id = nextWidgetId('number');
    if (options.min !== undefined) input.min = String(options.min);
    if (options.max !== undefined) input.max = String(options.max);
    if (options.step !== undefined) input.step = String(peekValue(options.step));
    if (options.ariaLabel !== undefined) {
        input.setAttribute('aria-label', options.ariaLabel);
    }
    input.value = text.toText(peekValue(source));

    const inputListeners = new Set<(value: number | null) => void>();
    const commitListeners = new Set<(value: number | null) => void>();
    const abort = new AbortController();

    const notify = (
        listeners: Set<(value: number | null) => void>,
        value: number | null,
    ): void => {
        for (const listener of [...listeners]) listener(value);
    };

    /**
     * 本控件刚写进值源的值;`null` = 没有.
     *
     * 写值源是同步通知的,镜像回调会在 `setValue` 的调用栈里跑回来;这一格
     * 用来认出"这次变化是我自己造成的",从而不改写用户的文本.
     */
    let selfWrite: number | null = null;

    const pushToSource = (parsed: number | null): void => {
        if (parsed === null) return;
        const next = options.normalize ? options.normalize(parsed) : parsed;
        selfWrite = next;
        // 普通值源上 `setValue` 是空操作,这一格设了也白设 -- 保持一条代码路径.
        setValue(source, next);
        selfWrite = null;
    };

    input.addEventListener('input', () => {
        const parsed = parse(input.value);
        pushToSource(parsed);
        notify(inputListeners, parsed);
    }, { signal: abort.signal });
    input.addEventListener('change', () => {
        const parsed = parse(input.value);
        pushToSource(parsed);
        notify(commitListeners, parsed);
    }, { signal: abort.signal });

    // 步长同样可以是 signal.
    const stopStep = options.step === undefined
        ? (): void => {}
        : watchValue(options.step, (next) => {
            input.step = String(next);
        });

    // value 是 signal 时由它驱动文本;普通值只在建控件时用一次.
    const stopSource = watchValue(source, (next) => {
        if (selfWrite !== null && selfWrite === next) return;
        // 文本已经表达同一个值(可能还带着用户/调用方写的格式)就不动它.
        if (parse(input.value) === next) return;
        input.value = text.toText(next);
    });

    return {
        element: input,
        input,
        read: () => parse(input.value),
        readText: () => input.value,
        write: (value) => {
            // 程序化写值只改控件本身,不写回值源.
            input.value = text.toText(value);
        },
        writeText: (text) => {
            input.value = text;
        },
        onInput(listener) {
            inputListeners.add(listener);
            return () => inputListeners.delete(listener);
        },
        onCommit(listener) {
            commitListeners.add(listener);
            return () => commitListeners.delete(listener);
        },
        dispose() {
            abort.abort();
            stopSource();
            stopStep();
            inputListeners.clear();
            commitListeners.clear();
        },
    };
}
