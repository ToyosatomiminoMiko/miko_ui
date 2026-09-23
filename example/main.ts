/**
 * `miko_ui` 的最小示例.
 *
 * 两个窗口:一个放两条**系数滑块**(普通参数 + 循环参数)与一个**计数按钮**,
 * 一个放它们的读数.
 *
 * 四件事值得看:
 *
 * 1. **数据只有一份**:每条参数一个 `signal`,滑块写它,读数读它,中间没有
 *    任何"值变了去同步另一个窗口"的手工回路.
 * 2. **循环参数**靠两个选项(都在 `createSlider` 上):
 *    - `cyclic: true` 只管**外观**:名字后显示 `cyclic`,根节点加 `is-cyclic`
 *      高亮 -- 让"这个量在圆周上"看得见,不改变取值;
 *    - `normalize` 管**口径**:越界输入按区间长度回绕到 `[min, max)`.
 *      控件本身不认识圆周,回绕是消费者给的一条纯函数(应用侧那个口径与编译期
 *      共用,所以滑块位置与求值结果永远一致).这里输入 7 会看到 `7 - 2π`.
 * 3. **重置按钮是系数滑块自带的**:`resetValue` 默认取建控件时的值,已经停在
 *    该值上(值与数值框文本都比)时按钮置灰.
 * 4. **跨窗口不需要同步代码**:计数按钮只写 `count.value`,读数窗口订阅同一个
 *    signal;按到 255 之后再按一下回到 0.
 *
 * 页面不 import 本目录以外的任何应用代码:窗口层 / 吸附预览 / Dock / 每个
 * 窗口的外壳都由 `mountDesktop()` 按配置建出来.
 */
import {
    DEFAULT_DESKTOP_CONFIG,
    createButton,
    createSlider,
    create_element,
    mountDesktop,
    signal,
    watchValue,
    type DesktopConfig,
    type Signal,
    type WindowConfigEntry,
} from 'miko_ui';
// 库自带的样式:token + 控件 + 桌面窗口系统.示例只补页面级规则.
import 'miko_ui/styles.css';
import './example.css';

// 获取目标html唯一挂载点,后面的ui全部基于此
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
function createReadout(
    name: string,
    source: Signal<number>,
    format: (value: number) => string,
): HTMLDivElement {
    const output = create_element('output', { class: 'readout' });
    watchValue(source, (next) => {
        output.textContent = format(next);
    });
    return create_element(
        'div',
        { class: 'readout-row' },
        create_element('span', { class: 'readout-name' }, name),
        output,
    );
}

const linearReadout = createReadout('线性数值', linear, (value) => String(value));
const angleReadout = createReadout('方位角', angle, (value) => value.toFixed(3));
const countReadout = createReadout('计数', count, (value) => String(value));

// ── 窗口清单:只换 `windows`,其余照用库的默认值 ──────────────────────────
const WINDOWS: readonly WindowConfigEntry[] = [
    {
        id: 'slider',
        title: '系数滑块',
        dock: { label: '滑块' },
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
        title: '读数',
        dock: { label: '读数' },
        defaultGeometry: {
            x: { at: 16 },
            // `after` 给了之后 `y` 被忽略,但字段仍需存在(几何块的形状如此).
            y: { at: 16 },
            w: { at: 420 },
            h: { at: 160 },
            after: { id: 'slider', gap: 12 },
        },
        minSize: { w: 260, h: 96 },
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
                        'div',
                        { class: 'pane' },
                        linearSlider.element,
                        cyclicSlider.element,
                        countButton.element,
                    )],
                };
            case 'number':
                return {
                    body: [create_element(
                        'div',
                        { class: 'pane' },
                        linearReadout,
                        angleReadout,
                        countReadout,
                    )],
                };
            default:
                return { body: [] };
        }
    },
});
