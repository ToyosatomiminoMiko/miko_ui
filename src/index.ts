/**
 * `miko_ui` 的公共 API 唯一出口.
 *
 * 约定:
 * - 包外的消费者**只**从 `miko_ui` 导入;`package.json` 的 `exports` 里 JS 入口
 *   只放这一个(其余条目是样式表),内部路径(`miko_ui/src/...`)不是公开面,
 *   重构时不必对外兼容.
 * - 这里尽量用 `export *`,不再抄一遍名字:抄一遍的代价是"新增一个件忘了导出"
 *   这种只在运行期炸的错,而 `export *` 的重名冲突在 `tsc` 就会报.唯一的例外是
 *   `./widgets/dom`(要挡住两个库内名字,见下).
 */

// 响应式层:控件的值参数可以传 signal
export * from './reactive';

// DOM 原语与通用小件.
//
// 这一行是唯一的例外,**不能**写 `export *`:同一个文件里还住着库内的根上下文
// 口径(`DomRoot` / `rootDocument`),`export *` 会把它们一起放出去.消费者手上已经
// 有 `Document` / `ShadowRoot`,直接填进 `create_element({ tag, root })` 或
// `CodeEditorOptions.root` 就行,不需要命名那个类型,也不需要自己换算(下游已确认
// 零引用).逐个列名的代价是"新增一个导出件要记得补一行" -- 这是不公开根上下文
// 必须付的账,别把这一行改回 `export *`.
export { childNodes, create_element, nextWidgetId } from './widgets/dom';
export type { Child, ElementAttributes, ElementSpec } from './widgets/dom';
export * from './widgets/Button';
export * from './widgets/Switch';
export * from './widgets/Segmented';
export * from './widgets/RangeInput';
export * from './widgets/Slider';
export * from './widgets/NumberField';
export * from './widgets/Popover';
export * from './widgets/MenuItem';
export * from './widgets/Menu';
export * from './widgets/Row';

// 共享交互层:键盘唯一出口 / 唯一拖拽实现 / 行缓存 / 数值与行外壳
export * from './shared/KeyboardController';
export * from './shared/dragGesture';
export * from './shared/keyedRowList';
export * from './shared/numberText';
export * from './shared/rowDom';

// 桌面窗口系统
export * from './desktop/types';
export * from './desktop/mountDesktop';
export * from './desktop/windowSlots';
export * from './desktop/WindowGeometry';
export * from './desktop/WindowFrame';
export * from './desktop/WindowManager';
export * from './desktop/WindowResize';
export * from './desktop/Dock';
export * from './desktop/SnapPreview';

// 反馈件:消息/诊断列表(零领域依赖)
export * from './feedback/MessageList';

// 编辑器外壳:分词与配色由消费者注入
export * from './editor/EditorLineNumbers';
export * from './editor/CodeEditor';
export * from './editor/EditorHighlight';

// 主题与公式件(公式件用 KaTeX,是可选 peer)
export * from './theme/tokens';
export * from './formula/FormulaView';
export * from './formula/FormulaCopyController';
