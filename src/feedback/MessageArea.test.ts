/**
 * 消息区容器件单测.
 *
 * 五件事:结构(`div.message-area[aria-live=polite]`),消费方作用域类叠在基线
 * 之后,变体类(`modifier`)夹在两者之间且只换类名不动行为,
 * 句柄里的 `MessageList` 就是这个容器的条目接口,以及"节点建在调用方给的
 * root 上,不读全局 `document`".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomStub, type StubElement } from '../testing/domStub';
import { createMessageArea, type MessageAreaOptions } from './MessageArea';

beforeEach(() => {
    installDomStub();
});

/** 建一个消息区,把引用收窄成桩类型(桩的节点形状与真 DOM 一致). */
function build(options: MessageAreaOptions = {}) {
    const area = createMessageArea(options);
    return { element: area.element as unknown as StubElement, list: area.list };
}

describe('createMessageArea', () => {
    it('建 div.message-area,带 aria-live=polite,初始为空', () => {
        const area = build();

        expect(area.element.tagName).toBe('div');
        expect(area.element.className).toBe('message-area');
        // `aria-live` 是本件存在的理由之一,不是可选项:容器里的 DOM 变动要被播报.
        expect(area.element.getAttribute('aria-live')).toBe('polite');
        expect(area.element.children).toHaveLength(0);
    });

    it('消费方类叠在基线类后面', () => {
        const area = build({ class: 'ui-scrollbar' });

        expect(area.element.className).toBe('message-area ui-scrollbar');
    });

    it('modifier 追加变体类:基线在前,变体居中,消费方类在外', () => {
        const area = build({ modifier: 'message-area--unframed', class: 'ui-scrollbar' });

        // 变体只是一个**类名**,外观在 CSS(`.message-area--unframed` 去掉框体);
        // 结构与滚动不动,`aria-live` 与条目接口照旧(与 createSegmented 的
        // `modifier` 同一条约定).
        expect(area.element.className).toBe('message-area message-area--unframed ui-scrollbar');
        expect(area.element.getAttribute('aria-live')).toBe('polite');

        area.list.add('warning', '降采样');
        expect(area.element.children).toHaveLength(1);
    });

    it('不传 modifier 时就是带框的那一个类(变体默认没有)', () => {
        expect(build().element.className).toBe('message-area');
        expect(build({ class: 'ui-scrollbar' }).element.className).toBe('message-area ui-scrollbar');
    });

    it('句柄里的 list 就是这个容器的条目接口', () => {
        const area = build();

        area.list.add('error', '编译失败');
        expect(area.element.children).toHaveLength(1);
        expect((area.element.children[0] as StubElement).className).toBe(
            'diagnostic diagnostic-error',
        );
        expect((area.element.children[0] as StubElement).textContent).toBe(
            '[error] 编译失败',
        );

        area.list.clear();
        expect(area.element.children).toHaveLength(0);
    });

    it('render 的增量语义透过容器件照常成立(内容一致时零 DOM 操作)', () => {
        const area = build();
        const entries = [{ level: 'warning' as const, message: '降采样' }];
        area.list.render(entries);

        const replaceChildren = vi.fn(area.element.replaceChildren.bind(area.element));
        area.element.replaceChildren = replaceChildren;

        area.list.render(entries);

        expect(replaceChildren).not.toHaveBeenCalled();
        expect(area.element.children).toHaveLength(1);
    });

    it('节点建在调用方给的 root 上,不读全局 document', () => {
        const first = installDomStub();
        // 再装一次:全局 document 指向第二棵树,只有显式给 root 才会用第一棵.
        installDomStub();

        const area = createMessageArea({ root: first.document as unknown as Document });

        expect((area.element as unknown as StubElement).ownerDocument).toBe(first.document);
    });
});
