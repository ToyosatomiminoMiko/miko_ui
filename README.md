# `miko_ui`

未正式立项
阶段: demo

GraphCalc 的 Web UI 库:**DOM 原语 + 响应式原语 + 控件 + 布局行 + 桌面窗口系统 +
编辑器外壳 + 主题**.它从应用里抽出来,只保留"结构与交互".

> 抽取过程,每个决策的理由与全部去耦合项见原仓库 `miko_graphcalc` 里的
> `docs/ui-library-extraction-plan.md`(本文件的每一节都能在那份计划里找到
> 出处).这份仓库是那个计划 P4 结束后的产物.

## 取用:主链路是 release 产物;另有对外的 npm 包

本库同时服务
[miko_graphcalc](https://github.com/ToyosatomiminoMiko/miko_graphcalc) 与
[ToyosatomiminoMiko.github.io](https://github.com/ToyosatomiminoMiko/ToyosatomiminoMiko.github.io)
两个应用仓库,两边拿的是同一份产物;此外它**也发布到 npm**,服务"别人也想
`npm install`"的场景.两条链路互不干扰:

| 链路 | 触发 | 形态 | 谁在用 |
| --- | --- | --- | --- |
| **滚动 release 资产**(主) | 推到 `main` | `miko_ui_dist.tar.gz`,挂在 tag `ui-latest` 上,内容被覆盖 | 上面那两个应用仓库 |
| **npm 包**(对外) | 推 `v*` tag | registry 上的 `miko_ui@<version>`,带 provenance | 外部消费者 |

npm 那条链路走 **OIDC 信任发布**(无长期 token,不需要账号 2FA),细节见
`RELEASING.md`.下面这一节讲的是主链路,也就是两个应用仓库用的那份.

交付形态是**一个滚动 release 资产**:

```text
https://github.com/ToyosatomiminoMiko/miko_ui/releases/download/ui-latest/miko_ui_dist.tar.gz
```

main 每次推送后,`.github/workflows/release.yml` 把包根(`dist/` + `styles/` +
`LICENSE` + **运行期清单** `package.json`)打成 `miko_ui_dist.tar.gz` 挂到 tag
`ui-latest`;清单里的 `gitHead` 记着构建它的那个 commit,消费者的
`scripts/fetch_ui.sh` 每次构建拿它比 `ui-latest` 指向的 commit(落后就自动重取),
然后下载 -> 校验 -> 解开到 `.cache/miko_ui/current`,再用一条本地依赖接进来:

```json
"@miko/ui": "file:.cache/miko_ui/current"
```

于是应用里的 `import '@miko/ui'` 解析到的是**构建产物** `dist/index.js` +
`dist/index.d.ts`(纯 ESM + 自带类型声明),消费者机器上**没有 TypeScript,也没有
本库的源码**:

```ts
import { mountDesktop, signal } from '@miko/ui';
import '@miko/ui/styles.css';          // token + 控件 + 桌面,一次全要
// 或者按分组引:@miko/ui/styles/tokens.css / scrollbar.css / widgets.css / desktop.css / editor.css / feedback.css
```

> `@miko/ui` 只是应用侧给这条 `file:` 依赖起的名字,目录里的包名仍是 `miko_ui`.
> 公开面由 `package.json` 的 `exports` 定义,与包名无关.

运行时依赖只有 `@preact/signals-core` 一个;`katex` 是可选 peer,只有引公式件时才
需要(它同时会在运行时引自己的 `katex/dist/katex.min.css`,所以用公式件时 KaTeX
的样式不用你手动引).**应用侧自己声明这两个依赖**:资产里没有 `node_modules`,
而且"`file:` 链接的传递依赖装不装"取决于目标目录在不在应用根内(npm 实测:根内会
装,根外不装).把它写成应用自己的依赖,行为才不依赖这个细节,也才能保证全程只有
一份实例 -- 两个应用仓库都是这么写的.

> **只面向打包器/浏览器**,两条原因(与交付形态有关,见 `RELEASING.md`):
>
> 1. 根入口会引 CSS(`formula/FormulaView` 引 `katex/dist/katex.min.css`),Node
>    原生 ESM 加载不了 `.css`(`ERR_UNKNOWN_FILE_EXTENSION`);
> 2. 库内写无扩展名相对导入(`from './reactive'`),`tsc` 原样输出 -- 只有打包器
>    的解析器会补 `.js` / `/index.js`,Node 原生 ESM 会 `ERR_MODULE_NOT_FOUND`.
>
> Vite / webpack / Next / Rollup 都没问题(它们既解析无扩展名,又把 CSS 当资源).
> 要在 Node 侧做 SSR 或单元测试,请让测试环境带 CSS 处理(如 Vitest).**没有**
> "在 Node 里只引具体子模块"这条路:`exports` 只暴露根入口与 `styles/`,内部路径
> 不是公开面(见下面的"边界契约"第 7 条).

## 开发这个库

```bash
npm ci                # 或 npm install(会跑 prepare -> 完整的 npm run build)
npm run dev           # 只产出 dist/ 再起 example/(不跑检查,开发循环快)
npm run typecheck     # tsconfig.json:src + test + example,带 noUnusedLocals/Parameters
npm test              # 边界守卫 + vitest
npm run build         # 生产闸门:= build:dist + typecheck + test,全绿再推
npm run build:dist    # 只 clean + tsc 产出 dist/(给 dev 用的裸构建)
```

`build` = **推生产前那一条**:`build:dist`(clean + tsc 写 `dist/`)-> `typecheck`
(src + test + example)-> `test`(边界守卫 + vitest).它绿了就代表"能构建 + 类型全对 +
测全绿",CI 与消费者脚本跑的是同一条.

`build:dist` 是里面的裸构建(`dev` 用它,跳过检查换启动速度);`build` 只是把它和
检查串起来 -- 想知道"只产出产物"和"产物 + 检查"分别是什么,看这两条就够.

`typecheck` 排在**产出之后**不是笔误:`tsconfig.json` 收了 `example/**`,而 example
通过包名自引用 `miko_ui`,类型只来自 `dist/index.d.ts`(exports 指向产物).先
`clean` 再查类型,只会查出一串"找不到模块"的假错误.

代价是 `prepare` = `npm run build && git config --local core.hooksPath .githooks`,
所以 `npm ci` 会顺带跑一遍检查(本仓库自己,以及出 release 资产的 CI 都会付这份
时间;消费侧不构建库,所以不受影响).末尾那条只做一件小事:把 `core.hooksPath`
设成版本库里的 `.githooks/`,让提交前自动跑 `scripts/autorun.py` 转换全角标点
(详见该文件顶部注释),它要求当前目录是 git 仓库 -- 开发 clone 与 CI 的 checkout
都满足;发布资产里没有 `scripts` 字段,消费侧根本不会跑到 `prepare`.

提交前那次转换是就地改写工作区文件,再自动 `git add` 回暂存区,所以 `git status`
未必看得到差异.临时跳过某次提交用 `git commit --no-verify`.

每一条只做命令里写出来的事:没有 `pre*` 隐式钩子(唯一的例外是 `prepare`,它是
npm 的生命周期 -- 原因见下面"边界契约").

改依赖后重建 `package-lock.json` 之前,先读 `.github/workflows/ci.yml` 顶部的
"库侧依赖/交付契约":用 `npm install --package-lock-only` 会丢掉跨平台可选依赖,
而 CI 的 npm 11 会因此直接拒掉 `npm ci`(本地 npm 10 看不出来).

改完推到 `main` 就够了:`.github/workflows/release.yml` 会重新出一次资产,消费者
下次取产物时拿到(那边 `npm run ui:update`,CI 则是每次干净下载).交付细节,以及
"发布必须先于消费者改动上线"的顺序,写在 `RELEASING.md`.

## 用起来是什么样

```ts
import {
    DEFAULT_DESKTOP_CONFIG,   // 只给"每个桌面都成立"的量:动作 / 余量 / z / 吸附
    createControlGroup,
    createNumberField,
    createNumberRow,
    createSwitch,
    createSwitchRow,
    mountDesktop,
    signal,
    type WindowConfigEntry,
} from 'miko_ui';
import 'miko_ui/styles.css'; // token + 控件 + 桌面样式;或按分组单独引

const radius = signal(0.2);
const visible = signal(true);

// 窗口是应用特有的(标题 / dock 文案 / 几何锚点);库的默认配置里没有窗口,
// 这份清单由消费者给,库不替任何应用预设 main / side 之类的窗口.
const windows: readonly WindowConfigEntry[] = [
    {
        id: 'main',
        title: '参数',
        dock: { label: '参数' },
        defaultGeometry: {
            x: { at: 16 },
            y: { at: 16 },
            w: { at: 420 },
            h: { fraction: 0.68, of: 'usableHeight' },
        },
        minSize: { w: 280, h: 200 },
    },
];

mountDesktop(document.getElementById('app')!, {
    ...DEFAULT_DESKTOP_CONFIG,
    windows,
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
- **滚动条是单独的一条规定**:滚动容器挂上 `ui-scrollbar` 类,就得到统一的细
  滚动条(`styles/scrollbar.css`).这条规定只认这一个类名,不认识任何组件,也
  不被任何组件引用 -- 删掉它,库的其余部分是完整的.取值只来自 token
  (`--scrollbar-size` / `--color-scrollbar*`),换主题不用动组件.
- **几何写锚点,不写数字**:`w` 上的 `split` 描述"把居中区域等分成并排的
  几块"(第 `index` 块自己算宽度与 x,整排居中),`after: { id, gap }` 描述"y 接在
  另一个窗口下方".两者都按当前桌面算 px,所以在 1280 与 1920 上都成立;`clamp`
  只做夹取,不会对半分,也没有"整排居中"这回事.
- **相对定位在初始化前就换算完**:消费者写的是 `RelativeGeometry`(锚点,可能以
  桌面尺寸或别的窗口为参照),窗口拿到的是 `AbsoluteGeometry`(`x/y/w/h` 四个具体
  像素).两段之间的桥是纯函数 `resolveRelativeGeometries(windows, desktop)` --
  `WindowManager` 在 `bind()` 里一次调用它,然后再建窗口,所以**窗口那一侧不认识
  锚点**.依赖(`after`)由这个函数内部解,窗口清单不必按依赖序排好.
  `RelativeGeometry` 的四个轴都是必填,某个锚点会盖掉同轴另一项时写占位值
  (如并排时 `x: 'center'`),类型里不存在"这个轴没写"的分支.

## 公开面

`src/index.ts` 是**唯一**出口(`package.json` 的 `exports` 也只放它和
`./styles*`).按目录分组:

| 分组 | 内容 |
| --- | --- |
| `widgets/dom.ts` | `create_element({ tag, root }, attributes, ...children)` / `childNodes`(`Child` 类型) / `nextWidgetId`,`ElementSpec` 与 `ElementAttributes`(创建层与属性层分开);同在这一个文件里的 `DomRoot` / `rootDocument`(root 注入)是**库内口径**,不从 `miko_ui` 导出 |
| `reactive/` | `signal` / `computed` / `effect` / `derivedSignal` / `onValueChange` / `isSignal` / `ValueSource` 工具 |
| `widgets/` | `Button` `Switch` `Segmented` `RangeInput`(裸滑杆),`Slider`(系数滑块:名称 + 滑杆 + 数值框 + 重置按钮),`NumberField` `Popover`,`MenuItem`(菜单项)与 `Menu`(菜单:分组 + 当前项 + 开合;常驻显示或任意按钮触发),以及行级布局件 `Row`(`createRow` / `createNumberRow` / `createSwitchRow` / `createControlGroup` / `createInlineToggle` / `createFieldLabel`) |
| `shared/` | 键盘唯一出口 `KeyboardController`,唯一拖拽实现 `bindDragGesture`,行缓存 `KeyedRowList`,`numberText`,行外壳 `rowDom` |
| `desktop/` | `mountDesktop`,`WindowManager` / `WindowFrame` / `WindowGeometry` / `WindowResize` / `Dock` / `SnapPreview`,`windowSlotsProvider`,桌面配置类型与 `DEFAULT_DESKTOP_CONFIG` |
| `editor/` | `CodeEditor`(建整套编辑器外壳),`EditorLineNumbers` / `EditorHighlight`(分词与槽宽由消费者注入),`HIGHLIGHT_ENABLED_CLASS` |
| `feedback/` | `MessageList`(错误/警告列表,零领域依赖) |
| `formula/` | `createFormulaElement`(KaTeX;`katex` 是**可选** peer),`FormulaCopyController` |
| `theme/` | `applyTheme(root, tokens)`,`DEFAULT_THEME_TOKENS` |
| `styles/` | `tokens.css`(默认主题,最先加载),`scrollbar.css`(独立的滚动条规定:滚动容器挂 `.ui-scrollbar`),`widgets.css`(含行外壳 `.object-row`/`.row-main`/`.row-actions`),`desktop.css`,`editor.css`,`feedback.css`(`.diagnostic*`,复制反馈的 `.is-copied`/`.is-error`),`styles.css`(总入口) |

## 边界契约(有机器守,不靠自觉)

`npm test` 先跑 `scripts/check_ui_boundary.mjs`(八条断言),再跑 vitest;两条
都写在 `test` 脚本里,不是隐式钩子.这份脚本跟着库从 `miko_graphcalc` 搬了过来
-- 库分出去之后,那边不再有库的源码,检查必须跟着库走.前三条断言在这里恒为
0(这个仓库里没有应用源码可引用),留着是因为 `@/` 那条同时也是"库内不许用路径
别名"的机器保证:

1. 库源码里没有 `@/contract` / `@/compiler` / `@/math` / `@/render` /
   `@/config/renderConfig`(库不认识领域模型);
2. 库源码与样式里没有 `@/config/uiConfig`(配置靠注入);
3. 库不引用应用源码的任何其它路径(`@/...` 一律不许);
4. 会被打包的库代码里没有 `getElementById`,也没有裸的 `document.` / `window.`
   (root 注入);
5. `styles/` 里没有 id 选择器(排除十六进制颜色与注释);
6. `dependencies` 只允许 `@preact/signals-core`;`peerDependencies` 只允许
   `katex`;
7. `exports` 只指向构建产物(`dist/index.js` + `dist/index.d.ts`)与 `styles/`,
   内部路径不进公开面;
8. 库里一次都没调用上游的批处理入口(更新路径不引调度器,见下).

八条都是硬断言,全部必须为 0:任何一条出现违例,`npm test` 直接失败,没有
baseline,也没有"允许的例外".

另有一条**测试级**契约,守的是样式归属而不是耦合:`test/emittedClasses.test.ts`
断言"库**产出的每个类名**,库的样式表里要么有默认规则,要么在
`INTENTIONAL_HOOKS` 里显式声明它只是定位钩子(带理由)".背景是
`MessageList` / `rowDom` / `FormulaCopyController` 曾经产出
`.diagnostic*` / `.object-row` / `.row-main` / `.row-actions` /
`.is-copied` / `.is-error` 却没有配套样式,消费者于是被迫给库的类写外观 --
而消费侧的 `styleLayers.test.ts` 恰好禁止这件事.这条断言让"游离的类名"不可能
再悄悄漂出来:新增一个产出而不给样式,CI 就会红.

## 三条设计约束(改动前先读)

1. **响应式层是薄封装**:消费者看不到 `@preact/signals-core`;换实现不该是
   破坏性变更.
2. **不用批处理,不引调度器**:`effect` 同步执行(`set()` 返回时订阅者已经跑
   完),所以库的更新路径不依赖 rAF/微任务 -- 这也是那套 900 行手写 DOM 桩
   还能继续用的前提.
3. **`root` 注入**:建节点,挂全局监听都从调用方给的 root 走,不读全局
   `document` / `window`;同页两个实例,嵌进别人的页面,Shadow DOM 都靠这一条.

## 测试

- 组件测试用库自带的 DOM 桩:`test/domStub.ts`(从应用侧复制一份,分家期间
  两边同步维护)与 `test/desktopFixture.ts`(窗口配置夹具).
- 库的测试**不引用应用源码**:`npm test` 在库里单独跑得绿,是"UI 与计算真的
  解耦了"最直接的证据(库的 job 只用 Node 就能跑).

## 还没做的

附录 B.2 列的 7 类补件里 `Menu` 已补(见上表),还剩 6 类:`TextField` /
`Splitter` / `ScrollArea` / 表格件 / `Dialog`·`Toast` / `Tooltip`.它们是新功能
而不是"分离"的前置条件,按普通排期补即可(该长成什么样取决于下一个真实
消费者).

## 交付

**给两个应用仓库**(滚动资产):把 `main` 推到 GitHub.

```sh
git push origin main
```

`.github/workflows/release.yml` 的 `release` job 随后把包根打成
`miko_ui_dist.tar.gz`,挂到滚动 release `ui-latest`,并从**消费者用的那个公开
URL** 重新下载验一遍 sha256.两个应用仓库的 `scripts/fetch_ui.sh` 取的就是这份
资产.本地想先看一眼资产:

```sh
npm run release:pack   # -> release/miko_ui_dist.tar.gz(清单含 gitHead,内容,sha256 都打在日志里)
```

**给 npm**(对外):一条命令.

```sh
npm run release:npm -- patch   # 或 minor / major / 显式 x.y.z;加 --dry-run 只打印计划
```

它会把版本号(`package.json` + `package-lock.json` 三处)一起改好,跑完整闸门,提交并
推 `main`(出滚动资产),再打 `v<version>` tag 推上去(发 npm).操作笔记与故障对照在
`docs/npm-release-note.md`.

`release.yml` 的 `publish` job 随后会跑完整闸门(build + typecheck + test),核对 tag 与
`package.json` 的版本一致,然后用 OIDC 把包发到 `registry.npmjs.org`.不需要任何
token,也不需要给账号开 2FA -- 身份票由 GitHub 现场签发.三条要注意的:

- 版本号只能往上走:npm 不允许同版本重发,发错了只能发下一个版本;
- 发布目标由 `publishConfig.registry` 钉死在官方源,不会被本机的镜像配置带偏;
- **只有推 tag 才发 npm**;只推 `main` 只出滚动资产.

为什么这么定,怎么强制重出,将来怎么固定/回滚,见 `RELEASING.md`.
