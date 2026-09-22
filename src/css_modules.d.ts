/**
 * 库里的 CSS 副作用导入声明.
 *
 * 目前只有一处:`formula/FormulaView.ts` 引 KaTeX 的样式表.库不该假设消费者
 * 用 Vite 构建(那样就得依赖 `vite/client` 的类型),所以这里用一个最小的
 * 环境声明把 `*.css` 收下 —— 效果与 `vite/client` 在这一点上一致,但不引入
 * 任何构建工具的类型.
 */
declare module '*.css';
