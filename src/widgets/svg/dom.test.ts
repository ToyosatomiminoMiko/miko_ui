/**
 * `widgets/svg/dom.ts` 的契约测试:`create_svg_element` 的**命名空间**与
 * 与 `create_element` **逐条对齐**的属性 / 子节点 / 挂载口径.
 *
 * 命名空间这一条单独守:它是本件存在的全部理由.桩里的节点是手写的节点树,
 * "HTML 命名空间的 `<circle>` 不渲染也不收事件"这个后果在桩里**观测不到**,
 * 所以那个差别只能落在 `namespaceURI` 这个字段上 -- 断言它,等于钉住
 * "节点到底是用哪条 API 造的".
 *
 * 其余四条(文档从锚点反查 / 属性逐个 `setAttribute` / 假值子节点跳过 /
 * 给了 `into` 就建完即挂)与 `dom.test.ts` 是同一份口径的两份实现,两边的用例
 * 也一一对应:任何一侧改了行为,另一侧的对应用例会立刻对不上.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { installDomStub, StubElement } from '../../testing/domStub';
import { create_element, type DomAnchor } from '../dom';
import { create_svg_element } from './dom';

/** HTML 命名空间:走 `createElement` 的节点. */
const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
/** SVG 命名空间:走 `createElementNS` 的节点. */
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

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

describe('命名空间', () => {
    it('内容节点建在 SVG 命名空间里(这正是本件与 create_element 的唯一区别)', () => {
        const circle = stub(create_svg_element({ tag: 'circle' }));

        expect(circle.tagName).toBe('circle');
        expect(circle.namespaceURI).toBe(SVG_NAMESPACE);
    });

    it('同一个标签走 create_element 是 HTML 命名空间(所以那条路建得出 svg 根,建不出内容)', () => {
        // `as` 是有意的:`create_element` 的类型域是 `HTMLElementTagNameMap`,
        // **根本收不下 `'svg'`** -- 这一行要先撒个谎才能编译过去,而它表达的是
        // "就算硬走 HTML 那条路,拿到的也只是 HTML 命名空间的节点".
        const viaHtml = stub(create_element({ tag: 'svg' as unknown as 'div' }));
        const viaSvg = stub(create_svg_element({ tag: 'svg' }));

        // 两边都建得出 `svg` 根,差别只在命名空间与拿到的类型:走 create_element 是
        // HTML 命名空间 + `HTMLElement`(靠 HTML 解析器的特例才能在文档里渲染成
        // SVG),走本件是 SVG 命名空间 + `SVGSVGElement`.内容节点没有这个特例.
        expect(viaHtml.tagName).toBe('svg');
        expect(viaHtml.namespaceURI).toBe(HTML_NAMESPACE);
        expect(viaSvg.namespaceURI).toBe(SVG_NAMESPACE);
    });

    it('into 也收 SVG 里的节点:文档仍从锚点反查,嵌套时命名空间各归各的', () => {
        // 锚点要用桩类型(`StubElement` 不是真 `Element`),所以这里显式收窄一次;
        // 被断言的那个节点保持真类型走公开 API.
        const svgHost = anchor(stub(create_svg_element({ tag: 'svg' }, { viewBox: '0 0 800 600' })));
        const group = stub(create_svg_element({ tag: 'g', into: svgHost }, { transform: 'translate(400,60)' }));
        const text = stub(create_svg_element({ tag: 'text', into: anchor(group) }, {}, '13B'));

        expect(stub(svgHost).namespaceURI).toBe(SVG_NAMESPACE);
        expect(group.namespaceURI).toBe(SVG_NAMESPACE);
        expect(text.namespaceURI).toBe(SVG_NAMESPACE);
        expect(group.parentElement).toBe(svgHost);
        expect(text.parentElement).toBe(group);
        expect(text.ownerDocument).toBe(document);
    });
});

describe('属性层', () => {
    it('属性逐个 setAttribute:数值属性也一律写成字符串', () => {
        const circle = stub(create_svg_element(
            { tag: 'circle' },
            {
                cx: '20',
                cy: '30',
                r: '22',
                class: 'rbt-node',
                fill: 'var(--rbt-node-red-fill)',
                'aria-hidden': 'true',
                hidden: undefined,
            },
        ));

        expect(circle.getAttribute('cx')).toBe('20');
        expect(circle.getAttribute('r')).toBe('22');
        expect(circle.className).toBe('rbt-node');
        // fill 直接吃 CSS 令牌:这是换成 SVG 之后才成立的一件事(见文件头注释).
        expect(circle.getAttribute('fill')).toBe('var(--rbt-node-red-fill)');
        // 可选属性是 undefined 时不该落成 hidden="undefined".
        expect(circle.getAttribute('hidden')).toBeNull();
    });

    it('属性值不是 string 时当场抛错,且文案里认得出是哪一个件', () => {
        expect(() => create_svg_element({ tag: 'circle' }, { r: 22 as unknown as string })).toThrow(
            /create_svg_element\('circle'\): 属性 r 的值必须是 string/,
        );
    });
});

describe('结构层', () => {
    it('字符串落成文本节点,假值子节点跳过,子节点按顺序进', () => {
        const group = stub(create_svg_element(
            { tag: 'g' },
            {},
            create_svg_element({ tag: 'circle' }, { r: '22' }),
            null,
            false,
            create_svg_element({ tag: 'text' }, { 'text-anchor': 'middle' }, '13B'),
        ));

        expect(group.textContent).toBe('13B');
        // 桩的 `children` 就是 childNodes(含文本节点),所以逐个标出是什么.
        // 文本节点是它所属那个 `<text>` 的子节点,不在 `<g>` 的直接子节点里.
        expect(group.children.map((child) => (child instanceof StubElement ? child.tagName : '#text')))
            .toEqual(['circle', 'text']);
        expect(stub(group.children[1]).textContent).toBe('13B');
    });
});

describe('返回类型随标签收窄', () => {
    it('{ tag: circle } 给 SVGCircleElement:赋值给窄类型不必 as', () => {
        // 这一行本身就是断言:`create_svg_element` 的返回类型只要退化成
        // `SVGElement` 或 `HTMLElement`,这里就编译不过(`npm run typecheck`).
        const circle: SVGCircleElement = create_svg_element({ tag: 'circle' }, { r: '22' });

        expect(circle.tagName).toBe('circle');
        expect(circle.getAttribute('r')).toBe('22');
    });

    it('锚点收窄到 DomAnchor,传普通 HTML 元素也合法', () => {
        const host = stub(create_element({ tag: 'div' }));
        const svg = create_svg_element({ tag: 'svg', into: anchor(host) });
        const path = stub(create_svg_element({ tag: 'path', into: svg }, { d: 'M0 0 L10 10' }));

        expect(path.parentElement).toBe(svg);
    });
});
