/**
 * 行,小节与行内小件:把"文字 + 控件"的三种常见排布收成函数.
 *
 * 类名固定,调用方不给:
 * - `.control-row`:"文字 + 控件"的行,相机行与各小节的行共用同一条规则,
 *   调用方没有"传哪个类名"的选择;
 * - `.control-group` / `.control-title`:小节容器与标题;
 * - `.control-toggle-group`:行内小开关组(X/Y/Z 标签,网格 XZ/XY/YZ).
 *
 * 可见文字一律做成 `<label for>` 而不是 `<span>`:
 * - `.control-row` 的字号/颜色是**继承**的,`<label>` 与 `<span>` 渲染无差别;
 * - 但 `<label for>` 把可访问名给了控件,点文字也能切换开关 -- 纯 `<span>`
 *   标签则两者都做不到.
 *
 * 用这些件时,**控件不要再给 `aria-label`**:可见标签已经命名了它.
 */
import { create_element, nextWidgetId, type Child } from './dom';
import type { NumberFieldHandle } from './NumberField';
import type { SwitchHandle } from './Switch';

/**
 * 建一个与控件关联的可见标签.
 *
 * 关联走 `htmlFor` 属性(真 DOM 会把它反射成 `for` 属性).
 */
export function createFieldLabel(text: string, forId: string): HTMLLabelElement {
    const label = create_element('label', {}, text);
    label.htmlFor = forId;
    return label;
}

/**
 * 小节:`<section class="control-group" aria-labelledby=标题id>`,标题是
 * `<header class="control-title">`.
 *
 * 用 `aria-labelledby` 而不是让标题纯做视觉:一个 `<section>` 有可访问名之后
 * 才成为读屏可跳转的 region,标题文字也就顺带成了这一块的名字.
 */
export function createControlGroup(title: string, ...children: Child[]): HTMLElement {
    const titleId = nextWidgetId('control-title');
    const header = create_element('header', { class: 'control-title' }, title);
    header.id = titleId;
    return create_element(
        'section',
        { class: 'control-group', 'aria-labelledby': titleId },
        header,
        ...children,
    );
}

/** 行容器:`<div class="control-row">...</div>`. */
export function createRow(...children: Child[]): HTMLDivElement {
    return create_element('div', { class: 'control-row' }, ...children);
}

/** 一行"文字 + 开关":`<div class="control-row"><label for>文字</label>开关</div>`. */
export function createSwitchRow(text: string, toggle: SwitchHandle): HTMLDivElement {
    return createRow(createFieldLabel(text, toggle.input.id), toggle.element);
}

/**
 * 一行"文字 + 数字":数字框沿用 CSS 的 `margin-left:auto` 贴右.
 *
 * 返回标签节点是给需要随模式改文案的调用方(如"大小" / "缩放"),
 * 拿到它即可改文案,不必再按 id 去查.
 */
export function createNumberRow(
    text: string,
    field: NumberFieldHandle,
): { row: HTMLDivElement; label: HTMLLabelElement } {
    const label = createFieldLabel(text, field.input.id);
    const row = createRow(label, field.element);
    return { row, label };
}

/** 行内小开关组(`.control-toggle-group`):"标签 X/Y/Z"与"网格 XZ/XY/YZ". */
export function createInlineToggle(text: string, toggle: SwitchHandle): HTMLDivElement {
    return create_element(
        'div',
        { class: 'control-toggle-group' },
        createFieldLabel(text, toggle.input.id),
        toggle.element,
    );
}
