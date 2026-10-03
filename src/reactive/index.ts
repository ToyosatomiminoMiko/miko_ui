/**
 * 库自己的响应式层:一层**薄封装**,内部依赖 `@preact/signals-core`,不是重写.
 *
 * 三件东西:`signal`(会通知订阅者的值容器),`computed`(从别的值算出来的只读值),
 * `effect`(读了哪些 signal,就在它们变化时重跑).没有组件,模板,生命周期,
 * 虚拟 DOM,调度.
 *
 * ## 为什么要有这一层
 *
 * 每个控件各自手写一条"值 -> 控件 -> 值"的双向同步回路,每条回路都是一个
 * "第二真相源".有了这一层,状态可以只有一个,控件由绑定驱动.
 *
 * ## 四条硬约束(违反任何一条这一层就退化)
 *
 * 1. **公开面是库自己的**:`Signal<T>` 由这里定义,消费者不 import
 *    `@preact/signals-core`.将来换成自写实现才是非破坏性变更,也不会出现
 *    "两个包各建一份 signal 实例,依赖跟踪互相看不见".
 * 2. **不用 `batch()`**:`signals-core` 的 effect 默认就是同步执行的,`batch()`
 *    是显式选择的批处理.库里一次都不用,"更新路径不引调度器"这条约束才成立,
 *    手写 DOM 桩也才能继续用(桩里没有微任务队列).
 * 3. **不当状态管理库用**:只取 `signal` / `computed` / `effect`,不做跨模块
 *    store,也不用它的自动订阅糖(那需要 JSX).公开面里没有 `batch` /
 *    `untracked` / `action` / `createModel` 的转出.
 *
 *    > 上游 `@preact/signals-core@1.14.4` 没有 `onCleanup` 这个导出:1.x 的清理
 *    > 语义是 `effect` 的回调**返回**一个清理函数(下一次重跑或销毁时执行).库直接
 *    > 沿用这个语义,不自己发明一个同名 API.
 * 4. **一次写 = 一次提交**:没有 `batch()`(约束 2),所以每写一次 signal,订阅者
 *    就在**同一个调用栈**里跑完一次.于是"把一路交互涉及的多份状态一起改"没有
 *    原子性:先写 A 再写 B,读到 A+B 的 computed 会先按 (A新, B旧) 评一次,再按
 *    (A新, B新) 评一次 -- 中间态对订阅者是**可见**的(`[2, 11, 30]` 那种).
 *    推论:一次交互尽量只写一个 signal;确实要改多个,就自己把写入排在
 *    "订阅者能观察到"之前(例如改完再让控件去读),而不是指望有什么帧调度兜底.
 *
 * ## 为什么每个 signal 外面包了一层对象
 *
 * 直接 `export { signal } from '@preact/signals-core'` 会把第三方的类实例与
 * 它的全部方法(`brand` 等)变成公开面,约束 1 就破了.包一层多一次属性访问,
 * 换来的是"公开 API 是我们自己的"这条可以长期守住的边界.
 *
 * 包的**形状**决定了这层访问有多贵,所以这里不用"对象字面量 + 每实例闭包":
 * 那样的写法每条 signal 要现造 4 个函数(get/set 各一个访问器 + `peek` +
 * `subscribe`),实测(V8 22,单进程隔离,见下表)约 664 B/条:是内层的 7 倍,
 * 写一次(带一个订阅者)约 145 ns:是内层的 3 倍,computed 读约 11.4 ns:是内层
 * 的 1.8 倍.
 *
 * 改成"方法全挂共享原型 + 内部放一个模块私有 Symbol 槽"之后:
 *
 * | 形状 | signal 读 | computed 读 | signal 分配 | computed 分配 | 写 + 1 订阅者 |
 * | --- | --- | --- | --- | --- | --- |
 * | 裸 `signals-core` | 2.2 ns | 6.2 ns | 96 B | 184 B | 50 ns |
 * | 对象字面量 + 每实例闭包 | 2.5 ns | 11.4 ns | 664 B | 696 B | 145 ns |
 * | 本文件的类(共享原型 + Symbol 槽)| 2.4 ns | 6.3 ns | 128 B | 216 B | 49 ns |
 *
 * 读值本来就不慢(字面量的 get/set 是自有访问器,V8 直接内联),**省下来的是分配
 * 与写值**:一条 signal 从 664 B 降到 128 B,写值从 145 ns 降到 49 ns(内层水平).
 * 约束 1 要的是"公开面是自己的",不是"每条 signal 现造几个闭包".
 *
 * 品牌位(`SIGNAL_BRAND`)同样挂在**原型**上而不是实例上:`isSignal` 是
 * `value[BRAND] === true` 的读法,原型链上照样读得到,而实例上就不必留一个
 * 自有属性(`Object.keys` / 展开都看不到它).
 */
import {
    computed as coreComputed,
    effect as coreEffect,
    signal as coreSignal,
    type ReadonlySignal as CoreReadonlySignal,
    type Signal as CoreSignal,
} from '@preact/signals-core';

/**
 * 品牌位:让"这是不是一个 signal"有确定的判据,而不是靠 `peek`/`value` 撞形状.
 *
 * 用 `Symbol.for` 而不是 `Symbol()`:同页若出现两份库副本(打包去重失败,
 * 或消费者既 import 库又 import 了别处的实例),`Symbol.for` 仍能互相认出.
 */
export const SIGNAL_BRAND: unique symbol = Symbol.for('miko.ui.signal') as typeof SIGNAL_BRAND;

/** 只读值源:`signal` 与 `computed` 的共同面. */
export interface ReadonlySignal<T> {
    readonly [SIGNAL_BRAND]: true;
    /** 读值;**在 effect / computed 内读会建立依赖**. */
    readonly value: T;
    /** 读值但**不建立依赖**. */
    peek(): T;
    /**
     * 订阅:**立刻用当前值回调一次**,之后每次变化再回调;返回退订函数.
     *
     * 立刻回调是刻意的:订阅方通常要把当前值马上推给下游,等第一次变化才推就会
     * 漏掉初值.同一个值不会重复通知(`Object.is` 短路).
     */
    subscribe(listener: (value: T) => void): () => void;
    /**
     * 值转换三件套(`valueOf` / `toString` / `toJSON`):与内层 `signals-core`
     * 完全一致,让包装对 JS 的隐式转换透明.
     *
     * 不写这三条会留下静默的行为差异:`String(signal)` 得到 `"[object Object]"`
     * 而不是值,`+signal` 得到 `NaN`,`JSON.stringify` 得到 `{"value":3}` 而不是
     * `3`.消费者看不到内层,所以这种差异只能由这里补平(理由见文件头"包的形状").
     */
    valueOf(): T;
    toString(): string;
    toJSON(): T;
}

/** 可写值源. */
export interface Signal<T> extends ReadonlySignal<T> {
    /** 写值;同值(`Object.is`)不通知订阅者. */
    value: T;
}

/**
 * 内部槽的键:模块私有 `Symbol`,不导出.
 *
 * **为什么不用 `#private`**:产物目标是 ES2020(`tsconfig.json` 的 `target`),
 * `tsc` 会把 `#private` 降级成 WeakMap 助手(`__classPrivateFieldGet/Set`).实测
 * (V8 22,单进程隔离,5 千万次读)读值因此从 2.4 ns 掉到 11.9 ns -- 约 5 倍,写值
 * 也从 50 ns 掉到 71 ns;而模块私有 Symbol 槽在 ES2020 下原样保留,读 2.4 ns,
 * 写 49 ns,分配 128 B,与裸 `signals-core` 持平.**别把它改成 `#private`**,
 * 除非哪天 `target` 抬到 ES2022(那时原生私有字段才不会被降级).
 *
 * 槽用 `Object.defineProperty` 定义:不可枚举也不可写,所以 `Object.keys` /
 * 对象展开 / `JSON.stringify` 都看不到它.消费者拿不到这个 Symbol(没导出),
 * 也没法按名字找 -- 反射能翻出来,但"翻得出来"从来不是要守的边界,"公开面里
 * 没有它"才是.
 */
const INNER: unique symbol = Symbol('miko.ui.signal.inner');

/**
 * 只读包装:方法全在**原型**上,实例上只留一个内部槽.
 *
 * 这是"每条 signal 现造 4 个闭包"的对象字面量写法的替代,判据与实测见文件头
 * "包的形状".`declare` 的品牌位不产生实例字段,真正的值由下面挂在原型上的一次性
 * 赋值给出(`isSignal` 走原型链读得到).
 */
class SignalBox<T> implements ReadonlySignal<T> {
    declare readonly [SIGNAL_BRAND]: true;

    /** 内部真正的 `signals-core` 实例(键是模块私有 Symbol,见 `INNER` 的注释). */
    declare readonly [INNER]: CoreReadonlySignal<T>;

    constructor(inner: CoreReadonlySignal<T>) {
        Object.defineProperty(this, INNER, { value: inner });
    }

    get value(): T {
        return this[INNER].value;
    }

    peek(): T {
        return this[INNER].peek();
    }

    subscribe(listener: (value: T) => void): () => void {
        return this[INNER].subscribe(listener);
    }

    valueOf(): T {
        return this[INNER].value;
    }

    toString(): string {
        return String(this[INNER].value);
    }

    toJSON(): T {
        return this[INNER].value;
    }
}

/** 品牌位挂原型:实例上没有品牌字段,`Object.keys` / 展开都看不到它. */
Object.defineProperty(SignalBox.prototype, SIGNAL_BRAND, { value: true });

/** 可写包装:比只读版多一个 setter,读写的都是**同一个**内部实例与同一个槽. */
class WritableSignalBox<T> extends SignalBox<T> implements Signal<T> {
    /*
     * 这里必须**同时**重写 get 与 set:子类只写 set 的话,会在自己的原型上放一个
     * `{ get: undefined, set }` 的访问器描述符,把基类的 get 整个遮住 -- 之后
     * 读 `value` 一律得到 `undefined`.这不是理论风险,是这类包装最容易踩的坑.
     */
    get value(): T {
        return this[INNER].value;
    }

    set value(next: T) {
        // 槽的静态类型是只读的(只读包装占同一个原型),这里按构造时给的可写实例收回.
        (this[INNER] as CoreSignal<T>).value = next;
    }
}

/** 建一个可写 signal. */
export function signal<T>(initial: T): Signal<T> {
    return new WritableSignalBox(coreSignal(initial));
}

/**
 * 把 `Promise` 挡在 `computed` 外面的类型闸:同步返回原样放行,异步落到一个
 * **字面量类型**,好让报错信息直接把理由念出来 -- 比落到 `never` 或一个
 * 带字段的哨兵接口都清楚(`never` 只说 "not assignable to 'never'",哨兵接口
 * 只说 "Property '__error' is missing",理由本身都不出现在错误里).
 */
type SyncCompute<T> = T extends PromiseLike<unknown>
    ? 'compute 必须是同步的:await 之后读到的 signal 不会建立依赖'
    : T;

/**
 * 从别的值算出来的只读 signal;依赖没变时不会重算.
 *
 * 参数类型是 `() => SyncCompute<T>` 而不是 `() => T`:依赖跟踪是**同步**的
 * (上游的 `evalContext` 只在回调这一次同步求值期间有效),`await` 之后读到的
 * signal 一律不进依赖.于是 `computed(async () => ...)` 会静默地"算一次就冻住",
 * 这是最难查的一类错,所以在类型上直接堵掉:要异步取值就先 `await`,再把结果写进
 * 一个 `signal`(那才是"值到了"这件事的真相源).
 */
export function computed<T>(compute: () => SyncCompute<T>): ReadonlySignal<T> {
    // 断言是安全的:真异步的回调在上面那一步就编译不过了.
    const inner = coreComputed(compute as () => T);
    return new SignalBox<T>(inner);
}

/**
 * 跑一个副作用,并自动跟踪它读了哪些 signal;返回退订函数.
 *
 * **同步执行**(包括第一次):写值之后订阅回调在同一个调用栈里跑完,
 * 不排队,不等帧.这是手写 DOM 桩还能用的前提.
 *
 * 回调可以**返回**一个清理函数:它在下一次重跑前或销毁时执行一次(上游语义).
 *
 * 参数类型写 `() => void` 而不是上游的 `() => void | (() => void)`:后者是
 * 联合类型,TS 的"返回值可以忽略"那条规则不再适用,于是最常见的
 * `effect(() => list.push(x))` 会编译不过.写成 `() => void` 时返回函数的
 * 回调仍然合法(void 上下文允许任意返回值),运行期上游照常把它当清理函数用.
 */
export function effect(run: () => void): () => void {
    return coreEffect(run);
}

/** 判据:用的是品牌位,不是形状. */
export function isSignal<T>(value: unknown): value is ReadonlySignal<T> {
    return typeof value === 'object' && value !== null
        && (value as Partial<ReadonlySignal<T>>)[SIGNAL_BRAND] === true;
}

/**
 * 控件值参数的类型:普通值**或** signal.
 *
 * 这条联合类型是**增量路径**:传普通值 = 不订阅,传 signal 才订阅.于是面板
 * 可以一个控件一个控件地转过去,不必一次性推翻.
 */
export type ValueSource<T> = T | ReadonlySignal<T>;

/** 读一次值源,不建立依赖(建控件时取初值用). */
export function peekValue<T>(source: ValueSource<T>): T {
    return isSignal<T>(source) ? source.peek() : source;
}

/** 写回值源(用户操作 -> 状态);普通值不可写,原样忽略. */
export function setValue<T>(source: ValueSource<T>, value: T): void {
    if (isSignal<T>(source)) (source as Signal<T>).value = value;
}

/**
 * 监听值源.
 *
 * - 普通值:立刻用当前值回调一次,返回空退订(保持"传普通值 = 今天的行为");
 * - signal:立刻回调一次初值,之后每次变化再回调;返回退订函数.
 *
 * 立刻回调一次是刻意统一的:控件不必区分"初值从哪来",两条路径都走同一段
 * "把值写进 DOM"的代码.
 */
export function watchValue<T>(
    source: ValueSource<T>,
    listener: (value: T) => void,
): () => void {
    if (!isSignal<T>(source)) {
        listener(source);
        return () => {};
    }
    // `subscribe` 本身就是"立刻回调一次 + 之后变化回调",不用再 peek 一次.
    return source.subscribe(listener);
}

/**
 * 只在**值发生变化**时回调(订阅时不回调初值);返回退订函数.
 *
 * 与 `subscribe` 的分工:
 * - `subscribe` 立刻给一次当前值 -- 订阅方通常要把值马上推给下游(初值不能丢);
 * - `onValueChange` 只关心"之后变了吗" -- 如"参数变了要重新编译",启动时那一次
 *   不该被当成用户改动.
 *
 * 同值写入不会回调(`Object.is` 短路),所以"我自己写回去的那次"也不会打转.
 */
export function onValueChange<T>(
    source: ReadonlySignal<T>,
    listener: (value: T) => void,
): () => void {
    let first = true;
    return source.subscribe((value) => {
        if (first) {
            first = false;
            return;
        }
        listener(value);
    });
}

/**
 * **可写派生信号**:读的时候由别的信号算出来,写的时候按给定的换算写回源信号.
 *
 * 用于"同一个状态有两套 UI 表示"的场景,而且两套表示都能被用户直接改:例如
 * 真相是一个数值,而面板上显示的是换算后的倍数或布尔开关.没有它,这种控件就得在
 * 外部再存一份布尔值/显示值,于是又回到"两个状态源".
 *
 * - `read()` 里读到的每个信号都会成为依赖:任一变化都会重算,值真变了才通知.
 *   所以 `read` 里要读 `.value`(`peek` 不建立依赖,写成 peek 就永远不会重算);
 * - `write(value)` 负责把换算写回源信号(源信号自己会做同值短路);
 * - `peek()` 返回缓存值:它由依赖变化同步刷新,且**不会**建立依赖.
 *
 * 生命周期:内部那个跟踪用的 effect 跟随页面存活,所以派生信号应当建在**长生命周期**
 * 状态对象上,而不是每次装配面板时新建一个.
 */
export function derivedSignal<T>(read: () => T, write: (value: T) => void): Signal<T> {
    const listeners = new Set<(value: T) => void>();
    let current = read();

    effect(() => {
        const next = read();
        if (Object.is(next, current)) return;
        current = next;
        for (const listener of [...listeners]) listener(next);
    });

    return {
        [SIGNAL_BRAND]: true,
        get value(): T {
            return read();
        },
        set value(next: T) {
            write(next);
        },
        peek: () => current,
        subscribe(listener) {
            // 与 signal/computed 同一约定:订阅时先给一次当前值.
            listener(current);
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        // 与 signal/computed 同一约定:值转换三件套(口径是"当前值",不是缓存值).
        valueOf: () => read(),
        toString: () => String(read()),
        toJSON: () => read(),
    };
}
