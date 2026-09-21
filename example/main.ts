/**
 * `@miko/ui` 的最小消费者示例.
 *
 * 约束(也是这份示例存在的意义):这里 import 的每一行都必须来自 `@miko/ui`
 * 或本目录,不许出现主仓库的 `@/...`.库要能被外部消费,靠的是这条约束在
 * **可运行**的代码里成立,而不是靠 `src` 的 grep 断言.
 *
 * 展示的东西:
 * - `mountDesktop()`:一个空容器 + 一张窗口清单 = 一套可拖/可缩/有 Dock 的桌面;
 * - `DEFAULT_DESKTOP_CONFIG` / `DEFAULT_THEME_TOKENS`:库自带的默认值(消费者
 *   一般会换成自己的);
 * - 控件:开关、数字框、分段选择器与行级布局助手;
 * - `content(id)`:逐窗口给标题栏节点与正文节点(节点是搬进去的,身份不变).
 */
import {
    DEFAULT_DESKTOP_CONFIG,
    DEFAULT_THEME_TOKENS,
    applyTheme,
    createButton,
    createControlGroup,
    createNumberField,
    createNumberRow,
    createSegmented,
    createSwitch,
    createSwitchRow,
    el,
    mountDesktop,
} from '@miko/ui';
// 库自带的样式:token + 控件 + 桌面窗口系统;示例只额外给示例内容的样式.
import '@miko/ui/styles.css';
import './example.css';

const root = document.getElementById('app');
if (!root) throw new Error('example/index.html 缺少 #app');

// 主题先于组件实例化(计划附录 C1):控件按最终字体度量自己的输入框.
applyTheme(document.documentElement, DEFAULT_THEME_TOKENS);

// 示例状态:先用最朴素的"读控件值",P3 引入 signal 后这里会换成绑定.
let radius = 0.2;
let visible = true;
let mode: 'size' | 'scale' = 'size';

const radiusField = createNumberField({ value: radius, min: 0, step: 0.05 });
radiusField.onInput((value) => {
    if (value !== null) radius = value;
});
radiusField.onCommit((value) => {
    if (value !== null) radiusField.write(value);
});

const visibleSwitch = createSwitch({ value: visible });
visibleSwitch.onChange((value) => {
    visible = value;
});

const modeSwitch = createSegmented<'size' | 'scale'>({
    columns: 2,
    ariaLabel: '点大小模式',
    value: mode,
    items: [
        { value: 'size', label: '设定大小' },
        { value: 'scale', label: '按比例' },
    ],
});
modeSwitch.onChange((value) => {
    mode = value;
});

/** 回显:不写 DOM diff,只在动作发生时 `textContent =`(见 dom.ts 的文件头). */
const echo = el('p', { class: 'demo-echo', text: '把鼠标放到标题栏上拖一下,或拖动右下角缩放.' });
const runButton = createButton({ text: 'RUN' });
let runs = 0;
runButton.onClick(() => {
    runs += 1;
    echo.textContent = `RUN #${runs} · 半径 ${radius.toFixed(2)} · 可见 ${visible ? '是' : '否'} · 模式 ${mode}`;
});

const mainBody = el('div', { class: 'demo-panel' },
    createControlGroup('点',
        createSwitchRow('可见', visibleSwitch),
        createNumberRow('半径', radiusField).row),
    createControlGroup('模式', modeSwitch.element),
    echo);

const sideBody = el('div', { class: 'demo-panel' },
    el('h1', { class: 'demo-title', text: '@miko/ui' }),
    el('p', {
        class: 'demo-text',
        text: '这个页面只 import 了 @miko/ui 与本目录的样式:窗口、Dock、吸附、控件全部来自库.',
    }),
    el('ul', { class: 'demo-list' },
        el('li', { text: '拖动标题栏移动窗口,双击最大化' }),
        el('li', { text: '拖到左右边缘半屏,拖到顶部最大化' }),
        el('li', { text: '八根手柄缩放,Dock 点一下最小化' })));

const desktop = mountDesktop(root, {
    ...DEFAULT_DESKTOP_CONFIG,
    background: [el('div', { class: 'demo-backdrop', text: '3D 视口位置(示例里只是一个占位块)' })],
    content: (id) => (id === 'main'
        ? { slots: { actions: [runButton.element] }, body: [mainBody] }
        : { body: [sideBody] }),
});

// 开发期卸载入口:演示 dispose 的语义(窗口拆掉,消费者给的正文节点还回 #app).
(window as unknown as { __mikoUiDemo?: unknown }).__mikoUiDemo = desktop;
