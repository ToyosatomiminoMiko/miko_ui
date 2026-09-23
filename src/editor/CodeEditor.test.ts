/**
 * `CodeEditor` 的装配契约.
 *
 * 锁四件事:
 * 1. **结构**:`.code-editor*` 那套类名,以及"高亮层紧跟 textarea"这条会被
 *    相邻兄弟选择器依赖的顺序;
 * 2. **注入**:分词由消费者给(库不认识任何具体语言的词法),初值进 textarea;
 * 3. **`refresh()`**:程序化改写 `textarea.value` 之后行号与高亮一起跟上;
 * 4. **无全局**:两个编辑器可以共存于同一棵树上 -- 库不占用任何 id,
 *    同页两个实例不串味.
 *
 * 用库自带的 DOM 桩(`test/domStub.ts`).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { installDomStub, type StubElement } from '../../test/domStub';
import { createCodeEditor, type CodeEditorHandle } from './CodeEditor';

/** 桩分词器:把整份源码包一层,便于断言"注入的函数被用上了". */
const wrap = (source: string): string => `<span class="hl">${source}</span>`;

function stub(element: unknown): StubElement {
    return element as StubElement;
}

function setup(value = 'curve c1 = 1;'): {
    root: StubElement;
    editor: CodeEditorHandle;
} {
    const dom = installDomStub();
    const root = dom.document.createElement('div');
    dom.document.body.append(root);
    const editor = createCodeEditor({
        value,
        highlight: wrap,
        gutterMinWidth: 32,
        root: dom.document as unknown as Document,
    });
    root.append(editor.element as unknown as StubElement);
    return { root, editor };
}

beforeEach(() => {
    installDomStub();
});

describe('结构', () => {
    it('建出 .code-editor* 全套类名,顺序与 CSS 契约一致', () => {
        const { editor } = setup();
        const box = stub(editor.element);

        expect(box.className).toBe('code-editor');
        expect(box.children.map((child) => (child as StubElement).className))
            .toEqual(['code-editor-gutter', 'code-editor-input']);

        const gutter = box.children[0] as StubElement;
        expect(gutter.getAttribute('aria-hidden')).toBe('true');
        expect((gutter.children[0] as StubElement).className).toBe('code-editor-lines');

        const input = box.children[1] as StubElement;
        // 高亮层必须紧跟在 textarea 之后:`+` 选择器依赖这个顺序.
        expect(input.children[0]).toBe(editor.textarea as unknown as StubElement);
        expect((input.children[1] as StubElement).className).toBe('code-editor-highlight');
    });

    it('textarea 关掉拼写检查(源码里全是标识符,标红只添乱)', () => {
        const { editor } = setup();
        expect(stub(editor.textarea).getAttribute('spellcheck')).toBe('false');
    });

    it('初值进 textarea', () => {
        const { editor } = setup('surface s1 = 1;');
        expect(editor.textarea.value).toBe('surface s1 = 1;');
    });
});

describe('注入与刷新', () => {
    it('高亮用注入的分词器渲染(库不认识 DSL)', () => {
        const { editor } = setup();
        expect(stub(editor.highlightCode).innerHTML).toBe('<span class="hl">curve c1 = 1;</span>');
        // 库这边不认识任何词法类名.
        expect(stub(editor.highlightCode).innerHTML).not.toContain('dsl-');
    });

    it('refresh() 让行号与高亮跟上程序化改写', () => {
        const { editor } = setup('a\nb');
        expect(stub(editor.lines).textContent).toBe('1\n2');

        editor.textarea.value = 'a\nb\nc';
        editor.refresh();

        expect(stub(editor.lines).textContent).toBe('1\n2\n3');
        expect(stub(editor.highlightCode).innerHTML).toBe('<span class="hl">a\nb\nc</span>');
    });
});

describe('生命周期与"无全局"', () => {
    it('dispose 之后不再响应输入(监听已摘)', () => {
        const { editor } = setup();
        editor.dispose();

        editor.textarea.value = 'changed';
        stub(editor.textarea).dispatch('input');

        // 高亮停在 dispose 前的内容上.
        expect(stub(editor.highlightCode).innerHTML).toBe('<span class="hl">curve c1 = 1;</span>');
    });

    it('同一棵树上两个实例互不影响(库不占用任何 id)', () => {
        const dom = installDomStub();
        const root = dom.document.createElement('div');
        dom.document.body.append(root);
        const options = { highlight: wrap, gutterMinWidth: 32, root: dom.document as unknown as Document };
        const first = createCodeEditor({ ...options, value: 'first' });
        const second = createCodeEditor({ ...options, value: 'second' });
        root.append(first.element as unknown as StubElement, second.element as unknown as StubElement);

        expect(first.textarea.value).toBe('first');
        expect(second.textarea.value).toBe('second');
        // 两棵树里同名的节点各归各的:没有 id 可以撞.
        expect(stub(first.textarea).id).toBe('');
        expect(stub(second.textarea).id).toBe('');
        expect(root.querySelectorAll('.code-editor')).toHaveLength(2);
    });
});
