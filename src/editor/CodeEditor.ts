/**
 * `CodeEditor` —— 源码编辑器外壳(结构 + 两个装饰件的装配).
 *
 * 它把原来散在消费者里的那段结构收进库:
 *
 * ```text
 * .code-editor
 *   .code-editor-gutter
 *     .code-editor-lines          ← EditorLineNumbers 的槽宽/平移目标
 *   .code-editor-input
 *     .code-editor-textarea       ← 真 textarea(光标/选区/撤销/IME 都靠它)
 *     .code-editor-highlight      ← 裁剪框(overflow: hidden,不滚动)
 *       .code-editor-highlight-code  ← 高亮 HTML 的载体,偏移写在它的 transform 上
 * ```
 *
 * 两条会"静默失效"的结构约束(所以它们在这里由代码保证,而不是写在文档里):
 * 1. **高亮层紧跟 textarea**:`.code-editor-textarea.is-highlighted + .code-editor-
 *    highlight` 是相邻兄弟选择器,中间插一个节点整层就不显示(不是错位,更
 *    容易被误判成"功能没了");
 * 2. **三者同字体同内边距**:由库的 `styles/editor.css` 保证(与这两个装饰件的
 *    度量口径配套).
 *
 * 分词与槽宽下限由消费者注入(D6):库不认识 DSL 的语法,也不认识"字号 16 /
 * 槽宽 32"这套应用取值.节点建在 `options.root` 上(D7).
 */
import type { DomRoot } from '../dom/root';
import { create_element } from '../widgets/dom';
import { EditorHighlight } from './EditorHighlight';
import { EditorLineNumbers } from './EditorLineNumbers';

export interface CodeEditorOptions {
    /** 初值(源码).默认空串. */
    readonly value?: string;
    /** 浏览器拼写检查;默认关(源码里全是标识符,标红只添乱). */
    readonly spellcheck?: boolean;
    /** 源码全文 -> 高亮 HTML(应用侧是 `highlightDsl`). */
    readonly highlight: (source: string) => string;
    /** 行号槽宽下限(px);应用侧来自 `UI_CONFIG.editor.gutterMinWidth`. */
    readonly gutterMinWidth: number;
    /** 建节点的根上下文;不传则用全局 `document`(见 `dom/root.ts`). */
    readonly root?: DomRoot;
}

/** 编辑器句柄:消费者拿它取输入框、刷新装饰、以及拆卸. */
export interface CodeEditorHandle {
    /** 外框(`.code-editor`),插进窗口正文用这个. */
    readonly element: HTMLElement;
    /** 真 textarea:值的唯一真相源. */
    readonly textarea: HTMLTextAreaElement;
    readonly lineNumbers: EditorLineNumbers;
    readonly highlight: EditorHighlight;
    /** 行号槽(`.code-editor-gutter`)与它的内容节点. */
    readonly gutter: HTMLElement;
    readonly lines: HTMLElement;
    /** 高亮层的裁剪框与内容节点(偏移写在后者的 transform 上). */
    readonly highlightScroller: HTMLElement;
    readonly highlightCode: HTMLElement;
    /** 外部程序化改写 `textarea.value` 之后调用:重算行数并重绘高亮. */
    refresh(): void;
    dispose(): void;
}

export function createCodeEditor(options: CodeEditorOptions): CodeEditorHandle {
    const root = options.root;

    const textarea = create_element('textarea', {
        class: 'code-editor-textarea',
        spellcheck: String(options.spellcheck ?? false),
        root,
    });
    textarea.value = options.value ?? '';

    const lines = create_element('pre', { class: 'code-editor-lines', root });
    const gutter = create_element('div', {
        class: 'code-editor-gutter',
        'aria-hidden': 'true',
        root,
    }, lines);

    const highlightCode = create_element('pre', { class: 'code-editor-highlight-code', root });
    const highlightScroller = create_element('div', {
        class: 'code-editor-highlight',
        'aria-hidden': 'true',
        root,
    }, highlightCode);

    // 顺序即契约:textarea 与高亮层必须是相邻兄弟(见文件头第 1 条).
    const input = create_element('div', { class: 'code-editor-input', root }, textarea, highlightScroller);
    const element = create_element('div', { class: 'code-editor', root }, gutter, input);

    const lineNumbers = new EditorLineNumbers(
        textarea,
        { gutter, numbers: lines },
        { gutterMinWidth: options.gutterMinWidth },
    );
    const highlight = new EditorHighlight(
        textarea,
        { scroller: highlightScroller, code: highlightCode },
        { highlight: options.highlight },
    );

    return {
        element,
        textarea,
        lineNumbers,
        highlight,
        gutter,
        lines,
        highlightScroller,
        highlightCode,
        refresh(): void {
            lineNumbers.refresh();
            highlight.refresh();
        },
        dispose(): void {
            lineNumbers.dispose();
            highlight.dispose();
        },
    };
}
