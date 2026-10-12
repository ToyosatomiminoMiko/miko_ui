/**
 * 声明式建 DOM 的最小原语 + 挂载锚点口径.
 *
 * 一次调用分三层,彼此不同级,所以参数也分开:
 * 1. `ElementSpec`(**创建层**):`tag` 与 `into` -- 造什么标签,挂到哪个节点下
 *    (给了 `into` 就在这一次调用里挂好).这两件都是"节点还不存在时"就必须知道的
 *    事,与属性表,子节点不同级;
 * 2. `ElementAttributes`(**属性层**):纯 HTML 属性表,键就是属性名,值必须是
 *    string,逐个 `setAttribute`;
 * 3. `children`(**结构层**):子节点,文本写成字符串.
 *
 * 刻意不做的事:
 * - **不引入 JSX**:那需要改 `tsconfig`(`jsx`)与 `vite` 的编译链,与本项目
 *   "不引前端框架/构建插件"的取舍冲突;
 * - **不做虚拟 DOM / diff**:这里的树只在装配期建一次,之后由各控件自己
 *   `set()` 就地更新.没有"每帧重建再比对"的需求,就不该有那套运行时.
 *
 * 产出的 DOM 必须与手写 HTML 完全同构,类名沿用现有 CSS(见
 * `styles/widgets.css`),所以样式一个字符都不用改.
 *
 * ## 为什么"根上下文"是锚点节点,而不是 `Document | ShadowRoot`
 *
 * 建节点只需要一个 `Document`,而**任何节点都已经知道自己落在哪个文档里**
 * (`ownerDocument`).要建节点的人手上必然有挂载点;把挂载点交出来,文档从它反查
 * 就够了.反过来问调用方要 `Document | ShadowRoot`,是在要一个他手上通常没有的
 * 东西 -- 库自己就吃过这个亏:`MessageList` 曾经写
 * `root: this.container.ownerDocument`,容器就在手边,却得先换算成文档才能建行.
 *
 * Shadow DOM 不是例外:`shadowRoot.ownerDocument` 就是页面上那个 `document`,
 * 两种情形建出来的节点属于同一个文档.真正会分叉的只有 iframe,而那种场景调用方
 * 手上照样有父元素.
 *
 * 两个名字分工(都不从 `miko_ui` 导出):
 * - `DomAnchor` 就是 `into` 的类型:**挂载点**,能收下任意子节点的那两种节点
 *   (`Element` / `DocumentFragment`,`ShadowRoot` 属于后者).`Document` **不在其列**:
 *   它只允许一个元素子节点,`document.append(div)` 要抛 -- 想借文档就借文档,
 *   别把它当挂载点;
 * - `anchorDocument(anchor)` 只借锚点的**文档**,任何节点都行(含 `Document` 自己),
 *   给库内"要文档但不要挂"的地方用(键盘监听挂 document,`childNodes` 落真节点).
 *
 * 口径:
 * - **建节点**:不传 `into` 用全局 `document`(脱离式,何时 append 由调用方定,
 *   字面量里的子节点就是这一类);传了 `into` 就用 `anchorDocument(into)` 建,
 *   **并当场挂进去** -- "建"与"挂"是同一次调用,不存在"建完忘了挂"的中间态;
 * - **全局监听**(keydown / resize)挂在节点所属 `Document` 上(Shadow DOM 里的
 *   键盘事件是 composed 的,会照常到达 document);
 * - **锚点类型不从 `miko_ui` 导出**(见 `index.ts`):`Element` / `DocumentFragment` /
 *   `Document` 都是标准 DOM 类型,消费者直接填,不需要再命名一个.
 */

/**
 * 挂载锚点:准备把节点挂进去的那个节点.
 *
 * 只有 `Element` 与 `DocumentFragment` 能当挂载点(`ShadowRoot` 是后者的一种):
 * 它们能收下任意多个子节点.`Document` 故意不收 -- 它只允许一个元素子节点,
 * 当挂载点用会在运行期抛,而"借文档"有 `anchorDocument()` 那条路.
 */
export type DomAnchor = Element | DocumentFragment;

/**
 * 取锚点所属的 `Document`.
 *
 * 收**任何节点**(包括 `Document` 自己):节点反查 `ownerDocument`,`Document` 的
 * `ownerDocument` 是 `null`(文档不属于别的文档),所以"没有就取它自己".不传锚点
 * 回落全局 `document`,与"不写 `into`"的脱离式创建是同一条口径.
 *
 * 库内单独要文档的地方(例如 `KeyboardController` 要在 document 上挂 keydown)走这
 * 一个出口,不再各自换算.
 */
export function anchorDocument(anchor?: Node): Document {
    if (anchor === undefined) return document;
    return anchor.ownerDocument ?? (anchor as unknown as Document);
}

/** 子节点:假值一律跳过,便于在声明里写 `cond && create_element(...)`. */
export type Child = Node | string | null | false | undefined;

/**
 * 属性表:纯 HTML 属性层.键就是属性名(`class` / `id` / `role` / `for` / `type` /
 * `aria-*` / `data-*` ...),值必须是 string,逐个走 `setAttribute`.
 *
 * 这里**没有 `into`**:挂载点属于创建层(见 `ElementSpec`),不是 HTML 属性.分开
 * 的直接好处是这张表的类型不必为它放宽,值类型只有 `string | undefined`,所以
 * "锚点值挂到属性键下","属性名打错"都在编译期报,而不是运行时 `TypeError`.
 */
export type ElementAttributes = Readonly<Record<string, string | undefined>>;

/**
 * 创建层:造什么标签 + 挂到哪个节点下.
 *
 * 两件都是"造"的时候才需要的信息,都不进 DOM,所以合成一个参数,与属性表分开.
 * `tag` 写成字面量时,`K` 会被推出来,返回类型随之收窄到对应的 HTMLElement 子类
 * (`create_element({ tag: 'label' })` 给 `HTMLLabelElement`).
 */
export interface ElementSpec<K extends keyof HTMLElementTagNameMap = keyof HTMLElementTagNameMap> {
    /** 标签名(字面量). */
    readonly tag: K;
    /**
     * 挂到哪个节点下.给了就**建完当场挂进去**,文档也从它推
     * (见 `anchorDocument()`);不传就是脱离式创建,用全局 `document`.
     *
     * 什么时候传:宿主/容器那一层(它就是挂载点,`create` 与 `append` 合成一步).
     * 什么时候不传:字面量里的子节点 -- 它的挂载点由外层那次 `append` 给出,
     * 再写一遍 `into` 会重复挂.
     */
    readonly into?: DomAnchor;
}

/**
 * 建一个元素:创建层(`tag` + `into`)+ 属性层 + 子节点,属性表的键就是 HTML 属性名,
 * 文本也是子节点.
 *
 * ```ts
 * create_element(
 *     { tag: 'div', into: host },                         // 创建层:标签 + 挂载点(建完即挂)
 *     {
 *         class: 'control-row',                           // -> class="..."
 *         role: 'group',                                  // -> 属性一律 setAttribute
 *         'aria-label': '半径',
 *     },
 *     '半径',                                              // 文本:字符串子节点
 *     create_element({ tag: 'span' }, { class: 'unit' }), // 子节点:嵌套(挂载点就是这个 div)
 *     showUnit && create_element({ tag: 'strong' }),      // 子节点:假值(null/undefined/false)跳过
 * );
 * ```
 *
 * `showUnit === false` 时,上面这段生成:
 *
 * ```html
 * <div class="control-row" role="group" aria-label="半径">半径<span class="unit"></span></div>
 * ```
 *
 * HTML 上看不出来的有三件:
 *
 * - **返回类型随标签收窄**:`create_element({ tag: 'label' })` 给
 *   `HTMLLabelElement`(所以上面 `label.htmlFor` 不用 `as`),`{ tag: 'input' }`
 *   给 `HTMLInputElement`.这是 TS 内置的字面量表 `HTMLElementTagNameMap` 推出来的
 *   (它基本覆盖了当前稳定标准的 HTML 元素),**没有第二份签名兜底**:标签是
 *   运行期才知道的 `string` 时这里编译不过 -- 那种情况直接 `document.createElement`.
 * - **`into` 就是挂载点**:传了的话,元素在本次调用返回前已经挂在它下面,调用方
 *   不需要也不该再 `append` 一次;不传则是脱离式,由调用方决定挂哪.
 * - **嵌套的子节点不写 `into`**:它的挂载点就是外层元素(由外层这次 `append` 给出).
 *   两个文档的节点也能这么套:插入时被目标文档收编是 DOM 自己的规则,不必先换算
 *   文档再建.
 *
 * @param spec 创建层:标签名 + 挂载锚点
 * @param attributes 属性层:HTML 属性表,值必须是 string
 * @param children 结构层:子节点(文本写成字符串)
 */
export function create_element<K extends keyof HTMLElementTagNameMap>(
    spec: ElementSpec<K>,
    attributes: ElementAttributes = {},
    ...children: Child[]
): HTMLElementTagNameMap[K] {
    // 1. 建节点:文档从锚点反查,没给锚点就用全局 document.
    const doc = anchorDocument(spec.into);
    const element = doc.createElement(spec.tag);

    // 2. 属性一律 setAttribute:class 不特殊,和 id / role / aria-* 走同一条路.
    //    undefined 跳过(可选属性常常是 undefined).类型上这里已经只会是 string,
    //    这一抛是给 JS 调用方兜底 -- 否则会被 setAttribute 静默转成 "[object Object]".
    for (const [name, value] of Object.entries(attributes)) {
        if (value === undefined) continue;
        if (typeof value !== 'string') {
            throw new TypeError(`create_element('${spec.tag}'): 属性 ${name} 的值必须是 string`);
        }
        element.setAttribute(name, value);
    }

    // 3. 追加子节点:文本也是子节点;假值跳过,字符串落成文本节点而不是 innerHTML.
    for (const child of children) {
        if (child === null || child === undefined || child === false) continue;
        element.append(typeof child === 'string' ? doc.createTextNode(child) : child);
    }

    // 4. 挂载:给了锚点就当场挂上.放在最后,节点是"装配完成"之后一次性插入的,
    //    反复改动的中间态不会引起布局.
    spec.into?.append(element);

    return element;
}

/**
 * 把 `Child[]` 落成真节点(字符串 -> 文本节点,假值跳过).
 *
 * `create_element()` 内部走同一套规则;"先建容器,稍后再搬节点"的场景
 * (`mountDesktop` 的背景节点,`WindowManager` 的窗口正文)也要用它,所以单独
 * 导出,避免各写一份过滤逻辑而漏掉字符串/假值中的一种.
 *
 * 这里只借锚点的文档,不挂任何东西 -- 搬节点的是调用方(所以参数叫 `anchor`
 * 而不是 `into`,类型收任何节点:要的只是"你在哪个文档里").
 */
export function childNodes(children: readonly Child[], anchor?: Node): Node[] {
    const doc = anchorDocument(anchor);
    const nodes: Node[] = [];
    for (const child of children) {
        if (child === null || child === undefined || child === false) continue;
        nodes.push(typeof child === 'string' ? doc.createTextNode(child) : child);
    }
    return nodes;
}

/** 控件实例序号:给 `<label for>` / `aria-*` 配对用的 id,只要求页内唯一. */
let widgetSeq = 0;

/**
 * 生成本次会话内唯一的控件 id.
 *
 * id 只服务"标签关联"这一件事,由控件自己发:按 id 去 document 里查节点会在
 * 撞名或漏写时静默出错,所以外部一律拿 handle 引用节点.
 */
export function nextWidgetId(kind: string): string {
    widgetSeq += 1;
    return `ui-${kind}-${widgetSeq}`;
}
