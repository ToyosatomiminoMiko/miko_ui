/**
 * 消息列表:只保留错误与警告的紧凑提示件.
 *
 * 它不依赖任何领域概念,只吃一个容器与 `MessageEntry[]`.
 *
 * 容器通常带 `aria-live="polite"`:任何 DOM 变动都会被读屏播报,所以渲染层走
 * `render(next)`(增量落位,内容一致时**一次 DOM 操作都不做**),而不是每帧
 * `clear()` + 逐条 `add()` -- 后者在拖参数时会每帧重放同一批警告.
 * `add`/`clear` 保留给"一次性提示"场景.
 *
 * 行的增删/复用/排序**不在这里**:那是 `shared/rowList.ts` 的
 * {@link RowList}(对象列表与过程步骤用的同一份).本件只做两件它不知道的事:
 *
 * 1. 把"消息"化成行标识 -- 同一个键可以出现多条(两条同样的警告),而引擎要求
 *    标识唯一,所以标识是 `内容键 + 同键内的第几条`;
 * 2. 建条目节点(`div.diagnostic-*`),也就是 `build` 钩子.
 *
 * 引擎默认会给容器加 `role="list"`,这里显式关掉:提示条目不是 `listitem`,
 * `aria-live` 容器上声明 `list` 反而是无效 ARIA(见 `RowListOptions.listRole`).
 *
 * 节点建在**容器所属**的 document 上,库不读全局 `document`.
 */
import { RowList } from '../shared/rowList';
import { create_element } from '../widgets/dom';

export type MessageLevel = 'warning' | 'error';

/** 一条提示(渲染层的输入形状). */
export interface MessageEntry {
    readonly level: MessageLevel;
    readonly message: string;
}

/** 条目键.用不可见分隔符,避免 level 与消息拼接后产生歧义. */
function messageKey(level: MessageLevel, message: string): string {
    return `${level}\u0000${message}`;
}

/**
 * 交给行引擎的一条:内容键 + 它在同键条目里是第几条.
 *
 * 两个字段分开是因为引擎的 `key`(内容指纹)与 `name`(行标识)是两个概念:
 * 内容键相同就复用节点,而重复消息必须各自占一行,靠 `occurrence` 才唯一.
 */
interface IndexedMessage {
    readonly key: string;
    readonly occurrence: number;
    readonly entry: MessageEntry;
}

/** 行句柄:引擎只认根元素,行内结构在本件的 `build` 里. */
interface MessageRow {
    readonly row: HTMLElement;
}

/** 按输入顺序把消息编成"键 + 第几条";同键的计数在本次渲染内独立. */
function indexMessages(entries: readonly MessageEntry[]): IndexedMessage[] {
    const seen = new Map<string, number>();
    return entries.map((entry) => {
        const key = messageKey(entry.level, entry.message);
        const occurrence = seen.get(key) ?? 0;
        seen.set(key, occurrence + 1);
        return { key, occurrence, entry };
    });
}

export class MessageList {
    /** 行增删/复用/排序归引擎;这里只维护"当前条目"这一份输入. */
    private readonly rows: RowList<IndexedMessage, MessageRow>;

    /** 当前条目:`add()` 要在既有内容后面接一条,所以本件自己留一份. */
    private entries: readonly MessageEntry[] = [];

    constructor(private readonly container: HTMLElement) {
        this.rows = new RowList<IndexedMessage, MessageRow>(
            container,
            { listRole: false },
        );
    }

    clear(): void {
        this.entries = [];
        this.rows.clear();
    }

    add(level: MessageLevel, message: string): void {
        this._render([...this.entries, { level, message }]);
    }

    /**
     * 用一批消息整体替换当前内容.
     *
     * 内容与顺序都没变时一次 DOM 操作都不做(引擎按"标识 + 内容键"比对);
     * 变了才只新建真正新增的条目,并按输入顺序落位.
     */
    render(next: readonly MessageEntry[]): void {
        this._render(next);
    }

    dispose(): void {
        this.clear();
    }

    private _render(next: readonly MessageEntry[]): void {
        this.entries = [...next];
        this.rows.sync(indexMessages(this.entries), {
            // 同键的重复条目靠"第几条"区分,否则引擎的 Map 会让它们互相顶掉.
            name: (item) => `${item.key}\u0000${item.occurrence}`,
            key: (item) => item.key,
            build: (item) => ({
                row: this._createNode(item.entry.level, item.entry.message),
            }),
        });
    }

    private _createNode(level: MessageLevel, message: string): HTMLElement {
        // 类名与文案是固定契约:消费者的 CSS 按 `diagnostic-<level>` 着色.
        return create_element({ tag: 'div', root: this.container.ownerDocument }, {
            class: `diagnostic diagnostic-${level}`,
        }, `[${level}] ${message}`);
    }
}
