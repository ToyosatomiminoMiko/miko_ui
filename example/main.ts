/**
 * `miko_ui` 的最小示例.
 *
 * 整个页面只做一件事:两个窗口,一个放滑块,一个放数字;拖滑块,数字跟着变.
 *
 * 数据只有一份(`value` 这个 signal):滑块写它,数字读它.两个窗口之间没有
 * 任何直接连线,也不需要有.
 *
 * 页面不 import 本目录以外的任何应用代码:窗口层 / 吸附预览 / Dock / 每个
 * 窗口的外壳都由 `mountDesktop()` 按配置建出来.
 */
import {
    DEFAULT_DESKTOP_CONFIG,
    createSlider,
    el,
    mountDesktop,
    signal,
    watchValue,
    type DesktopConfig,
    type WindowConfigEntry,
} from 'miko_ui';
// 库自带的样式:token + 控件 + 桌面窗口系统.示例只补页面级规则.
import 'miko_ui/styles.css';
import './example.css';

const root = document.getElementById('app');
if (!root) throw new Error('example/index.html 缺少 #app');

// ── 状态:两个窗口共享的唯一真相 ──────────────────────────────────────────
// 取值范围写成一份:滑块与数字的显示口径才不会各说各话.
const RANGE = { min: 0, max: 100, step: 1 } as const;
const value = signal(50);

// ── 窗口一:滑块(唯一的输入)──────────────────────────────────────────────
const slider = createSlider({
    value,
    min: RANGE.min,
    max: RANGE.max,
    step: RANGE.step,
    ariaLabel: '数值',
});

// ── 窗口二:数字(只读显示,订阅同一个 signal)────────────────────────────
// `watchValue` 订阅时立刻回调一次,所以初值不用在这里再写一遍.
const readout = el('output', { class: 'readout' });
watchValue(value, (next) => {
    readout.textContent = String(next);
});

// ── 窗口清单:只换 `windows`,其余照用库的默认值 ──────────────────────────
const WINDOWS: readonly WindowConfigEntry[] = [
    {
        id: 'slider',
        title: '滑块',
        dock: { label: '滑块' },
        defaultGeometry: {
            x: { at: 16 },
            y: { at: 16 },
            w: { at: 380 },
            h: { at: 104 },
        },
        minSize: { w: 240, h: 80 },
    },
    {
        id: 'number',
        title: '数字',
        dock: { label: '数字' },
        defaultGeometry: {
            x: { at: 16 },
            // `after` 给了之后 `y` 被忽略,但字段仍需存在(几何块的形状如此).
            y: { at: 16 },
            w: { at: 380 },
            h: { at: 104 },
            after: { id: 'slider', gap: 12 },
        },
        minSize: { w: 240, h: 80 },
    },
];

const CONFIG: DesktopConfig = { ...DEFAULT_DESKTOP_CONFIG, windows: WINDOWS };

mountDesktop(root, {
    ...CONFIG,
    content: (id) => {
        if (id === 'slider') return { body: [el('div', { class: 'pane' }, slider.element)] };
        if (id === 'number') return { body: [el('div', { class: 'pane' }, readout)] };
        return { body: [] };
    },
});
