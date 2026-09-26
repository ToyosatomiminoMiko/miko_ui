/**
 * 声明式建 DOM 的最小原语 + 库内的 DOM 根上下文口径.
 *
 * ## 建节点
 *
 * 这一层只干一件事:把"造什么节点 + 属性 + 子节点"写成一次函数调用,让上层可以用
 * 嵌套的表达式声明一棵树,而不是 `createElement` / `setAttribute` / `append`
 * 三行样板排成一片.
 *
 * 一次调用分三层,彼此不同级,所以参数也分开:
 * 1. `ElementSpec`(**创建层**):`tag` 与 `root` -- 造什么标签,由哪个 document
 *    的 `createElement` 造出来.这两件都是"造"的时候的事,一个都不进 DOM;
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
 * ## 根上下文
 *
 * `DomRoot` / `rootDocument` 也在本文件:原先单独占 `dom/root.ts`,删掉 `rootWindow`
 * 之后只剩两个名字,再开一个目录不值得,就搬到建节点的地方 -- 它俩本来就是
 * `create_element()` / `childNodes()` 的 `root` 参数要用的东西.
 *
 * 为什么要有这一层:组件如果直接读全局 `document` / `window`,就默认了"页面上只有
 * 我一个实例,我拥有整个页面".这一个假设同时挡住三件事:同页两个实例,嵌进别人的
 * 页面,以及 Shadow DOM 隔离.
 *
 * 口径:
 * - **建节点**走 `rootDocument(root)`.`createElement`/`createTextNode`;
 * - **全局监听**(keydown / resize)挂在所属 `Document` 上(Shadow DOM 里的
 *   键盘事件是 composed 的,会照常到达 document);
 * - **不传 root** 时退回全局 `document` -- 这是给"应用侧只有一个页面实例"
 *   准备的默认值;库自己的 `mountDesktop()` 永远显式传 root.
 *
 * 这两个名字**不从 `miko_ui` 导出**(见 `index.ts`):消费者手上已经有 `Document` /
 * `ShadowRoot`,直接填进 `root` 参数即可,不需要命名这个类型,也不需要自己换算.
 */

/** 可被接受的 document root:文档它自己,或某个 shadow 树的根. */
export type DomRoot = Document | ShadowRoot;

/**
 * 取 root 所属的 `Document`.
 *
 * 不传 root 时返回全局 `document`(唯一的裸 `document` 引用,只此一处).
 * Document 有 `body` -> 原样返回;
 * ShadowRoot 没有 `body`,也不该有 -> 取它的 ownerDocument.
 */
export function rootDocument(root: DomRoot | undefined = undefined): Document {
    return root === undefined ? document : ('body' in root ? root : root.ownerDocument);
}

/** 子节点:假值一律跳过,便于在声明里写 `cond && create_element(...)`. */
export type Child = Node | string | null | false | undefined;

/**
 * 属性表:纯 HTML 属性层.键就是属性名(`class` / `id` / `role` / `for` / `type` /
 * `aria-*` / `data-*` ...),值必须是 string,逐个走 `setAttribute`.
 *
 * 这里**没有 `root`**:`root` 属于创建层(见 `ElementSpec`),不是 HTML 属性.分开
 * 的直接好处是这张表的类型不必为它放宽,值类型只有 `string | undefined`,所以
 * "`DomRoot` 值挂到属性键下","属性名打错"都在编译期报,而不是运行时 `TypeError`.
 */
export type ElementAttributes = Readonly<Record<string, string | undefined>>;

/**
 * 创建层:造什么标签 + 造在哪个 document 上.
 *
 * 两件都是"造"的时候才需要的信息,都不进 DOM,所以合成一个参数,与属性表分开.
 * `tag` 写成字面量时,`K` 会被推出来,返回类型随之收窄到对应的 HTMLElement 子类
 * (`create_element({ tag: 'label' })` 给 `HTMLLabelElement`).
 */
export interface ElementSpec<K extends keyof HTMLElementTagNameMap = keyof HTMLElementTagNameMap> {
    /** 标签名(字面量). */
    readonly tag: K;
    /**
     * 建在哪个 document 上;不传用全局 `document`(见上面的 `rootDocument()`).
     * `mountDesktop()` / Shadow DOM 场景显式传.
     */
    readonly root?: DomRoot;
}

/**
 * 建一个元素.
 *
 * 一次调用 = 创建层(`tag` + `root`)+ 属性层 + 子节点.属性表的键就是 HTML 属性名;
 * 文本也是子节点.产出的 DOM 与手写 HTML 同构,所以下面每个例子都写出它生成的 HTML.
 *
 * ```ts
 * create_element(
 *     { tag: 'div' },                                     // 创建层:标签(字面量)
 *     {
 *         class: 'control-row',                           // -> class="..."
 *         role: 'group',                                  // -> 属性一律 setAttribute
 *         'aria-label': '半径',
 *     },
 *     '半径',                                              // 文本:字符串子节点
 *     create_element({ tag: 'span' }, { class: 'unit' }), // 子节点:嵌套
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
 * 真实调用点就是这个形状:`widgets/Switch.ts` 的 `createSwitch()` 把 `<input>`
 * 与 `<span class="slider">` 嵌进 `<label class="switch">`;`widgets/Row.ts` 的
 * `createFieldLabel()` 是最短的一版:
 *
 * ```ts
 * const label = create_element({ tag: 'label' }, {}, '半径');
 * label.htmlFor = 'ui-number-1';
 * // -> <label for="ui-number-1">半径</label>
 * ```
 *
 * HTML 上看不出来的有两件:
 *
 * - **返回类型随标签收窄**:`create_element({ tag: 'label' })` 给
 *   `HTMLLabelElement`(所以上面 `label.htmlFor` 不用 `as`),`{ tag: 'input' }`
 *   给 `HTMLInputElement`.这是 TS 内置的字面量表 `HTMLElementTagNameMap` 推出来的
 *   (它基本覆盖了当前稳定标准的 HTML 元素),**没有第二份签名兜底**:标签是
 *   运行期才知道的 `string` 时这里编译不过 -- 那种情况直接 `document.createElement`.
 * - **`root`**:决定节点由哪个 document 造出来(见上面的 `rootDocument()`),不传就用
 *   全局 `document`;`desktop/mountDesktop.ts` 显式传 `ownerDocument`.
 *
 * @param spec 创建层:标签名 + 根上下文
 * @param attributes 属性层:HTML 属性表,值必须是 string
 * @param children 结构层:子节点(文本写成字符串)
 */
export function create_element<K extends keyof HTMLElementTagNameMap>(
    spec: ElementSpec<K>,
    attributes: ElementAttributes = {},
    ...children: Child[]
): HTMLElementTagNameMap[K] {
    // 1. 建节点:root 只在创建层出现,由 rootDocument 决定用哪个 document.
    const doc = rootDocument(spec.root);
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

    return element;
}

/**
 * 把 `Child[]` 落成真节点(字符串 -> 文本节点,假值跳过).
 *
 * `create_element()` 内部走同一套规则;"先建容器,稍后再搬节点"的场景
 * (`mountDesktop` 的背景节点,`WindowManager` 的窗口正文)也要用它,所以单独
 * 导出,避免各写一份过滤逻辑而漏掉字符串/假值中的一种.
 *
 * 这里的 `root` 是位置参数而不是 spec:它没有属性表要分开,也没有变长子节点
 * 造成的歧义,没有合成对象的理由.
 */
export function childNodes(children: readonly Child[], root?: DomRoot): Node[] {
    const doc = rootDocument(root);
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
