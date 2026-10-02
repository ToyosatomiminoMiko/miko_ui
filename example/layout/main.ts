/**
 * 窗口正文排布演示:`example/layout/` 专用.库的 `src/` 与 `styles/` 一个字没改.
 *
 * 它做两件事:
 *
 *   1. 把"窗口正文里怎么排"的几种写法摆出来 -- 唯一子节点 / 固定条 + 滚动主体 +
 *      底栏 / 两个普通块 / 两个 `.ui-fill`,外观全部来自库的窗口外壳;
 *   2. 顶上给三档口径与一条窗口高度滑杆,当场看见现状哪里不对,方案改了哪一半.
 *
 * 三档口径 = 两份**原型样式表**的 disabled 开关:
 *
 *   current -- 两份都关:库今天的口径(`styles/desktop.css` 的 `.window-body > *`);
 *   phase3  -- 只开 `phase3.css`:三条显式拉伸出口 + `.ui-scroll-area` 的 overflow;
 *   phase4  -- 两份都开:再加"默认不拉伸".
 *
 * 两份原型表必须**排在库的样式之后**才赢得下同特异度的比较,所以它们的 <link> 在这里
 * 动态 append(理由见 `addProtoSheet`),不写在 index.html 里.
 *
 * 每张卡片下面那行小标签是**现场量出来的**(getBoundingClientRect / scrollHeight 与
 * 声明的内容高对比),不是写死的文案:拖高度滑杆时它跟着变.这样"现状有什么问题"是
 * 可复现的观察,不是说法.
 */
import { createButton, createRangeInput, createSegmented, create_element } from 'miko_ui';
import 'miko_ui/styles.css';
import './demo.css';

type Mode = 'current' | 'phase3' | 'phase4';

const MODE_ITEMS: readonly { readonly value: Mode; readonly label: string }[] = [
    { value: 'current', label: '现状' },
    { value: 'phase3', label: 'Phase 3:只加显式出口' },
    { value: 'phase4', label: 'Phase 4:默认不拉伸' },
];

const MODE_NAMES: Readonly<Record<Mode, string>> = {
    current: '现状(库今天的口径)',
    phase3: 'Phase 3(只加显式出口)',
    phase4: 'Phase 4(默认不拉伸)',
};

/** 页面上的挂载点:缺了就直接报错(演示页自己写死的结构). */
function mustElement(id: string): HTMLElement {
    const element = document.getElementById(id);
    if (element === null) throw new Error(`example/layout/index.html 缺少 #${id}`);
    return element;
}

const cardsHost = mustElement('cards');
const controlsHost = mustElement('controls');

// ---------------------------------------------------------------------------
// 原型样式表的开关
// ---------------------------------------------------------------------------

/**
 * 追加一份**原型**样式表(默认关).
 *
 * 为什么不在 index.html 里写 <link>:Vite 把 `import 'miko_ui/styles.css'` 变成注入到
 * `<head>` 末尾的 `<style>`;写在 HTML 里的 <link> 会排在它前面,而 phase4.css 的默认
 * 规则与库的 `.window-body > *` 同特异度 (0,1,0) -- 谁后加载谁赢.`document.head.append`
 * 就稳定排在库的样式之后(方案文档 4.2 讲的就是这条机制).
 */
function addProtoSheet(file: string): HTMLLinkElement {
    const link = create_element({ tag: 'link' });
    link.rel = 'stylesheet';
    link.href = `./${file}`;
    link.disabled = true;
    link.addEventListener('load', scheduleRefresh);
    document.head.append(link);
    return link;
}

/** 先"默认不拉伸"(phase4),后"显式出口"(phase3) -- 与方案文档里的书写同序. */
const sheetPhase4 = addProtoSheet('phase4.css');
const sheetPhase3 = addProtoSheet('phase3.css');

const ENABLED_SHEETS: Readonly<Record<Mode, readonly HTMLLinkElement[]>> = {
    current: [],
    phase3: [sheetPhase3],
    phase4: [sheetPhase4, sheetPhase3],
};

let mode: Mode = 'current';

// ---------------------------------------------------------------------------
// 卡片定义
// ---------------------------------------------------------------------------

/**
 * 一块演示内容.
 *
 * `want` 是"这块内容想要多高"(px);`null` = 不声明,由内容或出口规则决定.
 * 有了它,"被压扁 / 被拉高"才是量出来的,不是目测的.
 */
interface BlockSpec {
    /** 图例名,进实测标签("工具条: ..."). */
    readonly label: string;
    readonly text: string;
    /** 加在 `.demo-block` 后面的类(`ui-fill` / `ui-scroll-area` 就是在这里生效的). */
    readonly classes: string;
    readonly want: number | null;
    /** 内部塞 N 行长内容,用来判断"该不该滚,滚不滚得了". */
    readonly rows?: number;
    /** 这块本来就是"吃掉剩余"的:被拉高/分到多少都不算问题. */
    readonly growOk?: boolean;
    /** 期望它铺满正文(唯一子节点那个回归项). */
    readonly fill?: boolean;
}

interface CardSpec {
    readonly title: string;
    readonly lead: string;
    readonly blocks: readonly BlockSpec[];
    /** 三档口径下各自该怎么读这张卡(白话). */
    readonly notes: Readonly<Record<Mode, string>>;
}

const CARDS: readonly CardSpec[] = [
    {
        title: '① 唯一子节点(编辑器 / 画布)',
        lead: '正文里只放一个东西:它应该铺满正文.这是回归项 -- 三种口径在这里必须一模一样.',
        blocks: [
            { label: '唯一子节点', text: '铺满正文(不声明高度)', classes: 'demo-editor', want: null, fill: true },
        ],
        notes: {
            current: '靠 `.window-body > *` 的 `flex: 1 1 auto` 拉满正文.',
            phase3: '没动它,一样拉满.',
            phase4: '换成 `:only-child { flex: 1 1 0 }`,一样拉满 -- 没有回归.',
        },
    },
    {
        title: '② 工具条 + 主体 + 底栏(最常写的三明治)',
        lead: '上面一条工具条,下面一条状态栏,中间那块吃掉剩余并滚动.这条三明治现在写不出来.',
        blocks: [
            { label: '工具条', text: '内容 40px', classes: 'demo-bar', want: 40 },
            { label: '主体', text: '12 行内容,本该在这里滚', classes: 'ui-scroll-area demo-main', want: null, rows: 12 },
            { label: '底栏', text: '内容 40px', classes: 'demo-bar', want: 40 },
        ],
        notes: {
            current: '三块一起按内容比例分正文 -- 工具条,底栏被压扁(文字看不见),主体也不滚(后面几行够不到).',
            phase3: '主体会滚了.但工具条,底栏仍然拿到 `flex-grow: 1`,所以它们是**被拉高**,不是定住.',
            phase4: '工具条,底栏按内容高定住,主体吃掉剩余并滚动.窗口再矮下去底栏会被**裁掉** -- 这就是"默认不拉伸"的代价.',
        },
    },
    {
        title: '③ 放两个普通块(没人声明过怎么分)',
        lead: '两块各写 `height: 120px`,谁也没说过要压缩或拉伸.',
        blocks: [
            { label: '上块', text: '内容 120px', classes: 'demo-plain', want: 120 },
            { label: '下块', text: '内容 120px', classes: 'demo-plain', want: 120 },
        ],
        notes: {
            current: '两块被等比压进正文(120 -> 大约正文的一半)-- 这条压缩谁也没声明过.',
            phase3: '仍然压(这一档没动默认值,它只加"显式出口").',
            phase4: '各自保持 120px.总高 240 > 正文时,下块被 `overflow: hidden` 裁掉 -- 想看见它就得把一块换成 `.ui-scroll-area`.',
        },
    },
    {
        title: '④ 两个 `.ui-fill`(谁吃剩余)',
        lead: '两块都声明"我吃剩余".现状按内容比例分,方案均分 -- 这是方案的决定 D6.',
        blocks: [
            { label: 'fill A', text: '内容 40px', classes: 'ui-fill demo-fill', want: 40, growOk: true },
            { label: 'fill B', text: '内容 200px', classes: 'ui-fill demo-fill', want: 200, growOk: true },
        ],
        notes: {
            current: '没有 `.ui-fill` 这个类,两块按内容 40 : 200 分正文.',
            phase3: '`.ui-fill` 出口生效(特异度 0,2,0),两块**均分**剩余.',
            phase4: '一样均分 -- 出口的特异度比默认值高,不受它影响.',
        },
    },
];

// ---------------------------------------------------------------------------
// 建卡片
// ---------------------------------------------------------------------------

function buildBlock(spec: BlockSpec): HTMLElement {
    const block = create_element(
        { tag: 'div' },
        { class: `demo-block ${spec.classes}`.trim() },
        create_element({ tag: 'b' }, {}, spec.label),
        create_element({ tag: 'small' }, {}, spec.text),
    );
    block.dataset.label = spec.label;
    block.dataset.want = spec.want === null ? '' : String(spec.want);
    if (spec.want !== null) block.style.height = `${spec.want}px`;
    if (spec.rows !== undefined) {
        block.dataset.rows = String(spec.rows);
        const inner = create_element({ tag: 'div' }, { class: 'demo-inner' });
        for (let index = 1; index <= spec.rows; index += 1) {
            inner.append(create_element({ tag: 'div' }, { class: 'demo-row' }, `第 ${index} 行(内容)`));
        }
        block.append(inner);
    }
    if (spec.growOk === true) block.dataset.growOk = '1';
    if (spec.fill === true) block.dataset.fill = '1';
    return block;
}

interface CardRuntime {
    readonly spec: CardSpec;
    readonly body: HTMLElement;
    readonly chips: HTMLElement;
    readonly note: HTMLElement;
}

const runtimes: CardRuntime[] = [];

function buildCard(spec: CardSpec): void {
    const shell = create_element({ tag: 'section' }, { class: 'window demo-window' });
    const header = create_element(
        { tag: 'header' },
        { class: 'ui-panel-header window-header' },
        create_element({ tag: 'span' }, { class: 'ui-panel-title' }, spec.title),
    );
    const body = create_element(
        { tag: 'div' },
        { class: 'ui-panel-body window-body' },
        ...spec.blocks.map(buildBlock),
    );
    shell.append(header, body);

    const chips = create_element({ tag: 'div' }, { class: 'chips' });
    const note = create_element({ tag: 'p' }, { class: 'card__note' });
    const card = create_element(
        { tag: 'article' },
        { class: 'card' },
        create_element({ tag: 'p' }, { class: 'card__lead' }, spec.lead),
        shell,
        chips,
        note,
    );
    cardsHost.append(card);
    runtimes.push({ spec, body, chips, note });
}

// ---------------------------------------------------------------------------
// 实测:每个直接子节点的实际高 vs 它声明的内容高
// ---------------------------------------------------------------------------

function round(value: number): number {
    return Math.round(value * 10) / 10;
}

function chip(text: string, kind: 'ok' | 'bad' | 'info'): HTMLElement {
    return create_element({ tag: 'span' }, { class: `chip chip--${kind}` }, text);
}

function measureCard(runtime: CardRuntime): void {
    const bodyRect = runtime.body.getBoundingClientRect();
    const parts: HTMLElement[] = [chip(`正文 ${round(bodyRect.height)}px`, 'info')];

    for (const node of Array.from(runtime.body.children)) {
        const block = node as HTMLElement;
        const rect = block.getBoundingClientRect();
        const label = block.dataset.label ?? '块';
        const want = block.dataset.want === undefined || block.dataset.want === '' ? null : Number(block.dataset.want);
        const facts: string[] = [];
        let bad = false;
        // `scrollHeight` 在 `overflow: visible` 上也会把溢出内容算进去,所以"能不能滚"
        // 必须再看 computed 的 overflow-y:只有 auto/scroll 才是真的滚得动.
        const clipped = rect.bottom > bodyRect.bottom + 0.5;

        if (block.dataset.fill === '1') {
            // 唯一子节点:唯一要问的是"铺满了吗".
            if (Math.abs(rect.height - bodyRect.height) < 1) {
                facts.push('铺满正文 ✓');
            } else {
                facts.push(`没铺满(正文 ${round(bodyRect.height)}px)`);
                bad = true;
            }
        } else if (block.dataset.growOk === '1') {
            // "吃剩余"那块:分到多少都是设计意图,只报数.
            facts.push(`分到 ${round(rect.height)}px`);
        } else if (want !== null) {
            if (rect.height < want - 0.5) {
                facts.push(`被压扁 ${want}px -> ${round(rect.height)}px`);
                bad = true;
            } else if (rect.height > want + 0.5) {
                facts.push(`被拉高 ${want}px -> ${round(rect.height)}px`);
                bad = true;
            } else {
                facts.push(`高度 ${round(rect.height)}px`);
            }
        } else {
            facts.push(`高度 ${round(rect.height)}px`);
        }

        if (block.dataset.rows !== undefined) {
            const inner = block.querySelector('.demo-inner');
            const contentHeight = inner === null ? block.scrollHeight : inner.getBoundingClientRect().height;
            const overflowY = getComputedStyle(block).overflowY;
            const canScroll = (overflowY === 'auto' || overflowY === 'scroll')
                && block.scrollHeight > block.clientHeight + 1;
            if (contentHeight > block.clientHeight + 1) {
                facts.push(canScroll
                    ? `可滚 ✓(内容 ${round(contentHeight)}px)`
                    : `不可滚 ✗(内容 ${round(contentHeight)}px,超出的够不到)`);
                if (!canScroll) bad = true;
            } else {
                facts.push(`不用滚(内容 ${round(contentHeight)}px)`);
            }
        }

        if (clipped) {
            facts.push('超出正文底边(被裁)');
            bad = true;
        }

        parts.push(chip(`${label}: ${facts.join(' · ')}`, bad ? 'bad' : 'ok'));
    }

    runtime.chips.replaceChildren(...parts);
    runtime.note.textContent = `[${MODE_NAMES[mode]}]${runtime.spec.notes[mode]}`;
}

// ---------------------------------------------------------------------------
// 刷新(合并到一帧)
// ---------------------------------------------------------------------------

let pendingFrame = 0;

function refresh(): void {
    for (const runtime of runtimes) measureCard(runtime);
    const first = runtimes[0];
    if (first !== undefined) {
        const bodyHeight = round(first.body.getBoundingClientRect().height);
        heightValue.textContent = `窗口 ${windowHeight}px -> 正文 ${bodyHeight}px`;
    }
}

function scheduleRefresh(): void {
    if (pendingFrame !== 0) return;
    pendingFrame = requestAnimationFrame(() => {
        pendingFrame = 0;
        refresh();
    });
}

// ---------------------------------------------------------------------------
// 控制条
// ---------------------------------------------------------------------------

const initialParams = new URLSearchParams(window.location.search);
const initialMode = MODE_ITEMS.find((item) => item.value === initialParams.get('mode'))?.value ?? 'current';
const initialHeight = Number(initialParams.get('h') ?? '263');

let windowHeight = Number.isFinite(initialHeight) ? initialHeight : 263;

const modeControl = createSegmented<Mode>({
    columns: 3,
    ariaLabel: '布局口径',
    value: initialMode,
    items: MODE_ITEMS,
});

function setMode(next: Mode): void {
    mode = next;
    const enabled = ENABLED_SHEETS[next];
    for (const sheet of [sheetPhase4, sheetPhase3]) sheet.disabled = !enabled.includes(sheet);
    scheduleRefresh();
}

modeControl.onChange(setMode);

const heightControl = createRangeInput({
    value: windowHeight,
    // 下限 90:再矮下去(正文约 50px)就能看见 Phase 4 的代价 -- 固定条自己不让位,
    // 底栏被 `overflow: hidden` 裁掉,而不是被压扁.
    min: 90,
    max: 420,
    step: 1,
    ariaLabel: '窗口高度',
});

const heightValue = create_element({ tag: 'span' }, { class: 'ctl__value' });

function applyHeight(next: number): void {
    windowHeight = next;
    document.documentElement.style.setProperty('--demo-window-h', `${next}px`);
    scheduleRefresh();
}

heightControl.onInput(applyHeight);

function presetButton(text: string, value: number): HTMLElement {
    const button = createButton({ text, class: 'layout-preset' });
    button.onClick(() => {
        heightControl.set(value);
        applyHeight(value);
    });
    return button.element;
}

controlsHost.append(
    create_element(
        { tag: 'div' },
        { class: 'ctl' },
        create_element({ tag: 'span' }, { class: 'ctl__name' }, '口径'),
        modeControl.element,
    ),
    create_element(
        { tag: 'div' },
        { class: 'ctl' },
        create_element({ tag: 'span' }, { class: 'ctl__name' }, '窗口高度'),
        heightControl.element,
        heightValue,
    ),
    create_element(
        { tag: 'div' },
        { class: 'ctl' },
        create_element({ tag: 'span' }, { class: 'ctl__name' }, '快捷键'),
        presetButton('压到 100px', 100),
        presetButton('压到 160px', 160),
        presetButton('回到 263px', 263),
    ),
);

// ---------------------------------------------------------------------------
// 起
// ---------------------------------------------------------------------------

for (const spec of CARDS) buildCard(spec);
setMode(initialMode);
applyHeight(windowHeight);
window.addEventListener('resize', scheduleRefresh);
scheduleRefresh();
