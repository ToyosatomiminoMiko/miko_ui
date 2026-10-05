/**
 * `miko_ui` 的最小示例.
 *
 * 四个窗口:一个放两条**系数滑块**(普通参数 + 周参数)与一个**计数按钮**,
 * 一个放它们的读数,一个放**菜单项**(直接显示 + 任意按钮触发),一个放
 * **诊断消息区**(提示随参数变化自动出现 / 消失).
 *
 * "这个量在圆周上"是**调用方**的语义,库不管:控件只有一种姿态.提示只能写进
 * `label` / `hint` 的文案 -- 这条滑块的名字里就直接写着周期,库不为它另立外观;
 * 要回绕就自己给一条纯函数:`normalize` 管**口径**,越界输入按区间长度回绕到
 * `[min, max)`,控件本身不认识圆周.这里输入 7 会看到 `7 - 2π`.
 *
 * 重置按钮是系数滑块自带的:`resetValue` 默认取建控件时的值,已经停在
 * 该值上(值与数值框文本都比)时按钮置灰.
 *
 * 页面只依赖 `miko_ui` 与本目录的文件:窗口层 / 吸附预览 / Dock / 每个
 * 窗口的外壳都由 `mountDesktop()` 按配置建出来.
 */
import {
    DEFAULT_DESKTOP_CONFIG,
    createButton,
    createFormulaElement,
    createMenu,
    createMessageArea,
    createReadoutRow,
    createSlider,
    create_element,
    computed,
    mountDesktop,
    numberText,
    signal,
    watchValue,
    type DesktopConfig,
    type MenuGroup,
    type MessageEntry,
    type WindowConfigEntry,
} from 'miko_ui';
// 库自带的样式:token + 控件 + 桌面窗口系统 + 编辑器外壳.示例只补页面级规则.
import 'miko_ui/styles.css';
import './example.css';

// 唯一的挂载点:后面所有 UI 都基于它
const root = document.getElementById('app');
if (!root) throw new Error('example/index.html 缺少 #app');

// ── 区间口径各写一份:滑杆 / 数值框 / 回绕 / 读数都读同一组数 ─────────────
/** 普通参数:0..100 的线性数值. */
const LINEAR = { min: 0, max: 100, step: 1 } as const;
/** 循环参数:方位角,`-π` 与 `π` 在圆周上是同一点. */
const ANGLE = { min: -Math.PI, max: Math.PI, step: 0.01 } as const;

// ── 状态:每个量一个 signal,写它的控件与读它的读数共用同一份 ───────────────
const linear = signal(50);
const angle = signal(0.6);
/** 计数值:`0..255`,满了再按一下回到 `0`. */
const count = signal(0);

/**
 * 计数的上限口径:写值的按钮与下面出提示的诊断**读同一个数**.
 * 写成两处字面量(`255`)的话,"上限改了"只会在其中一处生效.
 */
const COUNT_MAX = 255;

/**
 * 循环参数的回绕口径:把任意输入落回 `[min, max)` 半开区间.
 *
 * `min` 与 `max` 在圆周上是同一个点,所以闭区间会把端点算两次.先取模再补正,
 * 负数(如 `-7`)也能落回区间里.
 */
function wrapAngle(raw: number): number {
    const span = ANGLE.max - ANGLE.min;
    return ANGLE.min + ((((raw - ANGLE.min) % span) + span) % span);
}

// ── 窗口一:两条系数滑块(名称 + 滑杆 + 数值框 + 重置)+ 计数按钮 ──────────
const linearSlider = createSlider({
    value: linear,
    ...LINEAR,
    label: '线性数值',
});

/**
 * 方位角的口径:**一个对象同时喂数值框与读数行**,所以两处文本逐字符相同.
 *
 * 各写一份 `toFixed(3)` 就会在改口径时只改一处(库的两个消费者合计 8 处各写一遍
 * 读数格式化,就是这么来的).
 *
 * 编辑框的口径要么无损,要么至少覆盖 `step` 的小数位 -- 这里 `step` 是 `0.01`
 * (2 位),给 3 位定点足够;给 2 位也不会量化,给 1 位则用户一编辑值就被舍掉.
 */
const ANGLE_TEXT = numberText({ syntax: 'edit', digits: 3, trimZeros: false });

const angleSlider = createSlider({
    value: angle,
    ...ANGLE,
    // 名字里就能看出这是"绕着转"的量:周参数的值域提示写进名称,库不另立外观.
    label: '方位角(周期 2π)',
    // 输入 7 -> 7 - 2π ≈ 0.717:`normalize` 只挂在数值框上,滑杆不会越界.
    normalize: wrapAngle,
    text: ANGLE_TEXT,
});

// ── 计数按钮:只写 `count`,值显示在另一个窗口 ──────────────────────────
/** 建控件与接线分开:按钮不认识读数窗口,它只改自己这一份状态. */
const countButton = createButton({ text: '计数 +1' });
countButton.onClick(() => {
    count.value = count.value >= COUNT_MAX ? 0 : count.value + 1;
});

// ── 窗口二:读数(只读显示,订阅各自的 signal)────────────────────────────
/**
 * 读数行直接用库的 `createReadoutRow`:订阅,`<output>` 语义,全精度 `title`,
 * 等宽数字(`tabular-nums`)全在库里,示例不再自己拼 markup 与 `.readout*` 样式.
 *
 * 不给 `text` 时走**显示档**:同一份值在编辑框里是 `0.30000000000000004`,在读数里
 * 是 `0.3`,悬停 `title` 还能看到全精度 -- 显示要短,`title` 给真值,这两件事分开.
 *
 * 字形(等宽族与字号)是页面的事:`class` 出口把示例自己的类挂在基线类之后,示例样式
 * 只写自己的类 -- **不要给只含库的类的选择器写样式**,那是消费者的分层契约.
 */
const READOUT_CLASS = 'readout-value';

const linearReadout = createReadoutRow('线性数值', { value: linear, class: READOUT_CLASS }).row;
const countReadout = createReadoutRow('计数', { value: count, class: READOUT_CLASS }).row;
// 与滑块的数值框共用同一个口径对象:两处文本逐字符相同.
const angleReadout = createReadoutRow(
    '方位角',
    { value: angle, text: ANGLE_TEXT, class: READOUT_CLASS },
).row;

/**
 * 公式读数:同一个值走 `syntax: 'latex'` 得到 LaTeX,再由 `render` 交给库的
 * `createFormulaElement` 排出来 -- 下游不许直接依赖 katex,所以"排公式"在库里
 * 只有这一条路,消费侧连 `katex` 这个名字都不用提.
 *
 * 显示件只做"文本 -> 节点"这一步(`render`),不认识任何排版器;这是它有别于
 * `text` 的地方:`text` 决定**文本**,`render` 决定**这格长什么样**.
 *
 * 这里的量级落在常规区间,屏幕上是 KaTeX 排的 `0.600`;把上面的 `digits` /
 * `exponentialAt` 调一调就会看到 `2.775558\times10^{-17}` 这种只有排出来才读得懂的
 * 写法(纯文本档是 `2.775558e-17`).
 */
const ANGLE_FORMULA_TEXT = numberText({ syntax: 'latex', digits: 3, trimZeros: false });

const angleFormulaReadout = createReadoutRow('方位角(公式)', {
    value: angle,
    text: ANGLE_FORMULA_TEXT,
    // `copyable=false`:读数不是复制公式的入口(它的 TeX 也没有可复用价值).
    render: (latex) => createFormulaElement(latex, 'readout-formula', false),
    class: READOUT_CLASS,
}).row;

// ── 窗口三:菜单(直接显示 + 任意按钮触发)────────────────────────────────
/**
 * 菜单数据:一个分组标题 + 若干"标题 + 注记"项.
 * `value` 是选中回调要的载荷(这里用文案本身).
 *
 * 摆树 / 分组 / 当前项 / 开合全在库的 `createMenu` 里,这里只有数据.
 */
const MENU_GROUPS: readonly MenuGroup<string>[] = [
    {
        title: '显示',
        entries: [
            { value: '显示网格', text: '显示网格', hint: 'G' },
            { value: '显示坐标轴', text: '显示坐标轴', hint: 'A' },
        ],
    },
    {
        title: '操作',
        entries: [
            { value: '重置视图', text: '重置视图', hint: 'R' },
            // 禁用态由控件自己表达(按钮的 disabled),消费者不写任何类名.
            { value: '导出图片', text: '导出图片', hint: '仅桌面版', disabled: true },
        ],
    },
];

/** 菜单当前选中项(菜单项的 `value`);`null` = 还没选过. */
const menuChoice = signal<string | null>(null);

// 触发器是**普通按钮**:`createMenu` 只认"一个元素",它不认识窗口标题栏,
// 也不要求触发按钮长什么样.
const menuTrigger = createButton({ text: '打开菜单' });

/**
 * 菜单面板自己会滚动(`.menu-panel` 有 `max-height` + `overflow-y`),但库的
 * 滚动条规定与菜单件**互不认识**(见 `styles/scrollbar.css`):要不要统一滚动条
 * 外观,由消费者在这颗面板上挂 `ui-scrollbar` 决定.示例这里两份菜单各挂一次.
 */
const scrollablePanel = (): HTMLElement => create_element({ tag: 'div' }, { class: 'ui-scrollbar' });

/** 直接显示:不给 `trigger`,面板常驻在正文里. */
const staticMenu = createMenu({
    groups: MENU_GROUPS,
    ariaLabel: '视图菜单(直接显示)',
    panel: scrollablePanel(),
});
/** 浮层:给了 `trigger`,`createMenu` 自己建 `Popover` 并叠上 `.menu-popover`. */
const popoverMenu = createMenu({
    groups: MENU_GROUPS,
    ariaLabel: '视图菜单(浮层)',
    trigger: menuTrigger.element,
    panel: scrollablePanel(),
});

// 选中态只有一个来源:两份菜单都把选中的 `value` 写进 `menuChoice`,再由它刷
// 各自的当前项 -- 菜单不自己存"当前项".
for (const menu of [staticMenu, popoverMenu]) {
    menu.onSelect((value) => {
        menuChoice.value = value;
    });
}
watchValue(menuChoice, (choice) => {
    staticMenu.setActive(choice);
    popoverMenu.setActive(choice);
});

const menuPane = create_element(
    { tag: 'div' },
    // 与其余三扇窗口同一条 `.pane`:正文按顺序从上往下堆叠,不做垂直居中.
    { class: 'pane' },
    create_element({ tag: 'span' }, { class: 'pane-caption' }, '任意按钮触发(createMenu)'),
    create_element(
        { tag: 'div' },
        { class: 'menu-anchor' },
        menuTrigger.element,
        popoverMenu.panel,
    ),
    create_element({ tag: 'span' }, { class: 'pane-caption' }, '直接显示(role="menu")'),
    staticMenu.panel,
);
// 点浮层外关闭:绑定的根就是这张菜单所在的正文.
popoverMenu.bind(menuPane);

const menuReadout = createReadoutRow<string | null>('菜单选择', {
    value: menuChoice,
    placeholder: '未选',
    class: READOUT_CLASS,
}).row;

// ── 窗口四:诊断消息区(容器由库建,示例只给条目)────────────────────────
/**
 * 出提示的门槛:这是**示例自己的领域口径**.
 *
 * 库只认识 `warning` / `error` 两个等级与一行文字,不认识"多少算超限" --
 * 所以"什么情况该报警"必须留在消费侧,库里一个字都没有.
 */
const LINEAR_WARN = 80;
const LINEAR_ERROR = 95;
/** 方位角离 `±π` 多近算"贴边":`π` 与 `-π` 是圆周上的同一点. */
const ANGLE_WARN = Math.PI - 0.15;

/**
 * 当前该显示哪些提示(纯函数:读状态,不写状态,也不认识窗口).
 *
 * 文案里的阈值直接用上面那几个常量插值,所以提示与判据不会各说各话.
 */
function collectMessages(): MessageEntry[] {
    const entries: MessageEntry[] = [];
    const value = linear.value;

    /*
     * 两根阈值线把线性数值切成三段(正常 / 精度下降 / 被裁),这不是"两个互相
     * 独立的条件":`> LINEAR_ERROR` 的数**必然**也 `> LINEAR_WARN`,它们是同一
     * 根轴上的一档比一档宽.所以写成 switch 的档位语义:
     *
     * - `switch` 只落到**第一个**为真的 case,所以 case 必须从高阈值往低阈值写;
     * - 落到"被裁"这一档时**故意落穿**(该 case 不写 break)到警告档,把两档提示
     *   都补上.漏了落穿就会吃掉 warning 那条,这是 switch 与串 if 唯一的差别.
     *
     * 提示顺序因此是"先 error 后 warning":越严重越靠前.
     */
    switch (true) {
        case value > LINEAR_ERROR:
            entries.push({ level: 'error', message: `线性数值超过 ${LINEAR_ERROR}:采样被裁到上限` });
        // 落穿是刻意的:能走到这一档的值必然也越过了下面那条警告线.
        case value > LINEAR_WARN:
            entries.push({ level: 'warning', message: `线性数值超过 ${LINEAR_WARN}:渲染精度下降` });
            break;
    }

    /*
     * 方位角与计数各是一根**独立**的线,和上面的档位无关:两件事可以同时成立.
     * 所以不能塞进同一条 switch -- switch 一次只落一个 case,同时成立时后一条
     * 提示会被静默吃掉.各自一条 if 才是与语义对齐的写法.
     */
    if (Math.abs(angle.value) > ANGLE_WARN) {
        entries.push({ level: 'warning', message: '方位角接近 ±π:两端在圆周上是同一点' });
    }
    if (count.value >= COUNT_MAX) {
        entries.push({ level: 'warning', message: `计数到 ${COUNT_MAX}:再按一下回到 0` });
    }
    return entries;
}

/**
 * 消息区容器由库建:`div.message-area[aria-live=polite]` 的列表节奏 / 滚动都在
 * `styles/feedback.css`,示例不写一行外观.
 *
 * **容器就是消息窗口的正文根**:这个窗口里只有消息,所以正文只有这一个孩子,
 * 也没有"窗口里一个会滚的盒子"--滑条落在窗口边上,就是窗口自己的那条.
 * 框体因此不要(`modifier: 'message-area--unframed'`):窗口外壳那圈描边就是它的框,
 * 再套一层就是两层边框 + 一圈白给的内边距(理由与下游诊断窗口同一条).
 *
 * 挂 `ui-scrollbar` 是**消费方的一笔决定**:滚动条外观是单独的一条规定
 * (`styles/scrollbar.css`),消息区与它互不认识 -- 不挂也能滚,只是用系统滚动条.
 * `message-pane` 是示例自己的类:无框之后容器不带内边距,那一圈由示例补上
 * (与其余窗口的 `.pane` 同一口径,见 `example.css`).
 */
const messageArea = createMessageArea({
    modifier: 'message-area--unframed',
    class: 'ui-scrollbar message-pane',
});

/**
 * 提示清单是**派生值**:`computed` 里读到的每个 signal 都是依赖,任一变化就重算,
 * 所以"参数变了要更新提示"不需要任何手工同步.
 *
 * 落 DOM 走 `render()` 而不是 `clear()` + 逐条 `add()`:前者在内容一致时**一次
 * DOM 操作都不做** -- 拖滑块时同一批提示不会被每帧重放(容器带 `aria-live`,
 * 重放等于读屏一直念同一句话).
 */
const messages = computed(collectMessages);
watchValue(messages, (entries) => messageArea.list.render(entries));

// ── 窗口清单:只换 `windows`,其余照用库的默认值 ──────────────────────────
const WINDOWS: readonly WindowConfigEntry[] = [
    {
        id: 'slider',
        title: '控件window',
        dock: { label: '控件dock' },
        defaultGeometry: {
            x: { at: 16 },
            y: { at: 16 },
            w: { at: 420 },
            h: { at: 248 },
        },
        minSize: { w: 260, h: 180 },
    },
    {
        id: 'number',
        title: '读数window',
        dock: { label: '读数dock' },
        defaultGeometry: {
            x: { at: 16 },
            // `after` 给了之后 `y` 被忽略,但字段仍需存在(几何块的形状如此).
            y: { at: 16 },
            w: { at: 420 },
            // 五条读数(线性 / 方位角 / 方位角公式 / 计数 / 菜单选择)一行不落:
            // 窗口正文是 `overflow:hidden`,高度不够时多出来的那条会被**裁掉**
            // (库不默认滚,要滚得显式给滚动区).
            h: { at: 252 },
            after: { id: 'slider', gap: 12 },
        },
        minSize: { w: 260, h: 140 },
    },
    {
        id: 'menu',
        title: '菜单window',
        dock: { label: '菜单dock' },
        defaultGeometry: {
            x: { at: 448 },
            y: { at: 16 },
            w: { at: 380 },
            // 容得下"浮层 + 直接显示"两张分组菜单(正文会裁切).
            h: { at: 400 },
        },
        minSize: { w: 280, h: 300 },
    },
    {
        id: 'messages',
        title: '消息window',
        dock: { label: '消息dock' },
        defaultGeometry: {
            // 与菜单窗口同一列,接在它下面.
            x: { at: 448 },
            y: { at: 16 },
            w: { at: 380 },
            // 高度锚在**桌面底边**:消息区吃掉这一列剩下的高度,提示多了自己滚,
            // 所以换一个屏高不用改这个数(见 `RelativeGeometry` 的 `from: 'bottom'`).
            h: { from: 'bottom', inset: 16 },
            after: { id: 'menu', gap: 12 },
        },
        minSize: { w: 280, h: 140 },
    },
];

const CONFIG: DesktopConfig = { ...DEFAULT_DESKTOP_CONFIG, windows: WINDOWS };

mountDesktop(root, {
    ...CONFIG,
    // `content` 是一个函数(库按窗口 id 逐个调用,正文节点是**搬进去**而不是
    // 重建的),函数体里用什么写法都行:`switch` / `if` / 一张 id -> 内容 的表.
    content: (id) => {
        switch (id) {
            case 'slider':
                return {
                    body: [create_element(
                        { tag: 'div' },
                        { class: 'pane' },
                        linearSlider.element,
                        angleSlider.element,
                        countButton.element,
                    )],
                };
            case 'number':
                return {
                    body: [create_element(
                        { tag: 'div' },
                        { class: 'pane' },
                        linearReadout,
                        angleReadout,
                        angleFormulaReadout,
                        countReadout,
                        menuReadout,
                    )],
                };
            case 'menu':
                return { body: [menuPane] };
            case 'messages':
                return { body: [messageArea.element] };
            default:
                return { body: [] };
        }
    },
});
