/**
 * `miko_ui` 的公共 API 唯一出口.
 *
 * 约定:
 * - 包外的消费者**只**从 `miko_ui` 导入;`package.json` 的 `exports` 里 JS 入口
 *   只放这一个(其余条目是样式表),内部路径(`miko_ui/src/...`)不是公开面,
 *   重构时不必对外兼容.
 * - 这里一律用 `export *`,不再抄一遍名字:抄一遍的代价是"新增一个件忘了导出"
 *   这种只在运行期炸的错,而 `export *` 的重名冲突在 `tsc` 就会报.
 */

// 响应式层:控件的值参数可以传 signal
export * from './reactive';

// DOM 原语与通用小件
export * from './dom/root';
export * from './widgets/dom';
export * from './widgets/Button';
export * from './widgets/Switch';
export * from './widgets/Segmented';
export * from './widgets/RangeInput';
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

// 编辑器外壳:分词与配色由消费者注入
export * from './editor/EditorLineNumbers';
export * from './editor/CodeEditor';
export * from './editor/EditorHighlight';

// 主题与公式件(公式件用 KaTeX,是可选 peer)
export * from './theme/tokens';
export * from './formula/FormulaView';
export * from './formula/FormulaCopyController';
