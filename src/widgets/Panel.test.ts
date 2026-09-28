/**
 * 面板件单测.
 *
 * 锁三件事:结构(`section.ui-panel > header.ui-panel-header > span.ui-panel-title`
 * 与 `div.ui-panel-body`),标题经 `aria-labelledby` 成为 `role="region"` 的
 * 可访问名,以及"消费方作用域类叠在基线后面,正文按声明顺序落进去".
 *
 * 面板是静态件:没有状态,没有监听,也就没有 dispose 可测.至于"每个基类在样式表
 * 里都有默认规则"这一条,由 `test/emittedClasses.test.ts` 守着,不在本文件重复.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { installDomStub, type StubElement } from '../testing/domStub';
import { create_element } from './dom';
import { createPanel, type PanelOptions } from './Panel';

beforeEach(() => {
    installDomStub();
});

/** 建一张面板,并把四个引用收窄成桩类型(桩的节点形状与真 DOM 一致) */
function build(options: PanelOptions) {
    const panel = createPanel(options);
    return {
        element: panel.element as unknown as StubElement,
        header: panel.header as unknown as StubElement,
        title: panel.title as unknown as StubElement,
        body: panel.body as unknown as StubElement,
    };
}

describe('createPanel', () => {
    it('建 section.ui-panel > header.ui-panel-header > span.ui-panel-title + div.ui-panel-body', () => {
        const panel = build({ title: '设置' });

        expect(panel.element.tagName).toBe('section');
        expect(panel.element.className).toBe('ui-panel');
        expect(panel.header.className).toBe('ui-panel-header');
        expect(panel.title.className).toBe('ui-panel-title');
        expect(panel.body.className).toBe('ui-panel-body');
        expect(panel.header.contains(panel.title)).toBe(true);
        // 标题栏与正文是根的仅有两个子节点,顺序即显示顺序
        expect(panel.element.children.map((child) => (child as StubElement).className))
            .toEqual(['ui-panel-header', 'ui-panel-body']);
    });

    it('标题文案进 title,aria-labelledby 把它关联成面板的可访问名', () => {
        const panel = build({ title: '🧮 IEEE 754 浮点可视化' });

        expect(panel.title.textContent).toBe('🧮 IEEE 754 浮点可视化');
        expect(panel.element.getAttribute('role')).toBe('region');
        expect(panel.element.getAttribute('aria-labelledby')).toBe(panel.title.id);
        // id 由控件自己发,不能是空串(否则 aria-labelledby 指向不存在的锚)
        expect(panel.title.id).not.toBe('');
    });

    it('消费方作用域类叠在基线后面(顺序即层叠意图)', () => {
        expect(build({ title: 'OLED Canvas', class: 'oled-card' }).element.className)
            .toBe('ui-panel oled-card');
    });

    it('不给作用域类时不产生尾随空格', () => {
        expect(build({ title: 'OLED Canvas' }).element.className).toBe('ui-panel');
    });

    it('正文按声明顺序落进 body,字符串与假值走 create_element 的同一套规则', () => {
        const panel = build({
            title: '设置',
            body: [
                '第一段',
                null,
                false,
                create_element({ tag: 'p' }, { class: 'note' }),
            ],
        });

        // 两个真节点:文本 + <p>;null / false 被跳过
        expect(panel.body.children).toHaveLength(2);
        expect(panel.body.textContent).toBe('第一段');
        expect(panel.body.querySelector('.note')).not.toBeNull();
    });

    it('省略正文时 body 是空容器(之后往 handle.body 里加)', () => {
        expect(build({ title: '设置' }).body.children).toHaveLength(0);
    });

    it('两个面板的标题 id 不撞车', () => {
        expect(build({ title: 'a' }).title.id).not.toBe(build({ title: 'b' }).title.id);
    });
});
