# 数值/文本显示统一 · 窗口内布局确定:方案

> 状态:**方案**(demo 阶段,未立项).本文只定"口径与接口",不产生代码改动.
> 目标版本:`0.2.0`(**暂定**).
> **2026-10 评审结论**:先只审方案,不动代码;两处破坏性变更(D2 默认口径切档,
> Phase 4 去掉正文拉伸通吃)**搁置,待消费者侧实验后再定**.因此第 6 节的 Phase 2 /
> Phase 4 是"可路径"而不是"待执行",第 7 节的 D2 是开放项(不按建议直接采纳).
> 前置阅读:`README.md` 的「公开面」「三条设计约束」「边界契约」;
> `src/shared/numberText.ts`;`styles/desktop.css` 的 `.window-body` 一节;
> `test/scrollbarStyles.test.ts`(它守的那条"独立规定"与本方案第 3.2.5 节正面冲突).

## 0. 一句话

这两件事的根子是同一个:**库把"值长什么样"和"窗口里怎么排"都留给了消费者**,
而库自己只提供零件.于是每个应用各写一份 `.readout` 与一份 `.pane`,
同一份数值在滑杆框,数字框,读数三处显示成三种文本.

本方案给这两件事各定一份**库内唯一口径**:

- 数值/文本:一个可配置的**策略对象**(`ValueText<T>`)负责"值 ↔ 文本",
  编辑态与显示态各自一个预置,新增只读显示件 `createValueDisplay` /
  `createReadoutRow`;
- 窗口内布局:正文的**默认排布规则写死**(不拉伸,除非显式声明),
  外加一层布局原语(`createStack` / `createScrollArea` / `createSplitter`),
  让"哪块固定,哪块吃掉剩余,哪块滚"从"消费者的约定"变成"库的契约".

## 1. 现状(事实清单)

### 1.1 数值/文本的显示点

| 位置 | 现在怎么出文本 | 备注 |
| --- | --- | --- |
| `src/shared/numberText.ts:10` | `formatNumber`:定点 6 位去尾零,` | v \| < 1e-4` 或 `>= 1e6` 回退科学计数法 \| 纯函数,已导出公开面,**但库内零引用** |
| `src/shared/numberText.ts:22` | `formatVector`:`[1, 2, 3]` | 同样零引用;输出不可被 `Number()` 解析 |
| `src/widgets/NumberField.ts:91` | 默认 `format = String(value)` | 可被 `options.format` 覆盖 |
| `src/widgets/NumberField.ts:82` | `defaultParse`:trim + `Number.isFinite` | 私有函数,**不对外**,别处想用只能抄 |
| `src/widgets/Slider.ts:110` | 默认 `format = String(value)` | 同一份口径还喂给重置按钮的 `title` / `aria-label`(`Slider.ts:148`) |
| `src/widgets/RangeInput.ts:67,83,92` | 直接 `String(value)` | 裸滑杆**没有** `format` 出口 |
| `example/main.ts:102-121` | 消费者自写 `createReadout`:`String(value)` / `value.toFixed(3)` | 每个应用抄一份 |
| `example/example.css:63-81` | 消费者自写 `.readout-row` / `.readout` | 库的样式表里没有读数件 |
| `src/editor/EditorLineNumbers.ts:106` | `String(i)` | 行号是整数,不受影响 |

### 1.2 窗口正文的布局事实

| 位置 | 现状 |
| --- | --- |
| `styles/desktop.css:184-192` | `.window > .window-body`:`display:flex; flex-direction:column; flex:1 1 auto; min-height:0; padding:0; overflow:hidden` |
| `styles/desktop.css:194-197` | `.window-body > * { flex: 1 1 auto; min-height: 0 }` -- **通吃所有直接子节点** |
| `example/example.css:46-58` | 消费者必须自己写 `.pane`(列排布 + 间距 + 内边距),再给按钮 `align-self:flex-start` 抵消上面那条通吃 |
| `src/desktop/WindowManager.ts:660-663` | `_applyGeometry` 写 `--window-body-height`(给浮层的 `max-height` 用) |
| `styles/widgets.css:135-146` | `.menu-panel` 消费 `--window-body-height`;没有 `--window-body-width` |
| `README.md:269-274` | `Splitter` / `ScrollArea` / 表格件 / `TextField` 明确列为"还没做的" |
| 全库 | 没有 `ResizeObserver`,没有 JS 测量排版;需要在尺寸变化时重排的件订阅 `WindowManager.onGeometryChange(id)` |

## 2. 问题

### 2.1 数值/文本

1. **同一份值,三种文本**.`1e6` 在数字框里是 `1000000`(`String`),在用了
   `formatNumber` 的读数里是 `1.000000e+6`;`0.1+0.2` 一个显示
   `0.30000000000000004`,另一个显示 `0.3`.这不是"消费者选错了",而是库把
   口径的全部选择权下放了,又没有给一个可共享的对象.
2. **`formatNumber` 是死代码**.它已经进了公开面,但库内没人用,消费者也不知道
   该不该用 -- 它现在只是"库作者写过一个格式化函数".
3. **编辑态与显示态被同一个 `format` 混在一起**.`NumberField.format` 同时承担
   "给用户看的文本"和"能解析回来的文本".这两件事的要求相反:显示要短,要好看,
   编辑要能被 `Number()` 咬住.所以消费者一改 `format`,就把可编辑性一起改了.
4. **没有只读显示件**.`createNumberRow` / `createSwitchRow` 都有,唯独"只读的
   值"没有,于是 `example` 里的 `createReadout` 与 `.readout*` 样式注定要在每个
   应用里重写一遍.

### 2.2 窗口内布局

1. **`.window-body > *` 是通吃规则**.它同时表达了三件事:拉伸,给 `min-height:0`,
   隐式等分(多个直接子节点各拿 1 份 `flex-grow`).三件事都不该是默认值:
   - 放两个 `<div>` 就直接对半分高,这从来没人声明过;
   - 按钮被拉成整行宽(`example` 只好反向抵消);
   - 想"上面一条工具条,下面吃掉剩余",得先知道这条规则存在.
2. **"正文里怎么排"没有库内契约**.`.pane` 是消费者发明的类名与排布,换一个应用
   就重来一份;而库的样式契约(`test/emittedClasses.test.ts`)恰好要求"库产出的
   类必须有库的样式",反向也成立 -- 消费者自己发明容器,就是把库该定的结构推给
   了应用.
3. **滚动没有出口**.正文是 `overflow:hidden`;要滚动,消费者得自己套一层
   `overflow:auto` + 手挂 `.ui-scrollbar` + 在每一层上写 `min-height:0`
   (漏一层就是"滚不动"或"被压扁").
4. **"确定"缺的是规则而不是能力**.CSS 全都能做到,但"哪个区域吃剩余,哪个区域滚,
   溢出往哪去"现在只写在 `example.css` 的注释里,不是库的契约 -- 这正是本方案要
   把它变成契约的那一半.

## 3. 方案 A:数值/文本显示的统一

### 3.1 分三层,先把概念拆开

```text
   ┌ 口径(纯数据,无 DOM) ─────────────────────────────┐
   │  ValueText<T> = { toText(v): string; fromText(t): T | null } │
   └──────────────────────────────────────────────────────┘
              │ 同一个对象被三处共用
              ▼
   ┌ 编辑态 ─────────┐   ┌ 显示态 ─────────┐
   │ NumberField     │   │ createValueDisplay │
   │ Slider          │   │ createReadoutRow   │
   │ RangeInput      │   │ (只读 <output>)    │
   └─────────────────┘   └────────────────────┘
```

`ValueText<T>` 刻意是**一个对象**而不是两个回调:口径要能整体传递
(`const text = numberText({...})`,然后 `NumberField` / `Slider` / 读数三处给同一个
`text`),否则"统一"只是口号.

### 3.2 接口草案

```ts
// src/shared/numberText.ts(重写内部,保留旧导出)
export interface ValueText<T> {
    /** 值 -> 文本.同一输入必须同输出(纯函数,无状态,不读环境). */
    toText(value: T): string;
    /** 文本 -> 值;不可解析返回 null(不抛,不猜). */
    fromText(text: string): T | null;
}

export interface NumberTextOptions {
    /** 定点小数位;默认 6(与 formatNumber 同值). */
    readonly digits?: number;
    /** 尾零与末尾小数点是否去掉;默认 true. */
    readonly trimZeros?: boolean;
    /** 回退科学计数法的量级开区间;默认 { low: 1e-4, high: 1e6 }. */
    readonly exponentialAt?: { readonly low: number; readonly high: number };
    /** 科学计数法保留几位;默认 = digits. */
    readonly exponentialDigits?: number;
    /** `-0` 是否显示成 `0`;默认 true. */
    readonly minusZeroAsZero?: boolean;
    /** 非有限值文案;默认 `String(v)`(即 `NaN` / `Infinity` / `-Infinity`). */
    readonly nonFinite?: (value: number) => string;
    /** 千位分隔符(显示档专用);默认不加. */
    readonly group?: false | string;
    /** 固定后缀(显示档专用,如 `°`);默认无. */
    readonly suffix?: string;
}

/** 默认口径 = 现在 formatNumber 的行为,一位不差. */
export function numberText(options?: NumberTextOptions): ValueText<number>;
/** 数字数组:`[1, 2, 3]`;分隔符与括号可配. */
export function numberVectorText(options?: NumberTextOptions & {
    readonly bracket?: readonly [string, string];
    readonly separator?: string;
}): ValueText<readonly number[]>;

/** 两个预置(命名常量,消费者直接引用,不必记参数). */
export const NUMBER_TEXT_EDIT: ValueText<number>;    // 编辑档
export const NUMBER_TEXT_DISPLAY: ValueText<number>; // 显示档

/** 旧的纯函数原样保留(实现改为调用默认预置),行为由现有单测冻结. */
export function formatNumber(value: number): string;
export function formatVector(value: readonly number[]): string;
/** 解析也搬进来成为公开口径(现在藏在 NumberField 里). */
export function parseNumber(text: string): number | null;
```

### 3.3 编辑档必须是"合法 number input 语法"

这是本方案里**最容易踩,必须写成硬规则**的一条:

`<input type="number">` 的 `value` 写入时会做**值消毒**(value sanitization):
不合法的字符串被浏览器**静默替换成空串**.也就是说,如果消费者给 `NumberField`
一个带千位分隔符或单位的 `format`(比如 `1,234.5` 或 `0.6 rad`),
`input.value = format(next)` 的结果是**输入框变空**,而且值源没变,没有报错.

由此定两条:

1. `NUMBER_TEXT_EDIT` 的 `toText` 输出**必须**匹配
   `^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$`(允许指数,不允许分隔符 / 空白 / 单位),
   单测对所有边界值穷举这条正则;
2. 分隔符与后缀(`group` / `suffix`)**只有显示档能用**;`numberText` 模块提供
   `assertEditSafe(text: ValueText<number>): boolean` 作开发期自检,`NumberField`
   在 `NODE_ENV !== 'production'` 时对自己的口径跑一次,不合格就在控制台告警并
   降级到 `String()` -- 坏口径不该以"输入框空白"的形式出现.

编辑档与显示档的差别只有两处,其余全部继承默认:

| 选项 | `NUMBER_TEXT_EDIT` | `NUMBER_TEXT_DISPLAY` |
| --- | --- | --- |
| `exponentialAt` | `{ low: 1e-6, high: 1e15 }` | `{ low: 1e-4, high: 1e6 }`(同 `formatNumber`) |
| `group` / `suffix` | 恒为 `false` / 无 | 可选,默认也不开 |

"编辑档把科学计数法的门槛放宽"的理由:`1000000` 这种量级落在可编辑框里,
`1.000000e+6` 会让用户没法直接改第 4 位;而 `String(1e21) === '1e+21'` 本来就是
指数,浏览器接受,所以放宽到 1e15 不引入新语法.

### 3.4 只读显示件

```ts
// src/widgets/ValueDisplay.ts(新)
export interface ValueDisplayOptions<T> {
    readonly value: ValueSource<T>;
    readonly text?: ValueText<T>;          // 默认:number 用 NUMBER_TEXT_DISPLAY,其余 String
    /** 全精度文本,写进 title;默认对 number 用 `String(v)`(最短往返表示). */
    readonly exact?: (value: T) => string;
    /** 空值文案;默认 '-'. */
    readonly placeholder?: string;
    /** 值更新是否让读屏播报;默认 false(见下). */
    readonly announce?: boolean;
    /** `<output for=...>`:关联产生这个值的输入框 id. */
    readonly forIds?: readonly string[];
}
export interface ValueDisplayHandle<T> {
    readonly element: HTMLOutputElement;
    set(value: T): void;
    dispose(): void;
}

/** 一行读数:复用 `.control-row`,只给值那半边的外观. */
export function createReadoutRow<T>(
    name: string,
    options: ValueDisplayOptions<T>,
): { readonly row: HTMLDivElement; readonly value: ValueDisplayHandle<T> };
```

产出结构(与 `createNumberRow` 同一套行词汇,消费者不写库的类名):

```html
<div class="control-row">
  <span class="ui-readout-name">方位角</span>
  <output class="ui-readout-value" aria-live="off" title="0.5999999999999999">0.6</output>
</div>
```

四条硬约定:

1. **`<output>` 语义对,但默认不播报**.HTML-AAM 把 `<output>` 映射成
   `role="status"`(隐式 live region);拖动滑杆时它每帧都变,不关掉就是读屏轰炸.
   所以库固定写 `aria-live="off"`,要播报才由 `announce: true` 交给 ARIA
   (`aria-live="polite"` + `aria-atomic="true"`).
2. **显示文本短,`title` 给全精度**.`0.1+0.2` 显示 `0.3`,
   `title="0.30000000000000004"`,鼠标停上去就能看到真实值.这条替代"提高小数位
   直到看得出来"那种做法.
3. **等宽数字,不跳字**.`.ui-readout-value` 带
   `font-variant-numeric: tabular-nums;`(token 另有 `--code-font-family` 出口),
   拖动时数字宽度不抖动.
4. **只读,不进 Tab 序**.显示件不接收键盘输入,所以不给 `tabindex`;
   需要"点一下变成可编辑"的那条路留给 `TextField`(README 已列出的补件),
   本方案不顺手造它.

### 3.5 现有控件的接入(不破坏选项名)

`NumberField` / `Slider` **新增**一个可选 `text?: ValueText<number>`,与既有的
`format` / `parse` 并存,优先级 `text` > `format`/`parse` > 默认.

- 加而不删:现有调用一行不用改;
- 默认档的切换放在 Phase 2(破坏性,见第 6 节):`String(value)` ->
  `NUMBER_TEXT_EDIT`.这是"统一"真正落地的那一步 -- 不切默认,统一只是多了个
  没人用的对象.
- `RangeInput` 加 `text?: ValueText<number>`,只用于 `input.value` 的写入
  (`.value` 对 range 只是字符串,不显示数字,但保持同一个口径免得将来分叉).

### 3.6 与既有机器契约的关系

- `test/emittedClasses.test.ts`:`ui-readout-name` / `ui-readout-value` 必须在
  `styles/widgets.css` 里有真规则(不能进 `INTENTIONAL_HOOKS`);
  `control-row` 已有规则,复用不给白名单加一条.
- `scripts/check_ui_boundary.py`:口径层是纯函数(`src/shared/`),不碰
  `document` / `window` / id,八条断言不受影响;库不引新依赖(`Intl` 是标准全局,
  见下面的决定 `D1`).
- `src/index.ts`:`export * from './shared/numberText'` 已经在了;新件按现有分组
  补一行 `export * from './widgets/ValueDisplay'`.

## 4. 方案 B:窗口内布局确定

### 4.1 三层

```text
   ③ 尺寸口径   --window-body-width / -height(JS 写的派生量)+ onGeometryChange
   ────────────────────────────────────────────────────────────────
   ② 布局原语   createStack / createScrollArea / createSplitter(显式声明)
   ────────────────────────────────────────────────────────────────
   ① 正文默认   不拉伸(按内容高),唯一子节点拉满,溢出裁切
```

原则:**默认值是确定的,拉伸是显式的**.现在正好相反.

### 4.2 ① 正文默认口径:把通吃规则换成"默认不拉伸 + 显式拉伸"

契约写在**面板正文这一层**(窗口复用面板,见 4.6),默认值与两条出口**同处一个
文件**,所以谁赢只由特异度决定,与样式表加载顺序无关:

```css
/* styles/widgets.css:正文容器的排布契约(面板与窗口共用) */
.ui-panel-body {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    min-width: 0;
}

/* 直接子节点默认**按内容高排**:不拉伸,也不被压扁.
   为什么不留 CSS 默认的 `0 1 auto`:它允许压缩 -- 内容比正文高时会被压扁
   而不是被裁掉(画布/图片尤其明显).`0 0 auto` 让溢出表现为裁切,与
   `.window-body` 的 `overflow:hidden` 一致,也让"确定"有个唯一答案. */
.ui-panel-body > * { flex: 0 0 auto; }

/* 两条显式拉伸出口(特异度 0,2,0 > 上面那条 0,1,0,顺序无关):
   - 唯一子节点:编辑器 / 画布 / 单个 pane 占满正文这个常见情形;
   - .ui-fill:多个区域里明确声明"这块吃掉剩余".
   basis 用 0 而不是 auto:多个 fill 时**均分**剩余高度,不按内容比(见 4.4 第 1 条). */
.ui-panel-body > :only-child,
.ui-panel-body > .ui-fill,
.ui-panel-body > .ui-scroll-area {
    flex: 1 1 0;
    min-height: 0;
    min-width: 0;
}

/* styles/desktop.css:窗口只是覆盖面板的 padding 与溢出,不再重复排布规则 */
.window > .window-body {
    padding: 0;
    overflow: hidden;
}
```

两条要注意的:

- `:only-child` 会命中"正文里恰好只有一个节点"的所有情形,包括那个节点是
  `.ui-scroll-area` 或 `.ui-fill` -- 结论一致,不冲突;
- `.ui-scroll-area` 的 `overflow` 在 `layout.css`(0,1,0),这里的拉伸在
  `widgets.css`(0,2,0),两者属性不重叠,所以单独引 `widgets.css` 或单独引
  `layout.css` 都不会把对方盖坏.

**分期上的一个细节**:三条显式拉伸出口是 `(0,2,0)`,已经高于旧规则
`.window-body > * { flex: 1 1 auto }` 的 `(0,1,0)`,所以布局原语在 Phase 3
就能直接生效,不必等 Phase 4.而"默认不拉伸"那条与旧规则**同特异度**,谁赢由
`styles.css` 的导入顺序决定(桌面在后 -> 旧规则赢),所以它只能和"删掉旧规则"
一起做 -- 这就是 Phase 4 存在的原因.

### 4.3 ② 布局原语(三个,不多不少)

```ts
// src/layout/Stack.ts
export interface StackOptions {
    readonly children?: readonly Child[];
    readonly direction?: 'column' | 'row';   // 默认 column
    readonly gap?: string;                   // 默认 var(--layout-gap)
    readonly padding?: string;               // 默认 var(--layout-padding)
    readonly align?: 'stretch' | 'start' | 'center' | 'end' | 'baseline';
    readonly justify?: 'start' | 'center' | 'end' | 'between';
    /** 吃掉剩余空间(等价于在正文里 .ui-fill);默认 false. */
    readonly fill?: boolean;
}
export function createStack(options?: StackOptions): {
    readonly element: HTMLDivElement;   // .ui-stack[.ui-stack--row][.ui-fill]
};

// src/layout/ScrollArea.ts
export interface ScrollAreaOptions {
    readonly child?: Child;
    /** 只滚一个轴;默认 both. */
    readonly axis?: 'y' | 'x' | 'both';
    /** 给内部内容加内边距(留白归滚动区,滚动条贴外沿);默认 var(--layout-padding). */
    readonly padding?: string;
}
export function createScrollArea(options?: ScrollAreaOptions): {
    readonly element: HTMLDivElement;
    readonly content: HTMLDivElement;
};

// src/layout/Splitter.ts  (README 的补件清单里那一项,独立上线)
export interface SplitterOptions {
    readonly first: Child;
    readonly second: Child;
    readonly direction?: 'column' | 'row';        // 默认 row(左右分)
    readonly ratio?: ValueSource<number>;          // 0..1;给 signal 就是双向持久化
    readonly minRatio?: number;                    // 默认 0.1
    readonly label?: string;                       // separator 的可访问名
}
export function createSplitter(options: SplitterOptions): {
    readonly element: HTMLDivElement;   // .ui-splitter
    readonly first: HTMLDivElement;     // .ui-splitter-pane
    readonly second: HTMLDivElement;
    readonly handle: HTMLElement;       // role="separator"
    dispose(): void;
};
```

`createStack` / `createScrollArea` 是"类名契约的出口":消费者**不写库的类名**
(与 `Row.ts` 的既有约定一致),库改类名不破坏消费者.

`.ui-scroll-area` 的定义刻意**只有一个语义**:它就是那块"吃掉剩余高度,超出就滚"
的区域(`flex:1 1 0; min-height:0; overflow:auto`,拉伸部分见 4.2).
要一个**固定高度**的滚动框,把它包进一层并用自己的类压 `flex`,或不要它 --
库不提供第二种滚动语义,否则"确定"又变成两种解释.

`styles/layout.css` 只放原语自己的外观(`.ui-stack*` 的 `gap/padding/方向`,
`.ui-scroll-area` 的 `overflow`,`.ui-splitter*`),不写任何"父亲是谁"的选择器;
挂进 `styles/styles.css` 的位置是 **`widgets.css` 之后,`desktop.css` 之前**
(总入口现有的 `token -> 滚动条 -> 控件 -> 桌面` 顺序里,布局原语属于"控件"那一档).
它是新的一份分组入口,`package.json` 的 `exports` 同步加 `./styles/layout.css`.

`Splitter` 的比例换算与夹取抽成纯函数(`src/layout/splitterGeometry.ts`),
与 `desktop/WindowGeometry.ts` 同一条路数:没有 DOM,单测穷举.

### 4.4 确定的六条不变量(写成契约,不是注释)

1. **直接子节点不拉伸**;只有 `.ui-fill` / `:only-child` / 布局原语自己声明的
   `fill` 拉满.多个 fill 用 `flex: 1 1 0`,**均分**剩余高度(不是按内容比).
2. **分配顺序 = DOM 顺序**:固定的头/工具条在上,吃掉剩余的在中,固定的尾在下;
   库不提供 `order` 之类的视觉错位.
3. **溢出只发生在显式声明的滚动区**;`.window-body` 自身 `overflow:hidden`,
   裁切而不是压缩(所以子节点是 `0 0 auto`).
4. **滚动区必须整体滚**:`createScrollArea` 产出的容器同时带 `ui-scroll-area` 与
   `ui-scrollbar`(见 4.5 的决定),它的 `min-height:0` 由原语自己写,消费者不必
   再沿链补.
5. **浮层不进正文**.正文 `overflow:hidden` 会切掉浮层;窗口浮层的唯一出口是
   标题栏的 `overlays` 槽(它就在 `.window-header` 里,见 `WindowFrame.ts:120-129`),
   面板浮层用 `Popover`(需要定位父级).这条把"为什么有 overlays 槽"落成规则.
6. **尺寸只来自配置与 token**:`--dock-reserve` / `--window-header-height` 由
   `WindowManager` 写(已有);布局原语不写任何魔法数,间距/内边距走
   `--layout-gap` / `--layout-padding` 两个新 token.需要在尺寸变化时重排的件
   订阅 `onGeometryChange(id)`,**不引 `ResizeObserver`**(与「不用批处理,不引
   调度器」同一条约束,也是 900 行 DOM 桩还能用的前提).

### 4.5 与"滚动条是单独一条规定"的正面冲突(必须拍板)

`test/scrollbarStyles.test.ts:11-13` 的注释写着"库的组件也不产出这个类 --
唯一的接触面是消费方自己往滚动容器上加的类名".而 4.4 第 4 条要求
`createScrollArea` 替消费者挂上 `.ui-scrollbar`.两者只能选一个:

| 方案 | 做法 | 代价 |
| --- | --- | --- |
| **A(推荐)** | 由 `createScrollArea` 挂 `.ui-scrollbar`;`styles/scrollbar.css` 一个字符不改(仍然自足,无反向引用);把测试注释改成准确表述,并**新增一条正向断言**:库内产出 `ui-scrollbar` 的 TS 文件只能是 `src/layout/ScrollArea.ts` | 需要改一条测试的注释 + 加一条断言;库与滚动条规定之间多了一条"语义引用"(不是样式耦合) |
| B | `createScrollArea({ scrollbar?: boolean })`,默认 `false`,消费者自己挂 | 保留原文,但"窗口内布局确定"就漏掉了滚动容器这一半 -- 消费者仍要记得挂类,而这正是本方案要消灭的"记得" |

选 A 的理由:那条测试真正守的是**样式自足**(`scrollbar.css` 的选择器只挂
`.ui-scrollbar`,取值只来自 token,别处不许给它写规则),这三条 A 全都不破.
"库内没有任何地方产出这个类"只是当年为了说明"独立"顺手写下的一句话,不是那份
规定的价值本身;而 `createScrollArea` 正是"滚动容器"这个语义在库里的唯一出口.

### 4.6 面板与窗口共用同一份契约

库已经把"窗口 = 面板 + 几何与拖动"分了层(`Panel.ts` 文件头,`desktop.css` 的
`.window ...` 覆盖).布局契约跟着这条分层走:

- `styles/widgets.css` 的 `.ui-panel-body` 拿到**通用**部分(列排布 + 子节点策略,
  见 4.2);
- `styles/desktop.css` 只写窗口的差异(`padding:0`,`overflow:hidden`),
  不再重复任何排布规则;
- 布局原语(`.ui-stack` / `.ui-scroll-area` / `.ui-splitter`)不依赖任何一个,
  所以嵌进面板正文同样成立.

代价有两条,都要在 Phase 3 目视核对:

1. `.ui-panel-body` 从"块级 + 内边距"变成"列 flex":子节点成为 flex item
   (`margin` 不再折叠,宽度默认拉伸,`flex:0 0 auto` 不压缩).它对面板里
   常见的一列内容基本无感,但不是零差异;`ui-panel*` 是 v0.1.8 刚加的,
   消费面很小,现在改比以后改便宜.
2. 窗口正文的**行为差异只在"多个直接子节点"这一种情形**:从"各拿 1 份拉伸"
   变成"各按内容高,不拉伸".只有一个子节点的窗口(现有两个应用的主要形态)
   观感不变 -- 这正是 Phase 4 敢单独发一次的原因.

### 4.7 三个新 token

```css
/* tokens.css */
--layout-gap: 8px;         /* 布局原语的默认间距 */
--layout-padding: 10px;    /* 布局原语的默认内边距 */
--layout-hit-size: 8px;    /* Splitter 手柄的命中宽度(负偏移跨在边界上,同 resize-handle) */
```

名字取 `--layout-*` 而不是复用 `--panel-*`:前者是"容器怎么排",后者是"框体长
什么样",混用会让"窗口正文没有内边距"这条差异重新变成猜谜.

## 5. 改动清单(按文件)

| 文件 | 动作 | 属 Phase |
| --- | --- | --- |
| `src/shared/numberText.ts` | 重写为策略工厂 + 两个预置 + `parseNumber`;保留 `formatNumber` / `formatVector` 旧签名与行为 | 0 |
| `src/shared/numberText.test.ts` | 补策略与边界用例(含编辑档语法正则) | 0 |
| `src/widgets/ValueDisplay.ts` | 新增 `createValueDisplay` / `createReadoutRow` | 1 |
| `styles/widgets.css` | `.ui-readout-name` / `.ui-readout-value` 默认规则;`.ui-panel-body` 的正文排布契约(4.2) | 1 / 3 |
| `src/widgets/NumberField.ts` / `Slider.ts` / `RangeInput.ts` | 加 `text?`;Phase 2 切默认档 | 1 / 2 |
| `src/index.ts` | 补导出(`ValueDisplay`,布局组) | 1 / 3 |
| `src/layout/Stack.ts` / `ScrollArea.ts` / `splitterGeometry.ts` / `Splitter.ts` | 新增布局组 | 3 / 5 |
| `styles/layout.css` + `styles/styles.css` + `package.json` 的 `exports` | 新增 `./styles/layout.css` 并挂进总入口 | 3 |
| `styles/desktop.css` | 删掉 `> *` 通吃;窗口正文只留 `padding:0` + `overflow:hidden` | 4 |
| `styles/tokens.css` | 三个 `--layout-*` | 3 |
| `test/emittedClasses.test.ts` | 不加白名单(新类全部有真规则);若采用 4.5-A 则加正向断言 | 3 |
| `test/layoutStyles.test.ts`(新) | 解析 CSS 文本守 4.2 / 4.4 的形式断言 | 3 |
| `test/scrollbarStyles.test.ts` | 按 4.5 的决定改注释并加断言 | 3 |
| `example/main.ts` / `example/example.css` | 读数改用 `createReadoutRow`,正文改用 `createStack`;删掉自写的 `.readout*` 与 `.pane` | 1 / 3 |
| `README.md` | 公开面表补 `layout/` 与读数件;"还没做的"划掉 `Splitter` / `ScrollArea`;补两条新契约 | 各 Phase |
| `docs/...`(本文) | 随实现更新状态与决策记录 | 各 Phase |

## 6. 分期与发布

两处破坏性变更(默认口径切档,去掉 `> *` 通吃)**合并成一次 `0.2.0`**,
但先让非破坏性的脚手架先上线,消费者先吃一层,破坏性那一步才没有回头路.

| Phase | 内容 | 破坏性 | 闸门 |
| --- | --- | --- | --- |
| 0 | 口径层(策略工厂 + 预置 + parse + 单测) | 无(纯新增/等价重写) | `npm run build` |
| 1 | 显示件 + 样式 + `text?` 选项 + 示例改用显示件 | 无(默认仍 `String`) | `npm run build` + 示例目视 |
| 2 | 默认口径切到 `NUMBER_TEXT_EDIT` / `NUMBER_TEXT_DISPLAY` | **有**(默认文本变化) | 消费者同步改;`RELEASING.md` 顺序:先发库 |
| 3 | 布局组(Stack / ScrollArea / tokens / layout.css)+ `.ui-panel-body` 列排布 + 三条**显式拉伸**出口 + CSS 契约测试 | 面板正文排布有变化 | 示例目视 + 契约测试 |
| 4 | 加"直接子节点不拉伸"默认并删掉旧 `.window-body > *` 通吃 | **有**(多子节点不再等分/拉伸) | **搁置,待实验**;要试的话,先只加 Phase 3 的三条显式拉伸出口(它们不影响旧行为),拿真实布局跑一遍再决定这一步 |
| 5 | `Splitter`(带键盘与拖拽) | 无(新增) | 交互测试 + 示例目视 |

发布顺序按 `RELEASING.md`:库先推 `main` 出滚动资产,两个应用仓库再
`npm run ui:update` 并改调用点.**不能反过来** -- 资产里是构建产物,消费者改动
上线时库必须已经在.

## 7. 需要拍板的决定

| 编号 | 决定 | 建议 |
| --- | --- | --- |
| D1 | 显示档是否支持千位分隔符,若支持用不用 `Intl.NumberFormat` | **默认不开**,`group` 只在消费者显式给 `Intl` 的格式化时生效.`Intl` 的输出随 ICU/区域设置变,库的默认行为不该随环境变 |
| D2 | `NumberField` / `Slider` 默认口径是否切到 `NUMBER_TEXT_EDIT` | **搁置,待实验**.原建议:切(Phase 2).不切则"统一"无人执行;切了要发一次 minor + 迁移说明.实验时可以先给 `text?`(Phase 1),默认不动,拿来跑一遍真实参数面板看观感 |
| D3 | `createValueDisplay` 默认是否让读屏播报 | **不播报**(`aria-live="off"`),`announce:true` 才开 |
| D4 | `.window-body` 自身是否可滚 | **不滚**,保持 `hidden` + 显式 `createScrollArea`.正文可滚会让绝对定位的浮层与手柄语义一起变模糊 |
| D5 | 4.5 选 A 还是 B(`createScrollArea` 是否自己挂 `.ui-scrollbar`) | **A** + 那条正向断言 |
| D6 | 多个 `.ui-fill` 是均分(`flex:1 1 0`)还是按内容比(`1 1 auto`) | **均分**(确定,可预期) |
| D7 | `Splitter` 是否本期做 | 可延后;`Stack` / `ScrollArea` 是"确定"的最小集,`Splitter` 是交互件,自己一条 Phase 5 |

## 8. 不做的事(明确划出去)

- **不引 `ResizeObserver`**,不做 JS 测量排版;需要在尺寸变化时重排的件继续走
  `onGeometryChange`(第 4.4 第 6 条).
- **不加运行时依赖**:没有 CSS-in-JS,没有 `Intl` 数据包,`katex` 仍是唯一 peer.
- **不造 `TextField`**:带输入框的文本编辑(以及"点一下变可编辑")是另一件事,
  与 README 的补件清单一起排.
- **不把 `.pane` 那套消费者内边距搬进库**:库给 `--layout-padding` 与 `createStack`,
  给多少是消费者的排版选择.
- **不在库内出现应用窗口名 / 领域语义**(边界第 1-3 条),布局原语不认识"参数面板"
  这类概念.

## 9. 验收标准

方案落地后,下面每一条都能用机器或目视验收:

1. 同一个 `signal<number>` 绑到 `Slider` 的数值框,`NumberField` 与 `createReadoutRow`,
   给同一个 `text` 时三处文本**逐字符相同**(新契约测试).
2. `formatNumber` / `formatVector` 的现有 7 条断言一条不改仍然通过(等价重写).
3. 编辑档 `toText` 的输出对全部边界值匹配 number input 合法语法正则.
4. `npm test` 的 `emittedClasses` 不需要为新类扩白名单.
5. 示例里出现一个窗口:固定工具条 + `fill` 主体 + 滚动区 + `Splitter`,
   窗口被拖到任意小尺寸时,固定条不被压扁,滚动区出现滚动条,没有任何内容越界.
6. `example/example.css` 里不再有 `.readout*` 与 `.pane`(全部由库的原语承担).
7. 示例的"读数"窗口:拖滑杆时数字不跳字(`tabular-nums`),`title` 里是全精度值.
