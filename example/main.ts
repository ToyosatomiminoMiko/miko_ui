/**
 * `miko_ui` 的最小示例.
 *
 * 三个窗口:一个放两条**系数滑块**(普通参数 + 循环参数)与一个**计数按钮**,
 * 一个放它们的读数,一个放**菜单项**(直接显示 + 任意按钮触发).
 *
 * 五件事值得看:
 *
 * 1. **数据只有一份**:每条参数一个 `signal`,滑块写它,读数读它,中间没有
 *    任何"值变了去同步另一个窗口"的手工回路.
 * 2. **循环参数**靠两个选项(都在 `createSlider` 上):
 *    - `cyclic: true` 只管**外观**:名字后显示 `cyclic`,根节点加 `is-cyclic`
 *      高亮 -- 让"这个量在圆周上"看得见,不改变取值;
 *    - `normalize` 管**口径**:越界输入按区间长度回绕到 `[min, max)`.
 *      控件本身不认识圆周,回绕是消费者给的一条纯函数.这里输入 7 会看到 `7 - 2π`.
 * 3. **重置按钮是系数滑块自带的**:`resetValue` 默认取建控件时的值,已经停在
 *    该值上(值与数值框文本都比)时按钮置灰.
 * 4. **跨窗口不需要同步代码**:计数按钮只写 `count.value`,读数窗口订阅同一个
 *    signal;按到 255 之后再按一下回到 0.
 * 5. **菜单的声明与外观 / 交互分家**:`createMenu` 只收数据(`MenuGroup[]`)与一条
 *    `onSelect`:给 `trigger` 就是**任意按钮触发**的浮层,不给就是**直接显示**的
 *    常驻面板;摆树 / 分组 / 当前项 / 点外部关闭全在库里,外观在
 *    `styles/widgets.css`.下游拿它做的窗口标题栏菜单只是"给个 trigger"的一个
 *    调用点,不是它的前提.
 *
 * 页面只依赖 `miko_ui` 与本目录的文件:窗口层 / 吸附预览 / Dock / 每个
 * 窗口的外壳都由 `mountDesktop()` 按配置建出来.
 */
import {
    DEFAULT_DESKTOP_CONFIG,
    createButton,
    createMenu,
    createSlider,
    create_element,
    mountDesktop,
    signal,
    watchValue,
    type DesktopConfig,
    type MenuGroup,
    type Signal,
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

const cyclicSlider = createSlider({
    value: angle,
    ...ANGLE,
    label: '方位角',
    // 名字后挂一枚 `cyclic` 徽章(名字本身不变色),根节点标成循环参数.
    cyclic: true,
    // 输入 7 -> 7 - 2π ≈ 0.717:`normalize` 只挂在数值框上,滑杆不会越界.
    normalize: wrapAngle,
    // 弧度显示到三位小数,免得数值框里一长串.
    format: (value) => value.toFixed(3),
});

// ── 计数按钮:只写 `count`,值显示在另一个窗口 ──────────────────────────
/** 建控件与接线分开:按钮不认识读数窗口,它只改自己这一份状态. */
const countButton = createButton({ text: '计数 +1' });
countButton.onClick(() => {
    count.value = count.value >= 255 ? 0 : count.value + 1;
});

// ── 窗口二:读数(只读显示,订阅各自的 signal)────────────────────────────
/** 一行读数:左边名字,右边值;`watchValue` 订阅时立刻回调一次,初值不用另写. */
function createReadout<T>(
    name: string,
    source: Signal<T>,
    format: (value: T) => string,
): HTMLDivElement {
    const output = create_element({ tag: 'output' }, { class: 'readout' });
    watchValue(source, (next) => {
        output.textContent = format(next);
    });
    return create_element(
        { tag: 'div' },
        { class: 'readout-row' },
        create_element({ tag: 'span' }, { class: 'readout-name' }, name),
        output,
    );
}

const linearReadout = createReadout('线性数值', linear, (value) => String(value));
const angleReadout = createReadout('方位角', angle, (value) => value.toFixed(3));
const countReadout = createReadout('计数', count, (value) => String(value));

// ── 窗口三:菜单(直接显示 + 任意按钮触发)────────────────────────────────
/**
 * 菜单数据:一个分组标题 + 若干"标题 + 注记"项,形状照下游的「示例」菜单.
 * `value` 是选中回调要的载荷(下游放的是文件名,这里就用文案本身).
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
// 也不要求触发按钮长什么样(下游的标题栏按钮只是它的一个调用点).
const menuTrigger = createButton({ text: '打开菜单' });

/**
 * 菜单面板自己会滚动(`.menu-panel` 有 `max-height` + `overflow-y`),但库的
 * 滚动条规定与菜单件**互不认识**(见 `styles/scrollbar.css`):要不要统一滚动条
 * 外观,由消费者在这颗面板上挂 `ui-scrollbar` 决定.下游应用挂在标题栏浮层上,
 * 示例这里两份菜单各挂一次.
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
    { class: 'pane pane-menu' },
    create_element({ tag: 'span' }, { class: 'menu-caption' }, '任意按钮触发(createMenu)'),
    create_element(
        { tag: 'div' },
        { class: 'menu-anchor' },
        menuTrigger.element,
        popoverMenu.panel,
    ),
    create_element({ tag: 'span' }, { class: 'menu-caption' }, '直接显示(role="menu")'),
    staticMenu.panel,
);
// 点浮层外关闭:绑定的根就是这张菜单所在的正文.
popoverMenu.bind(menuPane);

const menuReadout = createReadout<string | null>(
    '菜单选择',
    menuChoice,
    (value) => value ?? '未选',
);

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
            h: { at: 200 },
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
                        cyclicSlider.element,
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
                        countReadout,
                        menuReadout,
                    )],
                };
            case 'menu':
                return { body: [menuPane] };
            default:
                return { body: [] };
        }
    },
});
