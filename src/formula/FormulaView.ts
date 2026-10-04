/**
 * KaTeX 公式 DOM 工具.
 *
 * KaTeX 只负责把 LaTeX 字符串排版成 HTML;传入的 LaTeX 永远不要直接用
 * innerHTML 注入,统一走 `katex.render` 的转义输出.
 *
 * ## KaTeX 由库自带,渲染器可注入
 *
 * `katex` 是**本库的运行时依赖**(不是可选 peer):下游(计算器)规定不许直接依赖
 * katex,所以 LaTeX 的排版与样式(`katex/dist/katex.min.css`)都在这里一次做完,
 * 消费侧只从 `miko_ui` 取公式件.
 *
 * 随之而来的第二条:渲染器必须是**可注入出口**({@link setFormulaRenderer}).
 * DOM 桩 / SSR 里没有真 KaTeX 能用的排版 API,而消费者不该为了测试去 `vi.mock('katex')`
 * -- 那等于绕开库,恢复"下游直接依赖 katex"的老路.`testing/domStub.ts` 的
 * `installDomStub()` 会自动装上 {@link TEXT_FORMULA_RENDERER}(把 LaTeX 原样写成文本),
 * 所以下游测试里连一句 katex 都不用提.
 */
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { rootDocument, type DomRoot } from '../widgets/dom';

/**
 * @cache
 * 缓存目的:同一 LaTeX 字符串在重绘时反复出现,KaTeX 排版结果不变,
 * 直接 clone 模板,避免每次重绘都调用 katex.render 重建整棵 DOM.
 * 键/失效策略:LaTeX 字符串 -> 无 class 的 span 模板;先进先出,超过上限
 * 淘汰最早的一条--LaTeX 里可能拼进任意数值,键不是有限集合,必须有界.
 * 生命周期:模块级,跟随页面存活(换渲染器时整体清空,见 setFormulaRenderer).
 */
const formulaTemplateCache = new Map<string, HTMLElement>();

/**
 * 模板缓存上限:LaTeX 里可能拼进任意数值,键不是有限集合,不设上限就是只增不回收的
 * 泄漏;命中缓存就不必重建,容量取一个远大于单屏公式数的值即可.
 */
const FORMULA_TEMPLATE_CACHE_LIMIT = 512;

/** 可复制公式的屏幕阅读器名称(`aria-label` 不画 hover 浮层,标题类提示才画). */
const COPY_FORMULA_LABEL = '复制公式 TeX';

/**
 * 公式渲染器:把一段 LaTeX **排进**给定元素.
 *
 * 刻意只有两个参数(没有 KaTeX 的 `displayMode`):库的公开路径
 * ({@link createFormulaElement})只出**行内**公式,而模板缓存
 * ({@link formulaTemplateCache})的键只有 LaTeX --把 displayMode 放进签名就等于
 * 允许"同一串 LaTeX,两种排法"共用一份模板.真要做行间公式,得同时把它并进缓存键,
 * 那是另一件事,别在签名上先留个看不出来的口子.
 */
export type FormulaRenderer = (latex: string, element: HTMLElement) => void;

/**
 * 默认渲染器:真 KaTeX.`throwOnError: false` 让排不出来的公式退化成源码文本.
 */
function renderWithKatex(latex: string, element: HTMLElement): void {
    katex.render(latex, element, {
        displayMode: false,
        throwOnError: false,
        trust: false,
    });
}

/**
 * 文本替身渲染器:不排版,把 LaTeX 原样写进元素.
 *
 * 给测试与无排版环境用(手写 DOM 桩里真 KaTeX 跑不了):断言通常只关心"这一格
 * 是不是那段公式",原样回写就够,而且与消费者原先 `vi.mock('katex')` 的写法等价.
 * 不要在浏览器里用它 -- 屏幕上会直接看到 `\times10^{6}` 这种源码.
 */
export const TEXT_FORMULA_RENDERER: FormulaRenderer = (latex, element) => {
    element.textContent = latex;
};

let activeRenderer: FormulaRenderer = renderWithKatex;

/**
 * 换掉公式渲染器;传 `null` 还原真 KaTeX.
 *
 * 出口存在的理由见文件头:下游不许直接依赖 katex,所以"测试里怎么假渲染"这件事
 * 必须由库给出,而不是让每个消费者各写一份 `vi.mock('katex')`.
 *
 * 换渲染器时**必须清空**模板缓存:缓存键只认 LaTeX 字符串,渲染器一变,同一串
 * LaTeX 的产物也跟着变,留着旧模板会把替身的结果带进真 KaTeX 的会话里(反之亦然).
 */
export function setFormulaRenderer(renderer: FormulaRenderer | null): void {
    activeRenderer = renderer ?? renderWithKatex;
    formulaTemplateCache.clear();
}

function cacheTemplate(latex: string, template: HTMLElement): void {
    if (formulaTemplateCache.size >= FORMULA_TEMPLATE_CACHE_LIMIT) {
        const oldest = formulaTemplateCache.keys().next().value;
        if (oldest !== undefined) formulaTemplateCache.delete(oldest);
    }
    formulaTemplateCache.set(latex, template);
}

/** LaTeX -> 排版结果,写进传入元素.走当前渲染器,不直接调 katex. */
function renderLatex(
    latex: string,
    element: HTMLElement,
): void {
    activeRenderer(latex, element);
}

/**
 * 把公式直接渲染进**已有元素**(元素自身就是公式根节点).
 *
 * 元素自己承载 KaTeX 输出,而不是再套一层 span:调用方已给元素设好 class,
 * 多一层包裹只会让类名重复.
 *
 * 模板必须 **clone 而不是搬运**:`replaceChildren` 会把已经有父节点的子节点
 * 先从旧父节点摘除再插入,直接传 `template.childNodes` 会把缓存模板搬空,
 * 同一串 LaTeX 第二次渲染就是空白.
 */
function renderLatexInto(latex: string, element: HTMLElement): void {
    let template = formulaTemplateCache.get(latex);
    if (!template) {
        // 模板建在目标元素所属的 document 上:不读全局 document.
        template = element.ownerDocument.createElement('span');
        renderLatex(latex, template);
        cacheTemplate(latex, template);
    }
    const clone = template.cloneNode(true) as HTMLElement;
    element.replaceChildren(...clone.childNodes);
}

/**
 * LaTeX -> 公式 DOM.
 *
 * `copyable` 控制是否挂 `data-tex`(FormulaCopyController 的复制钩子):
 * - 可复制(缺省):需要鼠标与键盘都能取到原始 TeX 的公式;
 * - 不可复制:公式落在 `<details>` / `<summary>` 这类原生开合热区内时,
 *   点它是"展开/收起",不该顺手把 TeX 写进剪贴板.
 *
 * 可复制 = 可聚焦:除 `data-tex` 外补 `tabindex="0"` 与 `role`/`aria-label`,
 * 复制因此有键盘入口(FormulaCopyController 把 Enter/Space 规则注册进
 * KeyboardController).
 * 不可复制时这些属性一个都不加:可聚焦控件嵌在 `<summary>` 内部会造成
 * 嵌套交互元素.
 */
export function createFormulaElement(
    latex: string,
    className?: string,
    copyable = true,
    root?: DomRoot,
): HTMLElement {
    const element = rootDocument(root).createElement('span');
    if (className) element.className = className;
    renderLatexInto(latex, element);

    if (copyable) {
        element.dataset.tex = latex;
        element.tabIndex = 0;
        element.setAttribute('role', 'button');
        element.setAttribute('aria-label', COPY_FORMULA_LABEL);
    }
    return element;
}
