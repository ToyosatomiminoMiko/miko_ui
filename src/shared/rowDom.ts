/**
 * 行 DOM 的通用件:行外壳,行末动作容器,显隐按钮,展开态搬运.
 *
 * 建元素本身不在这里 -- 统一走 `widgets/dom.ts` 的 {@link create_element},
 * 与其它控件同一套原语.这里只剩真正共用的**行结构**:
 *
 * - {@link createObjectRow}:行外壳(`<article>` + `.row-main` + 行末动作容器);
 * - {@link createRowActions}:行末动作容器;
 * - {@link createVisibilityButton}:行末**显隐按钮**;
 * - {@link carryDetailsOpen}:行被替换时带走 `<details>` 展开态.
 *
 * 开合与显隐分工明确,不要混在一起:
 * - **开合**由 `<details>/<summary>` 原生行为承担,行里没有自建开合按钮;
 * - **显隐切换**是业务动作,由 {@link createVisibilityButton} 生成,与其它动作
 *   一起放进 {@link createRowActions} 容器,挂在行(`<article>`)的**末位**,
 *   与主内容包装 `.row-main` 平级,**不在 `<summary>` 里**--点它不会连带开合
 *   细节,也不需要 stopPropagation.
 */
import { createButton } from '../widgets/Button';
import { create_element } from '../widgets/dom';

/**
 * 行外壳:`<article class="object-row <rowClass>">`,内容分两层.
 *
 * ```text
 * <article class="object-row <rowClass>" role="listitem">
 *   <div class="row-main">...</div>          ← 除行末动作外的全部内容
 *   <div class="row-actions">                ← 行末,靠右
 *     <button class="row-visibility-btn">隐藏</button>
 *   </div>
 * </article>
 * ```
 *
 * 为什么要有 `.row-main` 这层包装:动作区要**贴右**,而一行里除它以外的内容
 * 本身还要横向排列/换行.把内容收进一个包装层后,行的直接子节点只剩
 * "主内容 + 动作"两个:
 * - 动作容器在 DOM 里就是**最后一个**直接子节点(不做 `order` 之类的视觉错位,
 *   读屏/键盘顺序与视觉一致);
 * - 主内容占住行内其余宽度,动作区自然被推到右端;
 * - 动作容器与 `.row-main` 平级,因此仍在 `<summary>` 之外,点按钮只触发动作.
 *
 * 动作容器由 {@link createRowActions} 生成;`actions` 为 null(调用方不需要任何
 * 行末动作)时不挂容器,`.row-main` 独占整行.
 */
export function createObjectRow(
    rowClass: string,
    actions: HTMLElement | null,
): { readonly row: HTMLElement; readonly main: HTMLElement } {
    const row = create_element({ tag: 'article' }, { class: `object-row ${rowClass}` });
    row.setAttribute('role', 'listitem');
    const main = create_element({ tag: 'div' }, { class: 'row-main' });
    row.append(main);
    if (actions !== null) row.append(actions);
    return { row, main };
}

/**
 * 行末动作容器:把一行里除主内容外的全部动作收成**一个**直接子节点.
 *
 * 为什么不是"再来一个按钮兄弟":`createObjectRow` 的骨架是"主内容 + 行末动作",
 * 直接子节点数量稳定成两个,不必为每多一个动作就调一次行布局.空动作
 * (null/false)直接跳过,便于在声明里写 `cond && button`.
 *
 * 容器内的顺序就是视觉顺序:调用方按希望出现的先后传入(例:显隐按钮放末位,
 * 保持"显隐按钮在行末"这条位置语义).
 */
export function createRowActions(
    ...actions: Array<HTMLElement | null | false | undefined>
): HTMLElement {
    const container = create_element({ tag: 'div' }, { class: 'row-actions' });
    for (const action of actions) {
        if (action) container.append(action);
    }
    return container;
}

/**
 * 显隐按钮:按 `enabled` 决定文案(可见时"隐藏",已隐藏时"显示"),点击交给
 * `onToggle`.
 *
 * 这不是折叠按钮(开合交给 `<summary>`):文案给的是**下一步动作**,当前状态由
 * 消费者在行/容器上表达;`aria-label` 拼上传入的 `label`,读屏不必靠上下文猜
 * 操作的是哪一条.经 {@link createRowActions} 收进行末动作容器(通常放末位),
 * 与主内容包装 `.row-main` 同级,不在 `<summary>` 里,因此点按钮只切换显隐,
 * 不会顺手开合细节.
 *
 * 每次重建行都会新建一个按钮(调用方按内容键复用/替换整行),它随被丢弃的行
 * 一起消失,所以这里只返回元素,不返回句柄 -- 生命周期跟行绑定,没有需要
 * 单独 `dispose` 的持有者.
 */
export function createVisibilityButton(
    enabled: boolean,
    label: string,
    onToggle: () => void,
): HTMLButtonElement {
    const action = enabled ? '隐藏' : '显示';
    const button = createButton({
        class: 'row-visibility-btn',
        text: action,
        ariaLabel: `${action} ${label}`,
    });
    button.onClick(onToggle);
    return button.element;
}

/**
 * 行被替换时把 `<details>` 的展开态带到新行上.
 *
 * 内容变化必然重建行,但"用户把它展开了"这件事与内容无关,不该在内容刷新(如
 * 拖动滑块触发的每帧重建)时被重置.任一行没有 `<details>` 时什么都不做.
 */
export function carryDetailsOpen(from: HTMLElement, to: HTMLElement): void {
    const before = from.querySelector<HTMLDetailsElement>('details');
    if (before === null) return;
    const after = to.querySelector<HTMLDetailsElement>('details');
    if (after !== null) after.open = before.open;
}
