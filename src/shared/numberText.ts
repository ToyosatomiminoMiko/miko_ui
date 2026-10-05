/**
 * 数值/向量的**唯一**口径层:值 ↔ 文本.
 *
 * ## 为什么要有这一层
 *
 * 库原先有四套"数值长什么样"的答案:公开导出却库内零调用的 `formatNumber`,数字框
 * 默认的 `String(v)`,系数滑块默认的 `String(v)`,以及每个消费者各写一份的读数格式
 * 化.同一份值因此在同一块界面上可能显示成三种文本(`1000000` 在框里,`1.000000e+6`
 * 在用了 `formatNumber` 的读数里).这一层把"值 ↔ 文本"收成一个**可传递的对象**
 * {@link ValueText}:同一个对象能同时喂给数字框,系数滑块与读数行,三处文本才会
 * 逐字符相同.
 *
 * 合成一个对象而不是两个回调,是这一层的全部要点:口径要能**整体传递**
 * (`const text = numberText({...})`,然后三处给同一个 `text`),否则"统一"只是口号.
 *
 * ## 档位与语法是两件事
 *
 * - **档位**(策略):几位小数,尾零去不去,什么时候回退科学计数法 -- 由 `digits` /
 *   `trimZeros` / `exponentialAt` / `exponentialDigits` 定;
 * - **语法**(渲染):同一个档位要服务三种互相不兼容的文本要求,由 `syntax` 选:
 *   - `'plain'`(默认):给人看的纯文本,如 `1.000000e+6`;
 *   - `'latex'`:给 KaTeX 排的数学写法,如 `1\times10^{6}`;
 *   - `'edit'`:能被 `<input type="number">` 咬住的无损文本,如 `1000000`.
 *
 * 值得单独记住的是 `'latex'`:消费者侧(`miko_graphcalc` 的 `math/latexNumber.ts`)
 * 为了这个语法把"6 位小数 / 1e-4 / 1e6 回退"这套**档位**又抄了一遍,注释里自陈
 * "与库公开面导出的 `formatNumber` 同一档位".档位是策略,语法是渲染,合成一个参数
 * 就装不下这条路.
 *
 * ## 编辑档:为什么默认是"无损"的
 *
 * `<input type="number">` 的 `value` 写入会做**值消毒**:不合法的字符串被浏览器
 * **静默替换成空串**.所以编辑档有一条硬规则:输出必须匹配 number 输入框的合法浮点
 * 语法(判据见 {@link isNumberInputText}),否则输入框会变空,值还没变,也没有报错.
 * 这个坑消费者侧已经独立踩过一次并写进了注释(`90%` 写进框里,框就空了).
 *
 * 更隐蔽的一条是**精度**:定点位数一旦少于控件 `step` 的小数位,用户只要编辑一下
 * 输入框,值就会被静默量化到那个位数上 -- 拖动,输入,失焦三步里没有任何一步会报错.
 * 所以库的默认编辑档({@link NUMBER_TEXT_EDIT})**不做任何舍入**,用 JS 的最短往返
 * 表示(`String(v)`):它既是合法的 number 语法,又保证 `fromText(toText(v)) === v`.
 *
 * "框里固定两位小数"这类外观(把 `0.9` 写成 `0.90`)仍然可以:
 * `numberText({ syntax: 'edit', digits: 2, trimZeros: false })`.代价正如上一条:
 * 当 `digits` 少于 `step` 需要的小数位时会量化,所以**调用方必须保证 `digits` 覆盖
 * 控件的 `step` 网格**(`step` 是 `0.01` 就得给 2 位).判据可以用
 * {@link assertLossless} 在测试里钉住.
 *
 * 反过来,**显示档可以舍入**({@link NUMBER_TEXT_DISPLAY}):只读读数没有"编辑回去"
 * 这一步,显示短一点是净收益;全精度值另有 `title` 出口(见 `widgets/ValueDisplay.ts`).
 *
 * ## 不归这一层管的东西
 *
 * `input.min` / `input.max` / `input.step` / `<input type="range">.value` 这类 DOM
 * **机器属性**不在这里格式化:`String(v)` 是**无损**的机器序列化,换成任何会舍入的
 * 档位都会让区间与滑杆取值失真(滑杆的 `value` 必须能原样解析回同一个数).这一层管
 * 的是"给人看的文本";机器语法就是 `String(v)`,没有第二种实现.
 */
import type { ValueText } from './valueText';

/**
 * 输出语法:同一个档位要服务的三种互不兼容的文本要求.
 *
 * 三者不可兼得的原因见文件头:`'edit'` 要合法 number 语法,`'latex'` 要 KaTeX
 * 能排,`'plain'` 要人能读.
 */
export type NumberSyntax = 'plain' | 'latex' | 'edit';

/** 数值口径的档位与语法.全部可选,省略即取默认(默认 = `formatNumber` 的行为). */
export interface NumberTextOptions {
    /**
     * 定点小数位;默认 `6`(与 `formatNumber` 同值).必须是不大于 100 的非负整数
     * (`toFixed` 的硬上限).
     *
     * `'edit'` 语法下**省略 `digits` 表示不[舍入]**(取最短往返表示);给了才走定点,
     * 见文件头的"编辑档"一节.
     */
    readonly digits?: number;
    /** 尾零与末尾小数点是否去掉;默认 `true`.`'latex'` 下同样作用于科学计数法的尾数. */
    readonly trimZeros?: boolean;
    /**
     * 回退科学计数法的量级**半开区间** `[low, high)`:绝对值落在里面走定点.
     * 默认 `{ low: 1e-4, high: 1e6 }`(与 `formatNumber` 同值).
     */
    readonly exponentialAt?: { readonly low: number; readonly high: number };
    /** 科学计数法保留几位;默认等于 `digits`. */
    readonly exponentialDigits?: number;
    /** 输出语法;默认 `'plain'`. */
    readonly syntax?: NumberSyntax;
}

export interface NumberVectorTextOptions extends NumberTextOptions {
    /** 括号;默认 `['[', ']']`. */
    readonly bracket?: readonly [string, string];
    /** 元素分隔符;默认 `', '`. */
    readonly separator?: string;
}

/** `toFixed` / `toExponential` 的小数位硬上限(超出会抛 `RangeError`). */
const MAX_DIGITS = 100;

/** 默认档位:与 `formatNumber` 一位不差的那一组值. */
const DEFAULT_DIGITS = 6;
const DEFAULT_EXPONENTIAL_AT = { low: 1e-4, high: 1e6 } as const;

/** number 输入框接受的浮点语法(`+` 开头不合法,指数合法,不允许分隔符/空白/单位). */
const NUMBER_INPUT_TEXT = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * 文本能否原样进 `<input type="number">`.
 *
 * 空串算合法:它不是"坏文本",而是"这个框里没有值"(`NumberField.read()` 对空串返回
 * `null`).其余必须整体匹配 number 输入的浮点语法 -- 浏览器对不合法的值做的是
 * **静默替换成空串**,所以判据必须是"整体匹配"而不是"能解析出前缀".
 */
export function isNumberInputText(text: string): boolean {
    return text === '' || NUMBER_INPUT_TEXT.test(text);
}

/** 文本 -> 数值:trim 后整体解析,不可解析或非有限返回 `null`(不抛,不猜). */
export function parseNumber(text: string): number | null {
    const trimmed = text.trim();
    if (trimmed === '') return null;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : null;
}

/**
 * 自检探针:定点/指数边界,正负,整数上下限,超长小数,非有限值.
 *
 * 用**探针集合**而不是数学证明:口径是调用方给的任意 `ValueText`,库无法知道它的
 * 内部档位,只能在代表性输入上跑一遍.探针覆盖的是已知会出问题的形状,不是全集.
 */
const FINITE_PROBES: readonly number[] = [
    0, 1, -1, 0.5, -1.5, 1 / 3, 0.1 + 0.2,
    123456.789, 0.0001, 0.00001, 1e6, 1e15, 1e21, -1e21,
    Number.MAX_SAFE_INTEGER, Number.MIN_VALUE,
];
const ALL_PROBES: readonly number[] = [
    ...FINITE_PROBES,
    Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY,
];

/**
 * 在探针上自检"这个口径的输出能否进 number 输入框"(见文件头的值消毒规则).
 *
 * 探针里含 `NaN` 与 `±Infinity`:手写的 `toText` 常常漏掉它们(`(NaN).toFixed(2)` 给
 * `'NaN'`,`String(NaN)` 给 `'NaN'`,都不是合法 number 文本),而"漏掉非有限值"的表现
 * 正好是那个最难查的输入框变空.库的工厂({@link numberText})对编辑档给空串,所以
 * 自定义实现也要自己处理这一格 -- 这一条没有兜底.
 */
export function assertEditSafe(text: ValueText<number>): boolean {
    return ALL_PROBES.every((value) => isNumberInputText(text.toText(value)));
}

/**
 * 在探针上自检"这个口径是否无损"(`fromText(toText(v))` 回到同一个数).
 *
 * 给"定点编辑档"用:`digits` 少于控件 `step` 需要的小数位时它会返回 `false`,
 * 那正是"用户一编辑值就被静默量化"的情形.
 */
export function assertLossless(text: ValueText<number>): boolean {
    return FINITE_PROBES.every((value) => text.fromText(text.toText(value)) === value);
}

function assertDigits(name: string, value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > MAX_DIGITS) {
        throw new TypeError(
            `numberText: ${name} 必须是不大于 ${MAX_DIGITS} 的非负整数,收到 ${String(value)}`,
        );
    }
}

/** 去掉定点/尾数小数点后多余的 0(`1.500000` -> `1.5`,`4.000000` -> `4`). */
function trimTail(text: string): string {
    return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
}

/**
 * 科学计数法 -> LaTeX:`1.250000e+20` -> `1.25\times10^{20}`.
 *
 * 指数经 `Number()` 规范化(`+20` -> `20`,`-17` 保持),这正是消费者侧
 * `latexNumber.ts` 的做法:KaTeX 排 `e+20` 会把 `e` 当成斜体变量.
 */
function exponentialToLatex(text: string): string {
    const [mantissa, exponent] = text.split('e');
    return `${trimTail(mantissa)}\\times10^{${Number(exponent)}}`;
}

/** 已解析的档位(每个字段都有值),渲染函数只吃这个. */
interface ResolvedNumberText {
    readonly digits: number;
    readonly trimZeros: boolean;
    readonly low: number;
    readonly high: number;
    readonly exponentialDigits: number;
    readonly syntax: NumberSyntax;
    /** `'edit'` 且没给 `digits` 时才为 true:那一路不做任何舍入. */
    readonly exact: boolean;
}

/**
 * 定点分支(`|v|` 落在 `[low, high)` 内):`digits` 位 + 可选去尾零.
 *
 * 舍入到零的**负数**要先去符号:`(-0.00004).toFixed(4)` 给 `-0.0000`,但它数值上
 * 就是零,负号只是舍入产物(对照 `String(Number('-0.0000')) === '0'`).不去的话
 * "定点 n 位去尾零"会输出 `-0`,与调用方照 JS 语义写的
 * `String(Number(v.toFixed(n)))` 差一个字符 -- 这条是 2026-10 由消费者侧的
 * ViewPanel 迁移实测逼出来的(逐字符比对时只差这一格).
 */
function renderFixed(value: number, o: ResolvedNumberText): string {
    const fixed = value.toFixed(o.digits);
    // `Number('-0.0000') === 0`(-0 与 0 相等),所以这一条同时命中正负两种零.
    const unsigned = Number(fixed) === 0 ? fixed.replace(/^-/, '') : fixed;
    return o.trimZeros ? unsigned.replace(/\.?0+$/, '') : unsigned;
}

/** 指数分支:尾数位数由 `exponentialDigits` 定,LaTeX 语法额外去掉尾数尾零. */
function renderExponential(value: number, o: ResolvedNumberText): string {
    const text = value.toExponential(o.exponentialDigits);
    if (o.syntax === 'latex') return exponentialToLatex(text);
    return text;
}

function renderPlain(value: number, o: ResolvedNumberText): string {
    if (!Number.isFinite(value)) return String(value);
    const magnitude = Math.abs(value);
    if ((magnitude >= o.low && magnitude < o.high) || value === 0) return renderFixed(value, o);
    return renderExponential(value, o);
}

/**
 * 编辑档渲染:默认取最短往返表示(`String`),给了 `digits` 才走定点.
 *
 * 非有限值给空串而不是 `'NaN'`:`'Infinity'` / `'NaN'` 都不是合法 number 语法,
 * 交给浏览器消毒的结果本来就是空串,这里显式写出来,免得"值是 NaN"伪装成"用户清空了
 * 输入框".
 */
function renderEdit(value: number, o: ResolvedNumberText): string {
    if (!Number.isFinite(value)) return '';
    if (o.exact) return String(value);
    const magnitude = Math.abs(value);
    if ((magnitude >= o.low && magnitude < o.high) || value === 0) return renderFixed(value, o);
    return renderExponential(value, o);
}

function resolveOptions(syntax: NumberSyntax, options: NumberTextOptions): ResolvedNumberText {
    const digits = options.digits ?? DEFAULT_DIGITS;
    const exponentialDigits = options.exponentialDigits ?? digits;
    assertDigits('digits', digits);
    assertDigits('exponentialDigits', exponentialDigits);

    const exponentialAt = options.exponentialAt ?? DEFAULT_EXPONENTIAL_AT;
    if (!(exponentialAt.low >= 0) || !(exponentialAt.high > exponentialAt.low)) {
        throw new TypeError(
            'numberText: exponentialAt 要是 low >= 0 且 high > low 的半开区间 '
            + `[low, high),收到 ${JSON.stringify(exponentialAt)}`,
        );
    }

    return {
        digits,
        trimZeros: options.trimZeros ?? true,
        low: exponentialAt.low,
        high: exponentialAt.high,
        exponentialDigits,
        syntax,
        // 编辑档的默认是"无损":没显式给 digits 就不舍入(见文件头).
        exact: syntax === 'edit' && options.digits === undefined,
    };
}

/**
 * 造一个数值口径.
 *
 * 默认(`numberText()`)与 `formatNumber` 的行为一位不差:定点 6 位去尾零,
 * `|v| < 1e-4` 或 `>= 1e6` 回退科学计数法,非有限值原样 `String(v)`.
 *
 * ```ts
 * // 一套口径喂三处:数字框,滑块,读数行的文本逐字符相同
 * const angleText = numberText({ digits: 3 });
 * createNumberField({ value: angle, text: angleText });
 * createReadoutRow('方位角', { value: angle, text: angleText });
 * ```
 */
export function numberText(options: NumberTextOptions = {}): ValueText<number> {
    const syntax = options.syntax ?? 'plain';
    const resolved = resolveOptions(syntax, options);
    const render = syntax === 'edit' ? renderEdit : renderPlain;

    return {
        toText(value) {
            return render(value, resolved);
        },
        fromText(text) {
            return parseNumber(text);
        },
    };
}

/**
 * 向量口径:`[1, 2, 3]`.
 *
 * 括号与分隔符可配;`fromText` 只认自己 `toText` 产出的形状(括号缺失或元素解析不出
 * 就返回 `null`),所以这个对象是自洽的:显示成什么样,就能从那个样子读回来.
 */
export function numberVectorText(
    options: NumberVectorTextOptions = {},
): ValueText<readonly number[]> {
    const item = numberText(options);
    const [open, close] = options.bracket ?? ['[', ']'];
    const separator = options.separator ?? ', ';

    return {
        toText(value) {
            return `${open}${value.map((element) => item.toText(element)).join(separator)}${close}`;
        },
        fromText(text) {
            const trimmed = text.trim();
            // 纯空白分隔符切不开元素,这种配置解析不了:不猜.
            if (separator.trim() === '') return null;
            if (!trimmed.startsWith(open) || !trimmed.endsWith(close)) return null;
            const inner = trimmed.slice(open.length, trimmed.length - close.length).trim();
            if (inner === '') return [];
            const out: number[] = [];
            for (const part of inner.split(separator)) {
                const value = item.fromText(part.trim());
                if (value === null) return null;
                out.push(value);
            }
            return out;
        },
    };
}

/**
 * 编辑档预置:**无损**,给可编辑的控件用(数字框/系数滑块的默认就是它).
 *
 * 它不美化文本 -- `0.8999999999999999` 会原样进输入框.美化是显示档的事,而"值本来
 * 就不该漂"是控件 `normalize` 的事;让编辑框去舍入,等于用两套表示同一个值.
 */
export const NUMBER_TEXT_EDIT: ValueText<number> = numberText({ syntax: 'edit' });

/** 显示档预置:给只读读数用,行为等于 `formatNumber`. */
export const NUMBER_TEXT_DISPLAY: ValueText<number> = numberText();

/** 显示档的向量形式(内部单例,避免每次调用都造一个对象). */
const DEFAULT_VECTOR_TEXT: ValueText<readonly number[]> = numberVectorText();

/**
 * 数值 -> 紧凑纯文本:非有限值原样返回,其余定点优先(去尾零),超出量级回退科学计数法.
 *
 * 等价于 `NUMBER_TEXT_DISPLAY.toText`(两者共用同一份实现,不存在第二套规则).
 * 产出的是**纯文本**:能直接展示,也能拼进别的字符串,不依赖排版渲染器 -- 所以科学
 * 计数法刻意写成 `e+n`(`1.000000e+6`),而不是 `\times10^{n}` 这类需要 LaTeX/KaTeX
 * 才排得出来的写法(要那种写法用 `numberText({ syntax: 'latex' })`).
 */
export function formatNumber(value: number): string {
    return NUMBER_TEXT_DISPLAY.toText(value);
}

/** 数值数组 -> `[1, 2, 3]`. */
export function formatVector(value: readonly number[]): string {
    return DEFAULT_VECTOR_TEXT.toText(value);
}
