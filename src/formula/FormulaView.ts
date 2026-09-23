/**
 * KaTeX 公式 DOM 工具.
 *
 * KaTeX 只负责把 LaTeX 字符串排版成 HTML;传入的 LaTeX 永远不要直接用
 * innerHTML 注入,统一走 `katex.render` 的转义输出.
 */
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { rootDocument, type DomRoot } from '../dom/root';

/**
 * @cache
 * 缓存目的:同一 LaTeX 字符串在重绘时反复出现,KaTeX 排版结果不变,
 * 直接 clone 模板,避免每次重绘都调用 katex.render 重建整棵 DOM.
 * 键/失效策略:LaTeX 字符串 -> 无 class 的 span 模板;先进先出,超过上限
 * 淘汰最早的一条--LaTeX 里可能拼进任意数值,键不是有限集合,必须有界.
 * 生命周期:模块级,跟随页面存活.
 */
const formulaTemplateCache = new Map<string, HTMLElement>();

/**
 * 模板缓存上限.
 *
 * 常见公式的键是有限集合,但 LaTeX 里可能拼进任意数值,键不是有限集合;
 * 不设上限就是只增不回收的泄漏.命中缓存就不必重建,所以容量取一个
 * 远大于单屏公式数的值即可.
 */
const FORMULA_TEMPLATE_CACHE_LIMIT = 512;

/** 可复制公式的屏幕阅读器名称(`aria-label` 不画 hover 浮层,标题类提示才画). */
const COPY_FORMULA_LABEL = '复制公式 TeX';

function cacheTemplate(latex: string, template: HTMLElement): void {
    if (formulaTemplateCache.size >= FORMULA_TEMPLATE_CACHE_LIMIT) {
        const oldest = formulaTemplateCache.keys().next().value;
        if (oldest !== undefined) formulaTemplateCache.delete(oldest);
    }
    formulaTemplateCache.set(latex, template);
}

/** LaTeX -> 排版结果,写进传入元素.`throwOnError: false` 让排不出来的公式退化成源码文本. */
function renderLatex(
    latex: string,
    element: HTMLElement,
    displayMode = false,
): void {
    katex.render(latex, element, {
        displayMode,
        throwOnError: false,
        trust: false,
    });
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
