/**
 * 数字输入控件(页面上所有 `<input type="number">` 的统一件).
 *
 * 消费者用它做参数行的精调框(与滑块共用同一个 `signal<number>`),以及线宽,
 * 大小这类单值输入.
 *
 * 控件只负责"读文本 / 写文本 / 通知",**不替调用方决定非法输入怎么办**:
 * 解析失败时 `onInput` / `onCommit` 收到 `null`,想即时回退就在回调里调
 * `write(上一个合法值)`(用户打不出中途态),想保留用户文本就什么都不做,
 * 只在 `change` 阶段归一化后写回 -- `input` 阶段的文本可能是空串或中途态,
 * 直接 `Number()` 会把空串吞成 0.
 *
 * `parse` / `format` 也交给调用方:显示可以走 `toFixed(4)` 的口径,参数行可以
 * 做区间夹取 / 圆周回绕,控件不预设任何一种.
 *
 * `value` 可以是普通值或 signal.给 signal 时有一个额外的小心处:用户输入的
 * 中途文本(`1.` / `0`)会被写回 signal,如果镜像更新立刻用 `format` 改写文本,
 * 用户就打不出小数点了.所以**控件自己写进值源的那一次变化会被跳过**(见
 * `selfWrite`),文本只在别处改值时被规范化.
 */
import { peekValue, setValue, watchValue, type ValueSource } from '../reactive';
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
     * 可访问名.放进带可见 `<label for>` 的行里时省略(见 `SwitchOptions`).
     */
    ariaLabel?: string;
    /** 值 -> 文本;默认 `String()`.写回时用. */
    format?(value: number): string;
    /** 文本 -> 值;默认 trim 后 `Number.isFinite` 校验.返回 null 表示不可解析. */
    parse?(text: string): number | null;
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
 * 本控件的根就是那个 `<input>`,所以两者同节点 -- `RangeInputHandle` 也是这样.
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
    /** 按 `format` 写文本;只改控件本身,不写回值源. */
    write(value: number): void;
    /** 原样写文本(不做 `format`). */
    writeText(text: string): void;
    /** `input` 阶段(每次按键);参数已按 `parse` 解析,失败为 null. */
    onInput(listener: (value: number | null) => void): () => void;
    /** 原生 `change`(失焦/回车);参数同上,控件在该阶段也不改写文本. */
    onCommit(listener: (value: number | null) => void): () => void;
    dispose(): void;
}

/** 默认解析:`Number('') === 0`,所以空串必须显式判掉. */
function defaultParse(text: string): number | null {
    const trimmed = text.trim();
    if (trimmed === '') return null;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : null;
}

export function createNumberField(options: NumberFieldOptions): NumberFieldHandle {
    const source = options.value;
    const format = options.format ?? ((value: number) => String(value));
    const parse = options.parse ?? defaultParse;

    const input = create_element('input');
    input.type = 'number';
    input.id = nextWidgetId('number');
    if (options.min !== undefined) input.min = String(options.min);
    if (options.max !== undefined) input.max = String(options.max);
    if (options.step !== undefined) input.step = String(peekValue(options.step));
    if (options.ariaLabel !== undefined) {
        input.setAttribute('aria-label', options.ariaLabel);
    }
    input.value = format(peekValue(source));

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
        input.value = format(next);
    });

    return {
        element: input,
        input,
        read: () => parse(input.value),
        readText: () => input.value,
        write: (value) => {
            // 程序化写值只改控件本身,不写回值源.
            input.value = format(value);
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
