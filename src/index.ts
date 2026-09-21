/**
 * `@miko/ui` 的公共 API 唯一出口.
 *
 * 约定(docs/ui-library-extraction-plan.md §9 的形态断言):
 * - 包外的消费者**只**从 `@miko/ui` 导入;`package.json` 的 `exports` 也只放
 *   这一个入口,内部路径(`@miko/ui/src/...`)不是公开面,重构时不必对外兼容.
 * - 这里一律用 `export *`,不再抄一遍名字:抄一遍的代价是"新增一个件忘了导出"
 *   这种只在运行期炸的错,而 `export *` 的重名冲突在 `tsc` 就会报.
 *
 * P0 阶段只有已搬进库的目录在这里登记(`widgets/ shared/ desktop/ theme/
 * formula/`);`editor/` `diagnostics/` 会在 P2(D6)之后补进来.
 */

// 响应式层(U3 = B,U7 = vendored):控件的值参数可以传 signal
export * from './reactive';

// DOM 原语与通用小件
export * from './dom/root';
export * from './dom/legacyCommand';
export * from './widgets/dom';
export * from './widgets/Button';
export * from './widgets/Switch';
export * from './widgets/Segmented';
export * from './widgets/Slider';
export * from './widgets/NumberField';
export * from './widgets/Popover';
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

// 编辑器外壳:分词与配色由消费者注入(D6)
export * from './editor/EditorLineNumbers';
export * from './editor/CodeEditor';
export * from './editor/EditorHighlight';

// 主题与公式件(公式件用 KaTeX,是可选 peer)
export * from './theme/tokens';
export * from './formula/FormulaView';
export * from './formula/FormulaCopyController';
