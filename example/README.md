# `@miko/ui` 最小示例

这是 `docs/ui-library-extraction-plan.md` §8 里 **P1 的验收物**,P4 之后又补上了
样式的一环:一个只 import 库的页面。它存在的意义不是好看,而是把"库能被外部
消费"从 grep 断言变成**可运行的代码**。

```bash
# miko_ui 仓库根目录
npm run dev             # Vite 会打印实际端口
```

## 它证明了什么

| 断言 | 这份示例里对应的事实 |
| --- | --- |
| 宿主方向已反转(D1) | `index.html` 只有一个 `<div id="app">`,`mountDesktop()` 自己建窗口层 / 吸附预览 / Dock / 每个窗口的正文 |
| 配置已注入(D4) | 窗口清单、动作、夹取常量来自 `DEFAULT_DESKTOP_CONFIG`;消费者可以整份换掉 |
| root 注入(D7) | 库内不读全局 `document` / `window`;本示例没有为库提供任何全局钩子 |
| 库不依赖应用源码 | 这个目录的 import 里没有一条 `@/...`;`example/` 也不在 `src` 的依赖图里 |
| **样式随库走**(P4/D8) | `import '@miko/ui/styles.css'` 就是全套默认主题(色板/圆角/控件/窗口外壳);本目录的 CSS 只剩页面级规则与示例内容 |
| **状态绑定**(P3) | 控件直接绑 signal:`createNumberField({ value: radiusSignal })`,没有 `onChange` + `set()` 的手工回路 |

## 它不证明什么

- **代码编辑器**:库只提供 `EditorLineNumbers` / `EditorHighlight`(收节点),
  编辑器的 DOM 结构与它的结构样式仍在消费者手里。
- **Shadow DOM**:`mountDesktop(root)` 收一个元素,`root` 换成 `shadowRoot` 的宿主
  即可,但示例没有演示这一步。
- **完整控件集**:附录 B.2 列的 7 类件(TextField / Menu / Splitter / ScrollArea /
  表格件 / Dialog·Toast / Tooltip)还没有,见计划 P4。

## 目录

```text
example/
  index.html      只有一个 #app 的页面
  main.ts         窗口清单 + 内容装配 + 控件接线(signal)
  example.css     页面级规则 + 示例内容样式(库的样式在 @miko/ui/styles.css)
  vite-env.d.ts   CSS import 的类型声明
```
