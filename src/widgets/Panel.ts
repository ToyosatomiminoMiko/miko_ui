/**
 * 静态面板:应用里"一张卡片"的框体(`.ui-panel`).
 *
 * 它与桌面窗口是**同一个框体**的两种形态:
 *
 * ```text
 *   createPanel()          ->  section.ui-panel > header.ui-panel-header + div.ui-panel-body
 *   createWindowFrame()    ->  同一组基类,再叠 .window / .window-header / .window-body
 *                            + 绝对定位 + 拖动 + 八向缩放手柄
 * ```
 *
 * 也就是"窗口 = 面板 + 几何与拖动".公共外观(底色 / 描边 / 圆角 / 标题栏)只在
 * `styles/widgets.css` 里写一份;窗口的差异(绝对定位,固定标题栏高度,拖动光标,
 * 正文不留内边距)由 `styles/desktop.css` 以 `.window ...` 覆盖.
 *
 * 本件只建结构:不订阅状态,不绑事件,不读全局 `document` -- root 走
 * `create_element` 的既有约定(不传就用调用方所在文档).
 *
 * 返回句柄而不是单个元素:应用要往正文里追加节点,或在建好之后改标题文案
 * (`header` / `title` / `body` 三个引用,不按 id 回头查 DOM).
 */
import { childNodes, create_element, nextWidgetId, type Child } from './dom';

/** 框体基类:面板与窗口共用. */
const PANEL_CLASS = 'ui-panel';
/** 标题栏:横向一行,标题在左,消费方追加的节点接在它后面. */
const PANEL_HEADER_CLASS = 'ui-panel-header';
/** 标题文本:吃掉剩余宽度,超长省略号(与窗口标题同一套排布). */
const PANEL_TITLE_CLASS = 'ui-panel-title';
/** 正文容器:面板唯一带内边距的一层. */
const PANEL_BODY_CLASS = 'ui-panel-body';

export interface PanelOptions {
    /**
     * 标题栏文案.
     *
     * 它同时是面板的可访问名:根节点是 `role="region"` 并用 `aria-labelledby`
     * 指向这段文字,读屏可以按面板跳转.
     */
    readonly title: string;
    /**
     * 追加在 `.ui-panel` 上的类名,给消费方的作用域类用(如 `oled-card` 定宽).
     * 基线在前,它在外.
     */
    readonly class?: string;
    /** 正文节点;顺序即显示顺序.省略 = 空正文(之后往 `handle.body` 里加). */
    readonly body?: readonly Child[];
}

export interface PanelHandle {
    /** 面板根 `section.ui-panel`,插进宿主用这个. */
    readonly element: HTMLElement;
    /** 标题栏 `header.ui-panel-header`. */
    readonly header: HTMLElement;
    /** 标题 `span.ui-panel-title`(改文案用它,不必再查 DOM). */
    readonly title: HTMLElement;
    /** 正文 `div.ui-panel-body`. */
    readonly body: HTMLElement;
}

/**
 * 建一张面板.
 *
 * 结构(与样式表的词汇表一一对应):
 *
 * ```html
 * <section class="ui-panel <可选作用域类>" role="region" aria-labelledby="ui-panel-title-1">
 *   <header class="ui-panel-header">
 *     <span class="ui-panel-title" id="ui-panel-title-1">标题</span>
 *   </header>
 *   <div class="ui-panel-body">正文</div>
 * </section>
 * ```
 */
export function createPanel(options: PanelOptions): PanelHandle {
    const element = create_element({ tag: 'section' }, {
        class: options.class === undefined ? PANEL_CLASS : `${PANEL_CLASS} ${options.class}`,
        role: 'region',
    });

    // 标题 id 由控件自己发(与 `<label for>` / `aria-*` 配对同一条约定),
    // 一个面板只有一个标题.
    const titleId = nextWidgetId('panel-title');
    const title = create_element(
        { tag: 'span' },
        { class: PANEL_TITLE_CLASS, id: titleId },
        options.title,
    );
    element.setAttribute('aria-labelledby', titleId);

    const header = create_element({ tag: 'header' }, { class: PANEL_HEADER_CLASS }, title);
    // 正文里的现成节点可能是别的 document 造的,统一按本面板的文档落成真节点.
    const body = create_element(
        { tag: 'div' },
        { class: PANEL_BODY_CLASS },
        ...childNodes(options.body ?? [], element.ownerDocument),
    );

    element.append(header, body);
    return { element, header, title, body };
}
