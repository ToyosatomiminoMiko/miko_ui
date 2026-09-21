/**
 * 消息列表:只保留错误与警告的紧凑提示件.
 *
 * 这是库里最干净的一件:`src/ui` 时期它就没有任何领域 import,只吃一个容器与
 * `MessageEntry[]`(见 docs/ui-library-extraction-plan.md §2.2/§6.1).搬进来之后
 * 它仍不认识"编译错误""降采样"是什么 -- 那些是应用侧的 `level`/文案.
 *
 * 容器通常带 `aria-live="polite"`:任何 DOM 变动都会被读屏播报,所以渲染层走
 * `render(list)`(整体替换,内容一致时**一次 DOM 操作都不做**),而不是每帧
 * `clear()` + 逐条 `add()` -- 后者在拖参数时会每帧重放同一批警告(UI-P3.7).
 * `add`/`clear` 保留给"一次性提示"场景(如 DslApp.run 的编译错误).
 *
 * D7:节点建在**容器所属**的 document 上,库不读全局 `document`.
 */
import { el } from '../widgets/dom';

export type MessageLevel = 'warning' | 'error';

/** 一条提示(渲染层的输入形状). */
export interface MessageEntry {
    readonly level: MessageLevel;
    readonly message: string;
}

interface MessageNode {
    /** 去重/复用键:`level` + 消息. */
    readonly key: string;
    readonly node: HTMLElement;
}

/** 条目键.用不可见分隔符,避免 level 与消息拼接后产生歧义. */
function messageKey(level: MessageLevel, message: string): string {
    return `${level}\u0000${message}`;
}

export class MessageList {
    private entries: MessageNode[] = [];

    constructor(private readonly container: HTMLElement) {}

    clear(): void {
        this.container.replaceChildren();
        this.entries = [];
    }

    add(level: MessageLevel, message: string): void {
        const node = this._createNode(level, message);
        this.entries.push({ key: messageKey(level, message), node });
        this.container.append(node);
    }

    /**
     * 用一批消息整体替换当前内容.
     *
     * 键序列与当前一致时直接返回:内容没变就不碰 DOM,live region 不会重复播报.
     * 变了则尽量复用同键节点,只移动/替换确实变化的部分.
     */
    render(next: readonly MessageEntry[]): void {
        const nextKeys = next.map((entry) => messageKey(entry.level, entry.message));
        const unchanged = nextKeys.length === this.entries.length
            && nextKeys.every((key, index) => key === this.entries[index].key);
        if (unchanged) return;

        // 按 key 分桶复用旧节点(同一键可能出现多条,所以是桶不是单值).
        const pool = new Map<string, HTMLElement[]>();
        for (const entry of this.entries) {
            const bucket = pool.get(entry.key);
            if (bucket) bucket.push(entry.node);
            else pool.set(entry.key, [entry.node]);
        }

        this.entries = next.map((entry) => {
            const key = messageKey(entry.level, entry.message);
            const node = pool.get(key)?.shift() ?? this._createNode(entry.level, entry.message);
            return { key, node };
        });
        this.container.replaceChildren(...this.entries.map((entry) => entry.node));
    }

    dispose(): void {
        this.clear();
    }

    private _createNode(level: MessageLevel, message: string): HTMLElement {
        // 类名与文案口径不变:应用侧 CSS(`css/diagnostics.css`)按 `diagnostic-<level>` 着色.
        return el('div', {
            class: `diagnostic diagnostic-${level}`,
            text: `[${level}] ${message}`,
            root: this.container.ownerDocument,
        });
    }
}
