/**
 * 窗口正文排布演示:`example/layout/` 专用.库的 `src/` 与 `styles/` 一个字没改.
 *
 * 五张卡片 = `miko_graphcalc` / `miko_ui` 示例里**真实存在**的五种窗口正文
 * (每张卡片写着出处).顶上一档开关在两种写法之间切:
 *
 *   现状(`now.css`)  -- 照抄 graphcalc / 示例今天自己写的那几条 CSS;
 *   方案(`proto.css`) -- 换成方案里的两个原语 `createStack` / `createScrollArea`.
 *
 * 两份样式表都是**原型**,默认 disabled,由开关打开;它们必须排在库的样式之后
 * (理由见 `addProtoSheet`).每张卡片下面那排数字是现场量的:
 * 正文高 / 内容高 vs 可见高 / 滚不滚得动 / 行有没有被压 / 越界有没有被裁.
 *
 * 这张页面对应方案文档 `docs/value-text-window-layout-plan.md` 的 4.2 / 4.3 / 4.4,
 * 但它**不**演示"工具条 + 主体 + 底栏"--那种布局两家消费者都没有,是初稿凭空造的.
 */
import { createButton, createRangeInput, createSegmented, create_element, type Child } from 'miko_ui';
import 'miko_ui/styles.css';
import './demo.css';

type Mode = 'now' | 'next';

const MODE_ITEMS: readonly { readonly value: Mode; readonly label: string }[] = [
    { value: 'now', label: '现状(照抄今天的写法)' },
    { value: 'next', label: '方案(createStack + createScrollArea)' },
];

// ---------------------------------------------------------------------------
// 一,两份原型样式表的开关
// ---------------------------------------------------------------------------

/**
 * 追加一份原型样式表(默认关).
 *
 * 为什么不在 index.html 里写 <link>:Vite 把 `import 'miko_ui/styles.css'` 变成注入到
 * `<head>` 末尾的 `<style>`;写在 HTML 里的 <link> 会排在它前面,而 proto.css 的默认
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

const sheetNow = addProtoSheet('now.css');
const sheetNext = addProtoSheet('proto.css');

let mode: Mode = 'now';

// ---------------------------------------------------------------------------
// 二,建节点的小工具
// ---------------------------------------------------------------------------

function box(className: string, ...children: Child[]): HTMLDivElement {
    return create_element({ tag: 'div' }, { class: className }, ...children);
}

/**
 * 一个"东西":真实布局里每一行/每一项都有固定高度.
 *
 * 用 `min-height` 而不是 `height`:真实的行是"内容撑高 + 不该被压扁"的那种
 * (容器该滚,而不是行该缩).`data-want` 记下声明高度,测量时拿它对比.
 */
function item(label: string, want: number, className = 'demo-item'): HTMLDivElement {
    const node = box(className, create_element({ tag: 'b' }, {}, label));
    node.dataset.want = String(want);
    node.style.minHeight = `${want}px`;
    return node;
}

/** 滚动容器:标记 `data-rows`,测量时靠它算"内容高 vs 可见高". */
function scroller(className: string, ...children: Child[]): HTMLDivElement {
    const node = box(className, ...children);
    node.dataset.rows = '1';
    return node;
}

/** 代码框里的行(内容比正文高,用来演示滚动). */
function codeLines(count: number): HTMLDivElement {
    const lines = Array.from({ length: count }, (_, index) => {
        const body = index % 3 === 0 ? 'let f(x) = sin(x)' : index % 3 === 1 ? '  + 0.5 * cos(x)' : '  - 2';
        return create_element({ tag: 'div' }, { class: 'demo-code-line' }, `${String(index + 1).padStart(2, '0')}  ${body}`);
    });
    return box('demo-code-lines', ...lines);
}

/** 实体/求值列表的条目. */
function objectItems(count: number): HTMLElement[] {
    return Array.from({ length: count }, (_, index) =>
        item(`实体 ${index + 1} · 球体 r=${(1 + index * 0.25).toFixed(2)}`, 34));
}

/** 滑杆参数行(高度固定). */
function paramRows(count: number): HTMLElement[] {
    return Array.from({ length: count }, (_, index) => item(`参数 ${String.fromCharCode(97 + index)} - 滑杆 + 数值框`, 34));
}

/**
 * 库已有的分组件 `createControlGroup`:`section.control-group > header.control-title + 行`.
 * 分组这一半库早就有了,不用再造 -- 缺的只是外面那个"堆叠 + 滚"的容器.
 */
function controlGroup(title: string): HTMLElement {
    return box(
        'control-group',
        create_element({ tag: 'header' }, { class: 'control-title' }, title),
        item('滑杆行(定高)', 30),
        item('滑杆行(定高)', 30),
        item('开关行(定高)', 26),
    );
}

/** 示例的读数行:名字在左,值贴右. */
function readoutRow(name: string, value: string): HTMLDivElement {
    const node = box(
        'demo-readout',
        create_element({ tag: 'span' }, {}, name),
        create_element({ tag: 'b' }, {}, value),
    );
    node.dataset.want = '24';
    node.style.minHeight = '24px';
    return node;
}

// ---------------------------------------------------------------------------
// 三,五张卡片(结构照抄出处)
// ---------------------------------------------------------------------------

interface CardSpec {
    readonly title: string;
    /** 出处:每张卡片都不是编的. */
    readonly source: string;
    /** 白话一句. */
    readonly lead: string;
    /** 返回正文的子节点.用 `Node | string` 而不是 `Child`:`replaceChildren` 不收假值. */
    readonly buildNow: () => (Node | string)[];
    readonly buildNext: () => (Node | string)[];
    /** 现状要写什么(消费者侧). */
    readonly nowWrites: string;
    /** 方案要写什么. */
    readonly nextWrites: string;
}

const CARDS: readonly CardSpec[] = [
    {
        title: '① 代码框(graphcalc「源码」窗口)',
        source: 'miko_graphcalc src/app/appViews.ts:73-92 · css/panels.css:22-27',
        lead: '正文里只有一个东西:编辑器.它自己滚,外壳只负责把它铺满 -- 两个原语都没它的事.',
        nowWrites: '.panel{flex column + min-height:0} + #editor-panel 再包一层 + textarea 手挂 .ui-scrollbar',
        nextWrites: '什么都不用改:唯一子节点由 :only-child 铺满(这是契约,不是新代码)',
        buildNow: () => [
            box('now-panel', scroller('now-editor ui-scrollbar demo-code', codeLines(18))),
        ],
        buildNext: () => [
            scroller('ui-scroll-area ui-scrollbar demo-code', codeLines(18)),
        ],
    },
    {
        title: '② 实体 / 求值列表(graphcalc)',
        source: 'src/app/appViews.ts:158-169,173-195 · css/panels.css:78-94,112-144',
        lead: '窗口里就一张列表:今天要四层包裹,最里层自己滚.',
        nowWrites: '4 层包裹(4 条规则)+ 最里层 5 条 + 手挂 .ui-scrollbar',
        nextWrites: 'createScrollArea({ child: createStack({ children: 条目 }) })',
        buildNow: () => [
            box('now-object-panel-column', box('now-object-panel', box('now-object-list-column',
                scroller('now-object-list-body ui-scrollbar', ...objectItems(12))))),
        ],
        buildNext: () => [
            scroller('ui-scroll-area ui-scrollbar', box('ui-stack', ...objectItems(12))),
        ],
    },
    {
        title: '③ 参数窗口(graphcalc)',
        source: 'src/app/appViews.ts:104-114 · css/panels.css:51-59 · uiConfig.ts:162-167',
        lead: '整块滑动,每行(滑杆行)高度固定;窗口拖太矮时先压到 120px 再自己滚.',
        nowWrites: '#params-panel 6 条 + --params-panel-min-height 令牌(UI_CONFIG -> applyUiConfig -> :root)+ 手挂 .ui-scrollbar',
        nextWrites: 'createScrollArea({ minHeight: "120px", child: createStack({ gap: "10px", children: 行 }) })',
        buildNow: () => [
            box('now-right-page', scroller('now-params-panel ui-scrollbar', ...paramRows(8))),
        ],
        buildNext: () => {
            // 对应 createScrollArea({ minHeight: '120px', child: createStack({ gap: '10px', children: 行 }) }):
            // 下限从 :root 令牌变成原语的一个参数.
            const area = scroller('ui-scroll-area ui-scrollbar', box('ui-stack', ...paramRows(8)));
            area.style.minHeight = '120px';
            return [area];
        },
    },
    {
        title: '④ 视图设置(graphcalc,「又多又杂」的那种)',
        source: 'src/app/appViews.ts:215-218 · css/panels.css:38-46 · src/ui/view/ViewPanel.ts:171/236/262',
        lead: '一大堆分组和行,按顺序往下摞,超出就滚.今天是一个元素同时干"滚动区 + 堆叠容器"两件事.',
        nowWrites: '#view-controls 8 条(既是滚动区又是堆叠)+ --view-controls-min-height 令牌 + 手挂 .ui-scrollbar;分组用库的 createControlGroup',
        nextWrites: 'createScrollArea({ minHeight: "120px", child: createStack({ children: [组1, 组2, 组3] }) }) -- 两件事分开',
        buildNow: () => [
            scroller('now-view-controls ui-scrollbar', controlGroup('点'), controlGroup('轴'), controlGroup('曲面')),
        ],
        buildNext: () => {
            // graphcalc 的视图设置本来就有 --view-controls-min-height:120px,
            // 方案里它变成 createScrollArea 的一个参数.
            const area = scroller('ui-scroll-area ui-scrollbar',
                box('ui-stack', controlGroup('点'), controlGroup('轴'), controlGroup('曲面')));
            area.style.minHeight = '120px';
            return [area];
        },
    },
    {
        title: '⑤ 示例的读数窗口(垂直居中那扇)',
        source: 'miko_ui example/example.css:45-51',
        lead: '示例的读数窗口现在是垂直居中(justify-content: center):既没有"从上往下摞"的出口,也没有滚动出口 -- 窗口一矮,后面的读数就够不到.',
        nowWrites: '.pane{display:flex;flex-direction:column;justify-content:center;gap:12px;padding:10px 16px}(没有滚动出口)',
        nextWrites: 'createScrollArea({ child: createStack({ gap: "12px", padding: "10px 16px" }) })',
        buildNow: () => [
            box('now-pane',
                readoutRow('线性数值', '50'),
                readoutRow('方位角', '0.600'),
                readoutRow('计数', '7'),
                readoutRow('菜单选择', '未选')),
        ],
        buildNext: () => {
            const stack = box('ui-stack',
                readoutRow('线性数值', '50'),
                readoutRow('方位角', '0.600'),
                readoutRow('计数', '7'),
                readoutRow('菜单选择', '未选'));
            // 对应 createStack({ gap: '12px', padding: '10px 16px' }) -- 方案 4.7 的两个 token.
            stack.style.setProperty('--layout-gap', '12px');
            stack.style.setProperty('--layout-padding', '10px 16px');
            return [scroller('ui-scroll-area', stack)];
        },
    },
];

// ---------------------------------------------------------------------------
// 四,建卡片 + 切换写法
// ---------------------------------------------------------------------------

interface CardRuntime {
    readonly spec: CardSpec;
    readonly body: HTMLElement;
    readonly chips: HTMLElement;
    readonly writesNow: HTMLElement;
    readonly writesNext: HTMLElement;
}

const runtimes: CardRuntime[] = [];

function mustElement(id: string): HTMLElement {
    const element = document.getElementById(id);
    if (element === null) throw new Error(`example/layout/index.html 缺少 #${id}`);
    return element;
}

const cardsHost = mustElement('cards');
const controlsHost = mustElement('controls');

/** 按当前档位重建窗口正文(现状 / 方案用的是两套真实结构). */
function renderBodies(): void {
    for (const runtime of runtimes) {
        const children = mode === 'now' ? runtime.spec.buildNow() : runtime.spec.buildNext();
        runtime.body.replaceChildren(...children);
        runtime.writesNow.classList.toggle('is-active', mode === 'now');
        runtime.writesNext.classList.toggle('is-active', mode === 'next');
    }
}

function writesLine(label: string, text: string, kind: Mode): HTMLElement {
    return create_element(
        { tag: 'p' },
        { class: `writes writes--${kind}` },
        create_element({ tag: 'b' }, {}, label),
        text,
    );
}

function buildCard(spec: CardSpec): void {
    const shell = create_element({ tag: 'section' }, { class: 'window demo-window' });
    const header = create_element(
        { tag: 'header' },
        { class: 'ui-panel-header window-header' },
        create_element({ tag: 'span' }, { class: 'ui-panel-title' }, spec.title),
    );
    const body = create_element({ tag: 'div' }, { class: 'ui-panel-body window-body' });
    shell.append(header, body);

    const chips = box('chips');
    const writesNow = writesLine('现状要写:', spec.nowWrites, 'now');
    const writesNext = writesLine('方案要写:', spec.nextWrites, 'next');
    const card = create_element(
        { tag: 'article' },
        { class: 'card' },
        create_element({ tag: 'p' }, { class: 'card__lead' }, spec.lead),
        shell,
        chips,
        writesNow,
        writesNext,
        create_element({ tag: 'p' }, { class: 'card__source' }, spec.source),
    );
    cardsHost.append(card);
    runtimes.push({ spec, body, chips, writesNow, writesNext });
}

// ---------------------------------------------------------------------------
// 五,现场测量
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

    // 1) 滚动区:内容高 vs 可见高 + 滚不滚得动.
    //    `scrollHeight` 在 `overflow: visible` 上也会算溢出内容,所以"能不能滚"必须
    //    再看 computed 的 overflow-y -- 只有 auto/scroll 才是真的滚得动.
    const scrollerNode = runtime.body.querySelector<HTMLElement>('[data-rows]');
    if (scrollerNode !== null) {
        const top = scrollerNode.getBoundingClientRect().top;
        let bottom = top;
        for (const kid of Array.from(scrollerNode.children) as HTMLElement[]) {
            bottom = Math.max(bottom, kid.getBoundingClientRect().bottom);
        }
        const contentHeight = bottom - top;
        const overflowY = getComputedStyle(scrollerNode).overflowY;
        const canScroll = overflowY === 'auto' || overflowY === 'scroll';
        if (contentHeight > scrollerNode.clientHeight + 1) {
            parts.push(chip(
                `内容 ${round(contentHeight)}px / 可见 ${round(scrollerNode.clientHeight)}px · ${canScroll ? '可滚 ✓' : '滚不动 ✗'}`,
                canScroll ? 'ok' : 'bad',
            ));
        } else {
            parts.push(chip(`内容 ${round(contentHeight)}px,装得下`, 'ok'));
        }
    }

    // 2) 行高:每一行都声明了固定高度,"被压扁"应该是看得见的事.
    const rows = Array.from(runtime.body.querySelectorAll<HTMLElement>('[data-want]'));
    if (rows.length > 0) {
        const firstBad = rows.find((row) =>
            Math.abs(row.getBoundingClientRect().height - Number(row.dataset.want)) > 0.5);
        const firstWant = rows[0] === undefined ? 0 : Number(rows[0].dataset.want);
        if (firstBad === undefined) {
            parts.push(chip(`行高:${rows.length} 行都是 ${firstWant}px ✓`, 'ok'));
        } else {
            parts.push(chip(
                `行高:有行被压(${Number(firstBad.dataset.want)} -> ${round(firstBad.getBoundingClientRect().height)}px)`,
                'bad',
            ));
        }
    }

    // 3) 第一个内容距正文顶多少 -- ⑤ 的"垂直居中"在这里变成数字.
    const firstChild = runtime.body.firstElementChild;
    if (firstChild !== null) {
        const inner = firstChild.querySelector<HTMLElement>('[data-want]') ?? firstChild;
        const gapTop = round(inner.getBoundingClientRect().top - bodyRect.top);
        parts.push(chip(
            gapTop < -0.5 ? `第一个内容在正文顶上(-${Math.abs(gapTop)}px),被裁 ✗` : `第一个内容距正文顶 ${gapTop}px`,
            gapTop < -0.5 ? 'bad' : 'info',
        ));
    }

    // 4) 越界:正文 overflow:hidden,超出底边的部分会被静默裁掉.
    const lastChild = runtime.body.lastElementChild;
    if (lastChild !== null && lastChild.getBoundingClientRect().bottom > bodyRect.bottom + 0.5) {
        parts.push(chip('超出正文底边,被裁 ✗', 'bad'));
    }

    runtime.chips.replaceChildren(...parts);
}

// ---------------------------------------------------------------------------
// 六,刷新(合并到一帧)
// ---------------------------------------------------------------------------

let pendingFrame = 0;
let windowHeight = 263;

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
// 七,控制条
// ---------------------------------------------------------------------------

const params = new URLSearchParams(window.location.search);
const initialMode = MODE_ITEMS.find((entry) => entry.value === params.get('mode'))?.value ?? 'now';
const parsedHeight = Number(params.get('h') ?? '263');
if (Number.isFinite(parsedHeight)) windowHeight = parsedHeight;

const modeControl = createSegmented<Mode>({
    columns: 2,
    ariaLabel: '写法',
    value: initialMode,
    items: MODE_ITEMS,
});

function setMode(next: Mode): void {
    mode = next;
    sheetNow.disabled = next !== 'now';
    sheetNext.disabled = next !== 'next';
    renderBodies();
    scheduleRefresh();
}

modeControl.onChange(setMode);

const heightControl = createRangeInput({
    value: windowHeight,
    // 下限 90:再矮下去(正文约 50px)会看见"不拉伸"的代价 -- 行不再被压扁,而是被裁.
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
    box('ctl', create_element({ tag: 'span' }, { class: 'ctl__name' }, '写法'), modeControl.element),
    box('ctl',
        create_element({ tag: 'span' }, { class: 'ctl__name' }, '窗口高度'),
        heightControl.element,
        heightValue),
    box('ctl',
        create_element({ tag: 'span' }, { class: 'ctl__name' }, '快捷键'),
        presetButton('压到 100px', 100),
        presetButton('压到 160px', 160),
        presetButton('回到 263px', 263)),
);

// ---------------------------------------------------------------------------
// 八,起
// ---------------------------------------------------------------------------

for (const spec of CARDS) buildCard(spec);
setMode(initialMode);
applyHeight(windowHeight);
window.addEventListener('resize', scheduleRefresh);
scheduleRefresh();
