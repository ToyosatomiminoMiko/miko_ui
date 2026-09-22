# `miko_ui`

GraphCalc 的网页 UI 库:**DOM 原语 + 响应式原语 + 控件 + 布局行 + 桌面窗口系统 +
编辑器外壳 + 主题**.它从应用里抽出来,只保留"结构与交互",不认识任何领域模型
(场景 IR、编译器、数学内核).

> 抽取过程、每个决策的理由与全部去耦合项见原仓库 `miko_graphcalc` 里的
> `docs/ui-library-extraction-plan.md`(本文件的每一节都能在那份计划里找到
> 出处).这份仓库是那个计划 P4 结束后的产物.

## 安装

```bash
npm install miko_ui
# 用到公式件(FormulaView / FormulaCopyController)时再装它;不用可以不装
npm install katex
```

包是**纯 ESM + 自带类型声明**,装完直接用,不需要消费者再编译 `node_modules`:

```ts
import { mountDesktop, signal } from 'miko_ui';
import 'miko_ui/styles.css';          // token + 控件 + 桌面,一次全要
// 或者按分组引:miko_ui/styles/tokens.css / widgets.css / desktop.css / editor.css
```

运行时依赖只有 `@preact/signals-core` 一个;`katex` 是可选 peer,只有引公式件
时才需要(它同时会在运行时引自己的 `katex/dist/katex.min.css`,所以用公式件时
KaTeX 的样式不用你手动引).

> **只面向打包器/浏览器**:`miko_ui` 的根入口会引 CSS,Node 原生 ESM 直接
> `import 'miko_ui'` 会因为无法加载 `.css` 报 `ERR_UNKNOWN_FILE_EXTENSION`.
> Vite / webpack / Next / Rollup 都没问题(它们把 CSS 当资源处理).要在 Node
> 侧做 SSR 或单元测试,请让测试环境带 CSS 处理(如 Vitest),或在 Node 里只引
> 具体子模块.

## 开发这个库

```bash
npm install
npm run dev           # 起 example/(Vite 会打印实际端口)
npm run typecheck
npm test              # 先跑边界守卫(pretest),再跑 vitest;不需要 Rust 工具链
npm run build         # 产出 dist/(JS + .d.ts);发版前由 prepack 自动跑
```

发版流程(含 npm org、Cloudflare 挡住网页时怎么注册、以及"不要只打 tag"这个坑)
单独写在 `RELEASING.md` —— 那份文件不在 `files` 白名单里,不会被发布出去。

## 用起来是什么样

```ts
import {
    DEFAULT_DESKTOP_CONFIG,   // 库自带的桌面默认值(换成你自己的即可)
    createControlGroup,
    createNumberField,
    createNumberRow,
    createSwitch,
    createSwitchRow,
    mountDesktop,
    signal,
} from 'miko_ui';
import 'miko_ui/styles.css'; // token + 控件 + 桌面样式;或按分组单独引

const radius = signal(0.2);
const visible = signal(true);

mountDesktop(document.getElementById('app')!, {
    ...DEFAULT_DESKTOP_CONFIG,
    content: (id) => (id === 'main'
        ? {
            body: [createControlGroup(
                '点',
                createSwitchRow('可见', createSwitch({ value: visible })),
                createNumberRow('半径', createNumberField({ value: radius })).row,
            )],
        }
        : { body: [] }),
});

// 状态只有一个来源:把它推给渲染层就行了
radius.subscribe((value) => renderer.setPointRadius(value));
```

要点:

- **宿主由库建**:`mountDesktop(root, spec)` 自己建窗口层 / 吸附预览 / Dock 与
  每个窗口的正文,消费者只给一个空容器与内容.页面里不需要任何 id 宿主.
- **状态绑定**:控件的 `value` 接受 `T | Signal<T>`.传普通值 = 传统行为;
  传 signal = 双向绑定(值变了控件自己更新,用户操作写回 signal).
- **样式只有类名**:库的样式表里没有 id 选择器,所以消费者不需要为库准备
  任何 id;token 层开放覆盖(`--color-*` / `--radius-*` 等).

## 公开面

`src/index.ts` 是**唯一**出口(`package.json` 的 `exports` 也只放它和
`./styles*`).按目录分组:

| 分组 | 内容 |
| --- | --- |
| `dom/` | `el` / `childNodes`(`Child` 类型)、`DomRoot` 与 `rootDocument`(root 注入)、`runLegacyEditorCommand` |
| `reactive/` | `signal` / `computed` / `effect` / `derivedSignal` / `onValueChange` / `isSignal` / `ValueSource` 工具 |
| `widgets/` | `Button` `Switch` `Segmented` `Slider` `NumberField` `Popover`,以及行级布局件 `Row`(`createRow` / `createNumberRow` / `createSwitchRow` / `createControlGroup` / `createInlineToggle` / `createFieldLabel`) |
| `shared/` | 键盘唯一出口 `KeyboardController`、唯一拖拽实现 `bindDragGesture`、行缓存 `KeyedRowList`、`numberText`、行外壳 `rowDom` |
| `desktop/` | `mountDesktop`、`WindowManager` / `WindowFrame` / `WindowGeometry` / `WindowResize` / `Dock` / `SnapPreview`、`windowSlotsProvider`、桌面配置类型与 `DEFAULT_DESKTOP_CONFIG` |
| `editor/` | `CodeEditor`(建整套编辑器外壳)、`EditorLineNumbers` / `EditorHighlight`(分词与槽宽由消费者注入)、`HIGHLIGHT_ENABLED_CLASS` |
| `feedback/` | `MessageList`(错误/警告列表,零领域依赖) |
| `formula/` | `createFormulaElement`(KaTeX;`katex` 是**可选** peer)、`FormulaCopyController` |
| `theme/` | `applyTheme(root, tokens)`、`DEFAULT_THEME_TOKENS` |
| `styles/` | `tokens.css`(默认主题,最先加载)、`widgets.css`、`desktop.css`、`styles.css`(总入口) |

## 边界契约(有机器守,不靠自觉)

`scripts/check_ui_boundary.mjs` 在每次 `npm test` 之前(走 `pretest`)跑八条
断言.这份脚本跟着库从 `miko_graphcalc` 搬了过来 —— 库分出去之后,那边不再有
库的源码,检查必须跟着库走.前三条断言在这里恒为 0(这个仓库里没有应用源码可
引用),留着是因为 `@/` 那条同时也是"库内不许用路径别名"的机器保证:

1. 库源码里没有 `@/contract` / `@/compiler` / `@/math` / `@/render` /
   `@/config/renderConfig`(库不认识领域模型);
2. 库源码与样式里没有 `@/config/uiConfig`(配置靠注入);
3. 库不引用应用源码的任何其它路径(`@/...` 一律不许);
4. 会被打包的库代码里没有 `getElementById`,也没有裸的 `document.` / `window.`
   (root 注入);
5. `styles/` 里没有 id 选择器(排除十六进制颜色与注释);
6. `dependencies` 只允许 `@preact/signals-core`;`peerDependencies` 只允许
   `katex`;
7. `exports` 只指向 `index.ts` 与 `styles/`,内部路径不进公开面;
8. 库里一次都没调用上游的批处理入口(更新路径不引调度器,见下).

`boundary_baseline.json` 是分家那一刻的存档(八条全 0),现在由本仓库的
`npm test`(走 `pretest`)守着:任何一条变正,测试直接失败.

## 三条设计约束(改动前先读)

1. **响应式层是薄封装**:消费者看不到 `@preact/signals-core`;换实现不该是
   破坏性变更.
2. **不用批处理、不引调度器**:`effect` 同步执行(`set()` 返回时订阅者已经跑
   完),所以库的更新路径不依赖 rAF/微任务 —— 这也是那套 900 行手写 DOM 桩
   还能继续用的前提.
3. **`root` 注入**:建节点、挂全局监听都从调用方给的 root 走,不读全局
   `document` / `window`;同页两个实例、嵌进别人的页面、Shadow DOM 都靠这一条.

## 测试

- 组件测试用库自带的 DOM 桩:`test/domStub.ts`(从应用侧复制一份,分家期间
  两边同步维护)与 `test/desktopFixture.ts`(窗口配置夹具).
- 库的测试**不引用应用源码**:`npm test` 在库里单独跑得绿,是"UI 与计算真的
  解耦了"最直接的证据(库的 job 不需要 wasm 工具链).

## 还没做的

附录 B.2 列的 7 类补件:`TextField` / `Menu` / `Splitter` / `ScrollArea` /
表格件 / `Dialog`·`Toast` / `Tooltip`.它们是新功能而不是"分离"的前置条件,
按普通排期补即可(该长成什么样取决于下一个真实消费者).
