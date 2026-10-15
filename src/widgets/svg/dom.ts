/**
 * 声明式建 **SVG** 节点,与 `widgets/dom.ts` 的 `create_element` 对称.
 *
 * 为什么必须另有一个件:`create_element` 走 `document.createElement(tag)`,
 * 那建出来的永远是 **HTML 命名空间**的节点.`create_element({ tag: 'circle' })`
 * 拿到的是一个 `HTMLUnknownElement` -- 它进不了 SVG 渲染树,不占几何,收不到
 * `pointerdown`,唯一的症状是**什么都不显示**,没有报错.几何图形必须在 SVG 命名
 * 空间里造(`document.createElementNS('http://www.w3.org/2000/svg', 'circle')`),
 * 所以这一件不是"HTML 原语的便利包装",是另一条命名空间的路.
 *
 * 两层分工(与 `dom.ts` 的三层口径同构,少一层是因为命名空间由本件固定,不必再写):
 * - `SvgElementSpec`(**创建层**):`tag` + `into`,与 `ElementSpec` 同义,只是
 *   标签名的类型域换成 `SVGElementTagNameMap`;
 * - 属性层与结构层**直接复用** `dom.ts` 的 `ElementAttributes` / `Child`:
 *   值的写入口径(必须是 string,逐个 `setAttribute`,假值子节点跳过,字符串落成
 *   文本节点)与命名空间无关,再定一份类型只会多一个会漂移的镜像.
 *
 * 刻意不做的事:
 * - **不管几何属性怎么算**:`cx` / `cy` / `r` / `d` / `transform` 全部由调用方
 *   填字符串,这一件只负责把它们写进节点.布局是领域问题,不是 DOM 原语的问题;
 * - **不做虚拟 DOM / diff**,理由与 `dom.ts` 同一份:这里的树只在装配期建一次.
 *
 * ## 为什么不能只用 `create_element`
 *
 * 每种节点在浏览器里的创建方式确实不同,而分界不在"是不是 SVG",在**标签名**:
 *
 * - `<svg>` **根**:它两边都建得出来.`create_element({ tag: 'svg' })` 建的节点
 *   一旦被插进 HTML 文档,就会被 HTML 解析规则**收编进 SVG 命名空间** -- 于是
 *   `createElement('svg')` 出来的东西居然是能渲染的,这是 HTML 解析器里唯一一个
 *   "按上下文换命名空间"的特例.但它在**类型上**是 `HTMLElement`,拿不到
 *   `SVGSVGElement` 的成员,写 `viewBox` 这类属性也得不到指南;
 * - `<circle>` 这类**内容**:同一个特例对内容**不成立**.在 HTML 文档里
 *   `createElement('circle')` 造出来就停在 HTML 命名空间(`HTMLUnknownElement`),
 *   不渲染,不占几何,收不到 `pointerdown`,而且**不报错** -- 唯一的症状是什么都
 *   不显示.内容必须走本件.
 *
 * 所以规矩只有一条:**SVG 一律用 `create_svg_element`,连根也用它**.它建根时给的
 * 是 `SVGSVGElement`(命名空间也确实是 SVG,不靠 HTML 解析器的特例),于是"谁在哪个
 * 命名空间"这件事在库里只有一份答案,消费者不必记"根可以两种建法"这种例外.
 *
 * ```ts
 * const svg = create_svg_element(
 *     { tag: 'svg' },
 *     { viewBox: '0 0 800 600', width: '800', height: '600' },
 * );
 * create_svg_element({ tag: 'g', into: svg }, { transform: 'translate(400,60)' },
 *     create_svg_element({ tag: 'circle' }, { r: '22', fill: 'var(--rbt-node-red-fill)' }),
 *     create_svg_element({ tag: 'text' }, { 'text-anchor': 'middle' }, '13B'),
 * );
 * ```
 */

import { anchorDocument, type Child, type DomAnchor, type ElementAttributes } from '../dom';

/**
 * 创建层:造什么标签 + 挂到哪个节点下.
 *
 * 与 `ElementSpec` 同义,只是 `tag` 的类型域是 `SVGElementTagNameMap`(不是
 * `HTMLElementTagNameMap`):写成字面量时返回类型随之收窄
 * (`{ tag: 'circle' }` 给 `SVGCircleElement`),拼错的标签编译期就报.
 */
export interface SvgElementSpec<K extends keyof SVGElementTagNameMap = keyof SVGElementTagNameMap> {
    /** 标签名(字面量,必须是 SVG 元素). */
    readonly tag: K;
    /**
     * 挂到哪个节点下.给了就**建完当场挂进去**,文档也从它推
     * (与 `create_element` 的 `into` 完全同一条口径);不传就是脱离式创建.
     *
     * 字面量里的子节点同样不写 `into`:它的挂载点由外层那次 `append` 给出.
     */
    readonly into?: DomAnchor;
}

/** SVG 的命名空间 URI.写死在库内:这是规范常量,不是可配项. */
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * 建一个 SVG 元素:创建层(`tag` + `into`)+ 属性层 + 子节点.
 *
 * 四步与 `create_element` 逐条对应,只有第一步不同(命名空间);其余三步的口径
 * 完全一致,所以两件的行为可以直接对照读:
 * 1. 文档从锚点反查(`anchorDocument`,不读全局 `document`),用 `createElementNS`
 *    在 SVG 命名空间里造;
 * 2. 属性一律 `setAttribute`,`undefined` 跳过,值不是 string 当场抛
 *    (几何属性在 SVG2 里也是属性,`setAttribute('r', '22')` 就是它的写入口径);
 * 3. 子节点:文本写成字符串,假值(`null` / `undefined` / `false`)跳过,字符串落成
 *    文本节点而不是 `innerHTML`;
 * 4. 给了 `into` 就当场挂上,放在最后 -- 节点是装配完成之后一次性插入的.
 *
 * @param spec 创建层:标签名(必须存在于 `SVGElementTagNameMap`) + 挂载锚点
 * @param attributes 属性层:属性表,值必须是 string
 * @param children 结构层:子节点(文本写成字符串)
 */
export function create_svg_element<K extends keyof SVGElementTagNameMap>(
    spec: SvgElementSpec<K>,
    attributes: ElementAttributes = {},
    ...children: Child[]
): SVGElementTagNameMap[K] {
    // 1. 建节点:文档从锚点反查,没给锚点就用全局 document(与 create_element 同).
    const doc = anchorDocument(spec.into);
    const element = doc.createElementNS(SVG_NAMESPACE, spec.tag);

    // 2. 属性一律 setAttribute,值必须是 string.
    //    两件的报错文案各写一份是有意的:文案里要带各自的函数名,而
    //    `create_element('circle')` 与 `create_svg_element('circle')` 是两种完全不同的
    //    结果,报错时必须一眼看出是哪一个件建的这个节点.
    for (const [name, value] of Object.entries(attributes)) {
        if (value === undefined) continue;
        if (typeof value !== 'string') {
            throw new TypeError(`create_svg_element('${spec.tag}'): 属性 ${name} 的值必须是 string`);
        }
        element.setAttribute(name, value);
    }

    // 3. 追加子节点:文本也是子节点;假值跳过,字符串落成文本节点.
    for (const child of children) {
        if (child === null || child === undefined || child === false) continue;
        element.append(typeof child === 'string' ? doc.createTextNode(child) : child);
    }

    // 4. 挂载:给了锚点就当场挂上.
    spec.into?.append(element);

    return element;
}
