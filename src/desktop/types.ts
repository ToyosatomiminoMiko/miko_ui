/**
 * 桌面窗口系统的**配置词汇**.
 *
 * 这里定义的是"库认识什么"(锚点怎么写,槽位有哪几个,动作有哪几个),不是
 * "这个应用有哪些窗口".哪些窗口,标题叫什么,正文装什么内容,属于应用配置,
 * 由消费者以构造参数传进来(docs/ui-library-extraction-plan.md D4/U2).
 *
 * 为什么 `WindowId` 是不透明的 `string`:库只拿它当 Map 的键与 `data-*` 的值,
 * 不解释它.把它写成 'source' | 'view' | ... 就等于把某个应用的窗口清单焊进
 * 库的公开面(§10"明确不做的事").
 */

/** 窗口 id:库不解释的字符串;应用侧用自己的字面量联合收窄. */
export type WindowId = string;

/**
 * 标题栏上的挂载槽位.
 *
 * 这是窗口标题栏的**唯一一套位置词汇**:配置用 `slot` 声明节点进哪里,
 * `createWindowFrame` 按同一个键装配,DOM 契约(`.window-title` /
 * `.window-actions` / `.window-header`)与测试断言说同一个词.
 */
export type WindowSlot = 'title' | 'actions' | 'overlays';

/**
 * 标题栏上的窗口按钮 id.
 *
 * 只有"最小化 / 最大化"两个:没有真正的进程可关,`close` 与 `minimize` 在观感上
 * 就是同一件事(都是把窗口藏起来),留着只会多一个语义重复的按钮;`fullscreen`
 * 与 `maximize` 的差别也只剩"遮不遮任务栏",而任务栏不该被遮--所以这两个
 * 动作连同它们的状态一起删掉了(见 `WindowManager` 的 `WindowState`).
 */
export type WindowActionId = 'minimize' | 'maximize';

/**
 * 窗口几何:一个轴上的定位方式(见 docs/windowing-plan.md §4.1).
 *
 * Dock 是顶部一条任务栏,它把桌面切成"任务栏带 + 工作区":**y 轴的默认坐标
 * 原点在工作区上沿**(`at` / `center` / `fraction` 都从这里量),所以消费者写
 * `y: { at: 16 }` 得到的是"任务栏下沿再往下 16px",不需要自己加任务栏高度.
 *
 * `from: 'bottom'` 的语义**只有一条**:该窗口的这条边落在距桌面该侧 `inset`
 * 处,于是 `x: { from: 'right', inset } -> x = dW - inset - w`,`h: { from:
 * 'bottom', inset } -> h = dH - inset - y`.同一列上的窗口共用同一个底边
 * `inset`,底边自然齐平,不需要第二套规则.
 */
export type AxisSpec =
    | { readonly at: number }
    | { readonly from: 'right' | 'bottom'; readonly inset: number }
    | 'center'
    | { readonly fraction: number; readonly of: 'usableHeight' }
    | {
        readonly clamp: readonly [min: number, max: number];
        readonly inset: number;
    };

/**
 * 默认几何:写"锚点",不写算出来的数字.
 *
 * 列高与中列宽度都依赖桌面尺寸,写死 px 只在某一个视口下正确,因此配置里
 * 只描述锚点,由 `WindowGeometry.resolveDefaultGeometry()` 按当前桌面算出 px.
 */
export interface WindowGeometrySpec {
    readonly x: AxisSpec;
    readonly y: AxisSpec;
    readonly w: AxisSpec;
    readonly h: AxisSpec;
    /** 依赖另一个窗口:`y` 接在 `after` 的下方 `gap` 像素处(`y` 被忽略). */
    readonly after?: { readonly id: string; readonly gap: number };
}

/**
 * 标题栏上的一枚窗口按钮:顺序即显示顺序,文案进配置不散在 TS 里.
 *
 * `text` 是按钮**唯一**的文案 -- 既是可见文字,也是它的可访问名(读屏读到的
 * 就是 `min` / `max`).不另设"读屏名"字段:`minimize` / `maximize` 这两个动作
 * 的名字不提供任何额外信息,留着只是同一句话写两遍.
 *
 * 文案不随窗口状态改写(`min` / `max` 一直这么写):"已最大化"由窗口尺寸与
 * `.is-maximized` 类表达,不靠换按钮字.
 */
export interface WindowAction {
    readonly id: WindowActionId;
    /** 按钮文案;不随状态变(`min` / `max`). */
    readonly text: string;
}

/**
 * 采用关系:一个**具名节点**放进某窗口的某个槽.
 *
 * 泛型参数就是消费者自己的节点名联合(应用侧是 `ChromeNodeId`):`node` 的名字
 * 与 `chrome` 表的键由同一份类型锁死,少建一个节点即编译不过.
 */
export interface AdoptedNodeSpec<Node extends string = string> {
    readonly node: Node;
    readonly window: WindowId;
    readonly slot: WindowSlot;
}

/** 一个窗口的声明式描述;正文内容不在其中(见 D1 的 `mountDesktop`). */
export interface WindowConfigEntry {
    readonly id: WindowId;
    /** 标题栏文案,同时是 Dock 按钮的 `title` 与无障碍名. */
    readonly title: string;
    readonly dock: { readonly label: string };
    readonly defaultGeometry: WindowGeometrySpec;
    readonly minSize: { readonly w: number; readonly h: number };
}

/**
 * 桌面窗口系统的全部配置:数组顺序即 z 初始序,Dock 顺序与默认几何的
 * 依赖顺序(`after`),不能随意调.
 */
export interface DesktopConfig {
    readonly windows: readonly WindowConfigEntry[];
    readonly actions: readonly WindowAction[];
    /** 移动/缩放时窗口至少留在桌内的宽度(px). */
    readonly edgeKeep: number;
    /** 窗口与桌面边缘的间隙(px). */
    readonly edgeGap: number;
    /** 标题栏至少可见高度(px):夹取 `y` 的上界要用它. */
    readonly headerMinVisible: number;
    /**
     * 顶部 Dock(任务栏)占用的高度(px),也是窗口工作区的上沿:
     * 窗口的 `y` 从这里量起,夹取与最大化/吸附都不越过它.
     */
    readonly dockReserve: number;
    /** `.window-header` 高度(px):经 `applyTheme` 写成 CSS 变量. */
    readonly headerHeight: number;
    readonly z: {
        readonly windowLayer: number;
        readonly first: number;
        readonly snapPreview: number;
        readonly dock: number;
    };
    readonly snap: { readonly edge: number; readonly magnet: number };
}

/**
 * 库提供的默认值占位:消费者 `{ ...DEFAULT_DESKTOP_CONFIG, windows }` 就取到
 * "每个桌面都成立"的那组数(动作 / 边缘余量 / 标题栏高度 / z / 吸附).
 *
 * `windows` 为空 -- 窗口清单是应用特有的,库不预设任何窗口.
 */
export const DEFAULT_DESKTOP_CONFIG: DesktopConfig = {
    windows: [],
    actions: [
        { id: 'minimize', text: 'min' },
        { id: 'maximize', text: 'max' },
    ],
    edgeKeep: 80,
    edgeGap: 16,
    headerMinVisible: 36,
    dockReserve: 40,
    headerHeight: 36,
    /**
     * 三层容器的 z-index(由 WindowManager 写成行内样式,是**唯一**来源:
     * CSS 里没有这几个数).`snapPreview` 必须在窗口层**之下**--它标记的是
     * "窗口会落到哪里",画在窗口之上会盖住正在拖的那个窗口.
     */
    z: { windowLayer: 100, first: 110, snapPreview: 50, dock: 200 },
    snap: { edge: 16, magnet: 8 },
};
