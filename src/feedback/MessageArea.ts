/**
 * 消息区:错误 / 警告提示的**容器**.
 *
 * 与 `MessageList` 的分工只有一条 -- 谁建那个容器:
 *
 * ```text
 *   MessageArea   div.message-area[aria-live=polite]   ← 结构 + 框体观感 + 滚动
 *   MessageList   容器里的 .diagnostic* 条目           ← 条目外观 + 增量渲染
 * ```
 *
 * **为什么容器也要进库**:容器曾经留在消费者手里,于是同一个提示区被拆成两处
 * 维护 -- 条目的外观在库(`styles/feedback.css` 的 `.diagnostic*`),容器的外观
 * 在应用;而容器上那条 `aria-live` 根本不是外观,是**行为**:漏了它,
 * `MessageList.render()` 那套"内容一致时一次 DOM 操作都不做"就白做(读屏会每帧
 * 重放同一批警告).收进库之后,消费者只剩"摆在哪,给多高,要不要挂滚动条,
 * 要不要那圈框体(`modifier: 'message-area--unframed'`)".
 *
 * **刻意不做的事**:
 * - 不产出 `.ui-scrollbar`:滚动条外观是单独的一条规定(见 `styles/scrollbar.css`),
 *   库的组件与它互不认识,要不要用由消费者决定(挂类名即可,不必写样式);
 * - 不决定可见性:空列表就是空容器,`display` 归消费者 -- 库不猜"空的时候该不该
 *   收起,要不要占位";
 * - 不定排版:字体与字号继承宿主.诊断文本用什么字体是消费者的排版口径,本件只给
 *   框体与列表节奏(与 `.diagnostic` 条目自身"只管内边距与配色"同一条界限).
 */
import { create_element, type DomRoot } from '../widgets/dom';
import { MessageList } from './MessageList';

/** 容器根类名.`.message-area` 的外观在 `styles/feedback.css`,只此一份. */
const MESSAGE_AREA_CLASS = 'message-area';

/** `createMessageArea()` 的可选输入. */
export interface MessageAreaOptions {
    /**
     * 建节点的根上下文;不传用全局 `document`(见 `widgets/dom.ts` 的
     * `rootDocument()`).`mountDesktop()` / Shadow DOM 场景显式传.
     */
    readonly root?: DomRoot;
    /**
     * 附加的**变体类**(如宿主已经有框时用的 `message-area--unframed`);默认没有.
     *
     * 与 `createSegmented` 的 `modifier` 同一条约定:变体是一个**类名**,
     * 外观在 CSS 里(**`styles/feedback.css` 的无框那条规则**),本件不认识任何
     * 具体变体,也就不必为每个变体长一个 boolean.
     *
     * 什么时候用无框:宿主**已经有框** -- 最典型的是"容器本身**就是**窗口正文根"
     * (窗口外壳那圈描边就是它的框,再套一层就是两层边框 + 一圈白给的内边距).
     * 它只脱框体,别的都不动:列排布 / 节奏 / 滚动 / `aria-live` 仍是同一份实现
     * (滚动还在容器自己身上,而容器就是正文根时,那条滑条本来就是"窗口自己的").
     */
    readonly modifier?: string;
    /**
     * 追加在 `.message-area` 上的消费方类名(基线在前,变体在中,它在外).
     *
     * 典型用法就是挂滚动条那条规定:`{ class: 'ui-scrollbar' }`.
     */
    readonly class?: string;
}

/** 消息区句柄:容器根 + 条目接口. */
export interface MessageAreaHandle {
    /** 容器根 `div.message-area`,插进宿主用这个. */
    readonly element: HTMLElement;
    /** 条目接口:渲染 / 追加 / 清空都走它,容器已经归它管. */
    readonly list: MessageList;
}

/**
 * 建一个消息区.
 *
 * ```html
 * <div class="message-area [<变体类>] <可选消费方类>" aria-live="polite"></div>
 * ```
 *
 * `aria-live="polite"` 不是可选项:它是本件存在的理由之一(容器里的任何 DOM
 * 变动都会被读屏播报),与 `MessageList.render()` 的"内容一致时不碰 DOM"配对
 * 才有意义.消费者不需要自己再写一遍,也不该覆盖它.
 */
export function createMessageArea(options: MessageAreaOptions = {}): MessageAreaHandle {
    const classes = [MESSAGE_AREA_CLASS];
    if (options.modifier !== undefined) classes.push(options.modifier);
    if (options.class !== undefined) classes.push(options.class);
    const element = create_element({ tag: 'div', root: options.root }, {
        class: classes.join(' '),
        'aria-live': 'polite',
    });
    return { element, list: new MessageList(element) };
}
