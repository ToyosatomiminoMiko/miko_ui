/**
 * 声明式建 DOM 的最小原语.
 *
 * 这一层只干一件事:把"标签 + 属性 + 子节点"写成一次函数调用,让上层可以用
 * 嵌套的表达式声明一棵树,而不是 `createElement` / `setAttribute` / `append`
 * 三行样板排成一片.
 *
 * 刻意不做的事:
 * - **不引入 JSX**:那需要改 `tsconfig`(`jsx`)与 `vite` 的编译链,与本项目
 *   "不引前端框架/构建插件"的取舍冲突;
 * - **不做虚拟 DOM / diff**:这里的树只在装配期建一次,之后由各控件自己
 *   `set()` 就地更新.没有"每帧重建再比对"的需求,就不该有那套运行时.
 *
 * 产出的 DOM 必须与手写 HTML 完全同构,类名沿用现有 CSS(见
 * `styles/widgets.css`),所以样式一个字符都不用改.
 */
import { rootDocument, type DomRoot } from '../dom/root';

/** 子节点:假值一律跳过,便于在声明里写 `cond && create_element(...)`. */
export type Child = Node | string | null | false | undefined;

export interface ElementOptions {
    /**
     * 建在哪个 document 上;不是 HTML 属性,不写进节点.不传用全局 `document`
     * (见 `dom/root.ts`),`mountDesktop()` / Shadow DOM 场景显式传.
     */
    root?: DomRoot;
    /**
     * 其余键一律 `setAttribute`:键就是属性名(`class` / `id` / `role` / `for` /
     * `type` / `aria-*` / `data-*` ...),值必须是 string.
     *
     * 类型上为了容纳 `root` 放宽到了 `string | DomRoot | undefined`,所以"值必须
     * 是 string"这条由运行时守:undefined 跳过,别的非 string 直接抛.
     */
    [attribute: string]: string | DomRoot | undefined;
}

/**
 * 建一个元素.
 *
 * 一次调用 = 标签 + 属性表 + 子节点.属性表的键就是 HTML 属性名;文本也是子节点.
 * 产出的 DOM 与手写 HTML 同构,所以下面每个例子都写出它生成的 HTML.
 *
 * ```ts
 * create_element(
 *     'div',                                              // 标签(字面量)
 *     {
 *         class: 'control-row',                           // -> class="..."
 *         role: 'group',                                  // -> 其余属性一律 setAttribute
 *         'aria-label': '半径',
 *     },
 *     '半径',                                              // 文本:字符串子节点
 *     create_element('span', { class: 'unit' }),          // 子节点:嵌套
 *     showUnit && create_element('strong'),               // 子节点:假值(null/undefined/false)跳过
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
 * const label = create_element('label', {}, '半径');
 * label.htmlFor = 'ui-slider-1';
 * // -> <label for="ui-slider-1">半径</label>
 * ```
 *
 * HTML 上看不出来的有两件:
 *
 * - **返回类型随标签收窄**:`create_element('label')` 给 `HTMLLabelElement`
 *   (所以上面 `label.htmlFor` 不用 `as`),`create_element('input')` 给
 *   `HTMLInputElement`.这是 TS 内置的字面量表 `HTMLElementTagNameMap` 推出来的
 *   (它基本覆盖了当前稳定标准的 HTML 元素),**没有第二份签名兜底**:标签是
 *   运行期才知道的 `string` 时这里编译不过 -- 那种情况直接 `document.createElement`.
 * - **`root`**:决定节点建在哪个 document 上(见 `dom/root.ts`),不传就用全局
 *   `document`;`desktop/mountDesktop.ts` 显式传 `ownerDocument`.
 * @param tag HTML 标签名
 * @param options 属性表;`root` 是保留键,不进 DOM
 * @param children 子节点(文本写成字符串)
 */
export function create_element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    options: ElementOptions = {},
    ...children: Child[]
): HTMLElementTagNameMap[K] {
    // 1. 建节点:root 从 options 里摘出来,不读全局 document(见 `dom/root.ts`).
    const { root, ...attributes } = options;
    const doc = rootDocument(root);
    const element = doc.createElement(tag);

    // 2. 属性一律 setAttribute:class 不特殊,和 id / role / aria-* 走同一条路.
    //    值必须是 string;undefined 跳过(可选属性常常是 undefined),别的类型
    //    直接抛 -- 否则会被 setAttribute 静默转成 "[object Object]".
    for (const [name, value] of Object.entries(attributes)) {
        if (value === undefined) continue;
        if (typeof value !== 'string') {
            throw new TypeError(`create_element('${tag}'): 属性 ${name} 的值必须是 string`);
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
 * `create_element()` 内部走同一套规则;"先建容器、稍后再搬节点"的场景
 * (`mountDesktop` 的背景节点、`WindowManager` 的窗口正文)也要用它,所以单独
 * 导出,避免各写一份过滤逻辑而漏掉字符串/假值中的一种.
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
 * 老写法把 id 当全局注册表用(`getElementById('pointValue')`),撞名或漏写
 * 都只在运行时静默出错.现在 id 只服务"标签关联"这一件事,由控件自己发,
 * 外部一律拿 handle 引用节点,不再按 id 查.
 */
export function nextWidgetId(kind: string): string {
    widgetSeq += 1;
    return `ui-${kind}-${widgetSeq}`;
}
