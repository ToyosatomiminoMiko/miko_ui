/**
 * `widgets/dom.ts` 的契约测试:三层参数(创建层 / 属性层 / 结构层)与**锚点**口径.
 *
 * 锚点这一条是本次改动的核心,单独守:
 * - 不传 `into` -> 脱离式,文档用全局 `document`;
 * - 传了 `into` -> 建完即挂,文档从锚点反查(不读全局);
 * - 字面量里的嵌套子节点不写 `into` -- 挂载点由外层那次 `append` 给出.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { installDomStub, StubElement } from '../testing/domStub';
import { childNodes, create_element, type DomAnchor } from './dom';

/** 桩的节点形状与真 DOM 一致,测试里一律收窄成桩类型再用. */
function stub(node: unknown): StubElement {
    return node as unknown as StubElement;
}

/** 桩的节点不是真 `Node`:锚点参数按公开面的类型收窄. */
function anchor(node: unknown): DomAnchor {
    return node as unknown as DomAnchor;
}

beforeEach(() => {
    installDomStub();
});

describe('三层参数', () => {
    it('属性逐个 setAttribute,undefined 跳过,字符串落成文本节点', () => {
        const element = stub(create_element(
            { tag: 'div' },
            { class: 'control-row', role: 'group', 'aria-label': '半径', hidden: undefined },
            '半径',
            null,
            false,
            create_element({ tag: 'span' }, { class: 'unit' }),
        ));

        expect(element.className).toBe('control-row');
        expect(element.getAttribute('role')).toBe('group');
        // 可选属性是 undefined 时不该落成 hidden="undefined".
        expect(element.getAttribute('hidden')).toBeNull();
        expect(element.textContent).toBe('半径');
        // 桩的 `children` 就是 childNodes(含文本节点),所以逐个标出是什么.
        expect(element.children.map((child) => (child instanceof StubElement ? child.className : '#text')))
            .toEqual(['#text', 'unit']);
    });

    it('属性值不是 string 时当场抛错(不给 setAttribute 静默转 [object Object] 的机会)', () => {
        expect(() => create_element({ tag: 'div' }, { id: 1 as unknown as string })).toThrow(
            /属性 id 的值必须是 string/,
        );
    });
});

describe('锚点 into', () => {
    it('不传 into:脱离式创建,文档是全局 document,没有父节点', () => {
        const element = stub(create_element({ tag: 'div' }));

        expect(element.ownerDocument).toBe(document);
        expect(element.parentElement).toBeNull();
    });

    it('传 into:建完即挂,文档从锚点反查(全局已经是另一棵树也不影响)', () => {
        const first = installDomStub();
        const host = first.document.createElement('div');
        first.document.body.append(host);
        // 再装一次:全局 document 指向第二棵树,只有锚点在第一棵树上才会用第一棵.
        installDomStub();

        const element = stub(create_element({ tag: 'span', into: anchor(host) }, {}, 'x'));

        expect(element.ownerDocument).toBe(first.document);
        expect(host.children).toHaveLength(1);
        expect(host.children[0]).toBe(element);
    });

    it('锚点可以是 DocumentFragment(还没进树的挂载点)', () => {
        const dom = installDomStub();
        const fragment = dom.document.createDocumentFragment();

        const element = stub(create_element({ tag: 'div', into: anchor(fragment) }, {}, 'x'));

        expect(element.ownerDocument).toBe(dom.document);
        expect(fragment.children).toHaveLength(1);
        expect(fragment.children[0]).toBe(element);
    });

    it('字面量里的子节点不写 into:位置与文档都由外层那次挂载给出', () => {
        const dom = installDomStub();
        const host = dom.document.createElement('div');
        dom.document.body.append(host);

        const box = stub(create_element(
            { tag: 'div', into: anchor(host) },
            { class: 'box' },
            create_element({ tag: 'span' }, {}, 'a'),
            create_element({ tag: 'span' }, {}, 'b'),
        ));

        expect(box.textContent).toBe('ab');
        expect(host.children).toHaveLength(1);
        expect(host.children[0]).toBe(box);
    });
});

describe('childNodes', () => {
    it('只借锚点的文档落成真节点,自己不挂任何东西', () => {
        const dom = installDomStub();
        const host = dom.document.createElement('div');
        dom.document.body.append(host);

        const nodes = childNodes(
            ['a', null, undefined, false, create_element({ tag: 'b' })],
            host as unknown as Node,
        );

        expect(nodes).toHaveLength(2);
        expect(host.children).toHaveLength(0);
    });
});
