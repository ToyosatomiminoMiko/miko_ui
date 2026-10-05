# `miko_ui`

未正式立项
阶段: demo

GraphCalc 的 Web UI 库:**DOM 原语 + 响应式原语 + 控件 + 布局行 + 桌面窗口系统 +
编辑器外壳 + 主题**.它从应用里抽出来,只保留"结构与交互".

> 抽取过程,每个决策的理由与全部去耦合项见原仓库 `miko_graphcalc` 里的
> `docs/ui-library-extraction-plan.md`(本文件的每一节都能在那份计划里找到
> 出处).这份仓库是那个计划 P4 结束后的产物.

## 取用:两个应用从 npm 装;库另发一份滚动资产

本库同时服务
[miko_graphcalc](https://github.com/ToyosatomiminoMiko/miko_graphcalc) 与
[ToyosatomiminoMiko.github.io](https://github.com/ToyosatomiminoMiko/ToyosatomiminoMiko.github.io)
两个应用仓库,两边都是 `npm ci` **从 npm 装**(依赖声明只有一条
`"miko_ui": "^0.1.6"`);库另外还在每次推送 `main` 时发一份滚动资产,给"不走 npm"
的场景.两条链路互不干扰:

| 链路 | 触发 | 形态 | 谁在用 |
| --- | --- | --- | --- |
| **npm 包**(两个应用的主链路) | 推 `v*` tag | registry 上的 `miko_ui@<version>`,带 provenance | 两个应用仓库 + 外部消费者 |
| **滚动 release 资产** | 推到 `main` | `miko_ui_dist.tar.gz`,挂在 tag `ui-latest` 上,内容被覆盖 | 当前**没有消费者**(见下) |

npm 那条链路走 **OIDC 信任发布**(无长期 token,不需要账号 2FA),细节见
`RELEASING.md`.两个应用怎么取用,本地怎么改库联调,见下面的「应用侧怎么取用」.
库另外还发一份滚动资产,它的形态是:

```text
https://github.com/ToyosatomiminoMiko/miko_ui/releases/download/ui-latest/miko_ui_dist.tar.gz
```

main 每次推送后,`.github/workflows/release.yml` 把包根(`dist/` + `styles/` +
`LICENSE` + **运行期清单** `package.json`)打成 `miko_ui_dist.tar.gz` 挂到 tag
`ui-latest`;清单里的 `gitHead` 记着构建它的那个 commit,所以这份资产**自证版本**
(它是"某次 `main` 的产物",不是版本承诺).

> 这条链路**当前没有消费者**:两个应用仓库都是 `npm ci` 从 registry 装 `miko_ui`,
> 消费侧的 `scripts/fetch_ui.sh` 已随那次改造删除(真身见各仓库 `scripts/build.py`
> 的 `sync_miko_ui` 与 `scripts/dev_ui_link.py`).资产 job 仍然每次 `main` 都跑,
> 保留给将来接这条链路的消费者.**要不要退役它是一次独立决定**,本文只描述现状.

### 应用侧怎么取用

两个应用仓库用的是同一套两条路:

| 场景 | 机制 | 真身 |
| --- | --- | --- |
| 构建 / CI / Pages | `npm ci` 按 `"miko_ui": "^0.1.6"` 装;`sync_miko_ui` 再用 `npm view miko_ui@latest version` 对齐到 npm 的 latest(`MIKO_UI_SYNC=auto\|check\|off`;CI 下查不到版本直接失败) | 各仓库 `scripts/build.py` / `scripts/buildlib.py` |
| 本地改库联调 | `dev_ui_link.py link` 把 `node_modules/miko_ui` 换成指向本地工作副本的符号链接(`link` / `unlink` / `status`,路径用 `MIKO_UI_DIR` 覆盖);只动被 gitignore 的 `node_modules/` | 各仓库 `scripts/dev_ui_link.py` |

链接之后:库的 `styles/` 改完**零构建立即生效**(`exports` 直接映射到
`styles/*.css`);`src/` 要先编译进 `dist/`(`npm run build:dist`,或在库里常驻
`npx tsc -p tsconfig.build.json --watch`).链接只存在于 `node_modules/`,所以 CI 与
GitHub Pages 的行为一个字节都不变,`npm ci` 即可还原成 npm 上那一版.

无论走哪条,应用解析到的都是**构建产物** `dist/index.js` + `dist/index.d.ts`
(纯 ESM + 自带类型声明),消费者机器上**没有 TypeScript,也没有本库的源码**:

```ts
import { mountDesktop, signal } from 'miko_ui';
import 'miko_ui/styles.css';          // token + 控件 + 桌面,一次全要
// 或者按分组引:miko_ui/styles/tokens.css / scrollbar.css / widgets.css / desktop.css / editor.css / feedback.css
```

> 包名就是 `miko_ui`(依赖目录里也是它);公开面由 `package.json` 的 `exports`
> 定义,与"怎么把它接进来"无关.

运行时依赖两个:`@preact/signals-core` 与 `katex`.**两个都由库自带,应用侧不再声明
`katex`** -- 下游(计算器)规定不许直接依赖 katex,所以 LaTeX 的排版与它自己的
`katex/dist/katex.min.css` 都在库里一次做完(见「值 ↔ 文本口径」的公式一节,与
`formula/FormulaView.ts` 的渲染器出口).`signals` 仍然建议应用侧自己声明:实际装几份
取决于消费侧的依赖图,而 `signals` 装成两份就是两套注册表 -- 两个应用仓库都在
`vite.config.ts` 里用 `resolve.dedupe` 兜住这件事.

> **只面向打包器/浏览器**,两条原因(与交付形态有关,见 `RELEASING.md`):
>
> 1. 根入口会引 CSS(`formula/FormulaView` 引 `katex/dist/katex.min.css`),Node
>    原生 ESM 加载不了 `.css`(`ERR_UNKNOWN_FILE_EXTENSION`);测试入口 `./testing`
>    同理 -- 它的 `installDomStub()` 自动装公式替身,所以间接引到了那张样式表;
> 2. 库内写无扩展名相对导入(`from './reactive'`),`tsc` 原样输出 -- 只有打包器
>    的解析器会补 `.js` / `/index.js`,Node 原生 ESM 会 `ERR_MODULE_NOT_FOUND`.
>
> Vite / webpack / Next / Rollup 都没问题(它们既解析无扩展名,又把 CSS 当资源).
> 要在 Node 侧做 SSR 或单元测试,请让测试环境带 CSS 处理(如 Vitest).**没有**
> "在 Node 里只引具体子模块"这条路:`exports` 只暴露根入口,`styles/` 与测试入口
> `./testing`,内部路径不是公开面(见下面的"边界契约"第 7 条).

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
设成版本库里的 `.githooks/`,让提交前自动跑 `scripts/autorun.py` 里那把转换
(详见该文件顶部注释).钩子本身也是 Python 并直接 import 那个模块,所以不再需要
bash 那一层,也没有"解析子进程 stdout 判断哪些文件被改过"的隐式协议.它要求当前
目录是 git 仓库 -- 开发 clone 与 CI 的 checkout
都满足;发布资产里没有 `scripts` 字段,消费侧根本不会跑到 `prepare`.

提交前那次转换是就地改写工作区文件,再自动 `git add` 回暂存区,所以 `git status`
未必看得到差异.临时跳过某次提交用 `git commit --no-verify`.

每一条只做命令里写出来的事:没有 `pre*` 隐式钩子(唯一的例外是 `prepare`,它是
npm 的生命周期 -- 原因见下面"边界契约").

改依赖后重建 `package-lock.json` 之前,先读 `.github/workflows/ci.yml` 顶部的
"库侧依赖/交付契约":用 `npm install --package-lock-only` 会丢掉跨平台可选依赖,
而 CI 的 npm 11 会因此直接拒掉 `npm ci`(本地 npm 10 看不出来).

改完推到 `main`,`.github/workflows/release.yml` 会重新出一次滚动资产(当前没有消费
者取它).**要让两个应用仓库拿到,得发一版 npm**:`npm run release:npm -- patch|minor|major`.
交付细节与"库先发,消费侧再推"的顺序写在 `RELEASING.md`.

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

## 值 ↔ 文本口径(`ValueText`)

**一个功能只有一种实现**:值变成文本这件事只有一条路 -- `src/shared/numberText.ts`
的 `numberText()` 工厂,产出的是一个**可传递的对象**:

```ts
const angleText = numberText({ digits: 3 }); // 一套口径,一个对象
createNumberField({ value: angle, text: angleText });
createReadoutRow('方位角', { value: angle, text: angleText });
// 两处文本逐字符相同 -- 这就是"统一"的判据
```

做成对象而不是两个回调,是因为口径要能**整体传递**:显示要短,编辑要能被 `Number()`
咬住,这两件事分开给就一定会各自漂移.控件的 `text` 选项收的就是这个对象
(`format` / `parse` 两个回调已经不存在了).

**档位与语法是两件事.** 档位是"几位小数,尾零去不去,什么时候回退科学计数法"
(`digits` / `trimZeros` / `exponentialAt` / `exponentialDigits`);语法是同一个档位要
服务的三种互不兼容的文本要求(`syntax`):

| `syntax` | 用途 | `1e6` | `2.775558e-17` |
| --- | --- | --- | --- |
| `'plain'`(默认) | 给人看的纯文本 | `1.000000e+6` | `2.775558e-17` |
| `'latex'` | 交 KaTeX 排的数学写法 | `1\times10^{6}` | `2.775558\times10^{-17}` |
| `'edit'` | 进 `<input type="number">` | `1000000` | `2.775558e-17` |

两个预置直接引用即可:`NUMBER_TEXT_EDIT`(编辑档,无损)与 `NUMBER_TEXT_DISPLAY`
(显示档,行为等于旧的 `formatNumber`).

**三条硬规则**(都有机器守,不要绕过):

1. **编辑档的输出必须是合法 number 文本.** 不合法的字符串会被浏览器**静默消毒成
   空串** -- 框里变空,值没变,也不报错.判据是 `isNumberInputText`;`NumberField`
   建控件时对传进来的口径跑一次 `assertEditSafe`,不合格**直接抛**.
2. **编辑档默认不做舍入.** `NUMBER_TEXT_EDIT` 取最短往返表示,保证
   `fromText(toText(v)) === v`. 定点位数一旦少于控件 `step` 的小数位,用户只要编辑
   一下输入框,值就会被静默量化到那个位数上.要"固定两位小数"的外观(把 `0.9` 写成
   `0.90`)就给 `numberText({ syntax: 'edit', digits: 2 })`,并**保证 `digits` 覆盖
   `step` 的小数位**;`assertLossless` 可以在测试里把这一条钉住.
3. **只有显示档允许舍入,全精度走 `title`.** 读数显示 `0.3`,`title` 给
   `0.30000000000000004` -- 这是"提高小数位直到看得出来"那种做法的替代物.

**要"定点 n 位去零"这种旧口径的逐字符复刻,得显式关掉指数回退**:

```ts
// 等价于 String(Number(v.toFixed(4))):定点 4 位,去尾零,任何有限值都不切 e 记法
const point = numberText({ syntax: 'edit', digits: 4, exponentialAt: { low: 0, high: Infinity } });
```

只写 `digits: 4` 不够,两处会差:①不带 `syntax: 'edit'` 就是**显示档**,`NaN` 输出
`'NaN'` 过不了 `assertEditSafe`,`NumberField` 构造期直接抛;②默认档在
`[1e-4, 1e6)` 之外会切成 `1.0000e-5` 这类 `e` 记法(旧口径给 `0`).`high: Infinity`
让定点分支吃下全部有限值;非有限值仍给空串(与旧文本被浏览器消毒成空串同效).
`numberText` 的另一条相关约定:定点档遇到**舍入到零的负数**(如 `-0.001` 配 2 位)
输出 `0` / `0.00`,不吐舍入产物的 `-0`.

**只读读数**用 `createValueDisplay`(单个 `<output>`)或 `createReadoutRow`(复用
`.control-row` 的整行).它默认**不播报**:HTML-AAM 把 `<output>` 映射成隐式 live
region,拖动滑杆时每帧都变,所以库里固定写 `aria-live="off"`,`announce: true` 才交给
ARIA.

**要排公式就加 `render`.** 显示件只做"文本 -> 节点"这一步,自己不认识任何排版器:

```ts
createReadoutRow('方位角', {
    value: angle,
    text: numberText({ syntax: 'latex' }),                       // 值 -> LaTeX
    // 第三个参数 copyable=false:读数不是复制公式的入口.默认可复制会给这格挂
    // `tabindex=0` + `role="button"` + `aria-label`,而复制要另外 bind
    // `FormulaCopyController` -- 不 bind 就是一个焦点可达,按了没反应的按钮.
    render: (latex) => createFormulaElement(latex, undefined, false),
});
```

于是一条读数从值到屏幕全在库里:口径(`numberText`)-> 文本(显示件)-> 排版
(`FormulaView`).**下游因此不需要知道 `katex` 这个名字**:它不进应用的
`package.json`,测试里也不用再写 `vi.mock('katex')`.

`formula/FormulaView.ts` 另有渲染器出口 `setFormulaRenderer`,以及文本替身
`TEXT_FORMULA_RENDERER`:手写 DOM 桩 / SSR 里没有真 KaTeX 能用的排版 API
(它要 `createElementNS`),所以测试入口 `miko_ui/testing` 的 `installDomStub()`
**默认装文本替身**(把 LaTeX 原样写进元素),消费者的公式测试只写
`installDomStub()` 就够.要在桩里跑别的渲染器就 `installDomStub({ formula: 'keep' })`
保留当前渲染器,或用 `setFormulaRenderer(null)` 换回真 KaTeX -- "装桩"与"换渲染器"
没有先后顺序的要求.

**字号由库消费自己的令牌**:每个公式根节点都带基线类 `.ui-formula`,库的
`styles/widgets.css` 里有一条 `.ui-formula > .katex { font-size: var(--katex-font-size) }`
把令牌落到 KaTeX 的产物上.选择器是两个类(0,2,0),压得过 KaTeX 自带的
`.katex { font: normal 1.21em ... }`,与样式表先后无关 -- 消费侧因此**不再需要**写
`.katex { font-size: ... }`(单类选择器与 KaTeX 同特异度,又排在它前面,是必输的);
要改字号就改 `--katex-font-size`(默认 `1.21em`,即 KaTeX 原值).

**不归这一层管的东西**:`input.min` / `input.max` / `input.step` /
`<input type="range">.value` 这类 DOM **机器属性**.`String(v)` 是无损的机器序列化,
换成任何会舍入的档位都会让区间与滑杆取值失真(滑杆的 `value` 必须原样解析回同一个
数).这一层管的是"给人看的文本";机器语法就是 `String(v)`,没有第二种实现.

## 公开面

`src/index.ts` 是**唯一**的组件出口(`package.json` 的 `exports` 只放它,
`./styles*` 与测试入口 `./testing`).按目录分组:

| 分组 | 内容 |
| --- | --- |
| `widgets/dom.ts` | DOM 创建层:`create_element({ tag, root }, attributes, ...children)` / `childNodes` / `nextWidgetId`,创建层与属性层的类型分开;同在这一个文件里的 `DomRoot` / `rootDocument`(root 注入)是**库内口径**,不从 `miko_ui` 导出 |
| `reactive/` | 值源与派生值(`signal` / `computed` / `effect` / `onValueChange` 一族):控件的值参数可以直接传这一层的东西 |
| `widgets/` | 控件与行级布局件:按钮 / 开关 / 分段 / 滑杆(裸滑杆与系数滑块)/ 数值框 / 只读读数件 / 浮层 / 徽章 / 带标题栏的框体(桌面窗口复用同一组 `.ui-panel*` 基类)/ 菜单,以及 `create*Row` 一族行外壳 |
| `shared/` | 跨组件共用的交互与行外壳:键盘唯一出口,唯一拖拽实现,行缓存,值↔文本口径(见下节),行外壳 |
| `desktop/` | 桌面窗口系统:装配入口(`mountDesktop` / 窗口槽位),窗口管理器与几何 / 拖动 / 吸附 / 停靠件,桌面配置类型与 `DEFAULT_DESKTOP_CONFIG` |
| `editor/` | 编辑器外壳:整套结构装配,行号栏,高亮层(分词与槽宽由消费者注入),以及保住原生撤销栈的程序化写入.**编辑器自己不滚**:外框随内容长高长宽,滚动归装它的那一层(见下"编辑器不滚,宿主滚") |
| `feedback/` | 消息区容器(`MessageArea`:列表节奏 + 滚动 + `aria-live`;框体可加变体类 `message-area--unframed` 去掉,见 `modifier`)与消息 / 诊断条目(`MessageList`),零领域依赖 |
| `formula/` | KaTeX 公式件与复制反馈(KaTeX 的排版,样式与渲染器出口都在库里,`katex` 是库自带的运行时依赖,应用侧不声明) |
| `theme/` | `applyTheme(root, tokens)`:把一组 CSS 变量写到根元素上(库的默认主题只有 `styles/tokens.css` 一份,JS 侧不留镜像) |
| `testing/` | **测试入口**(独立子路径 `miko_ui/testing`,不进主入口):手写 DOM 桩,复刻了真 DOM 里踩过的坑,并给出 `document.execCommand` / `navigator.clipboard` 两条可断言通道;`installDomStub()` 还会自动装上公式文本替身(见上节),所以消费者的公式测试不必 mock `katex` |
| `styles/` | 分组样式表 + 总入口:逐份入口,加载顺序,每份读哪些 token 写在 `styles/styles.css` 的文件头,这里不抄第二份 |

上表的"内容"列只说明**每个目录负责什么**;具体导出了哪些符号,`src/index.ts` 是唯一
清单(它按文件 `export *` 重导出,所以那份文件本身就是公开面).

## 边界契约(有机器守,不靠自觉)

`npm test` 先跑 `scripts/check_ui_boundary.py`(八条断言,要 python3),再跑 vitest;两条
都写在 `test` 脚本里,不是隐式钩子.这份脚本跟着库从 `miko_graphcalc` 搬了过来
-- 库分出去之后,那边不再有库的源码,检查必须跟着库走.

八条的**定义**只有一处:`scripts/check_ui_boundary.py` 的文件头那张表.要看明细就
`python3 scripts/check_ui_boundary.py --list`(逐条打印违例与行号).这里不抄第二份
-- 抄一份的下场是"脚本加了第九条,README 还写着八条".值得记住的只有两点:

- 前三条在这个仓库里恒为 0(本仓库没有应用源码可引用),留着是因为 `@/` 那条
  同时也是"库内不许用路径别名"的机器保证;
- 八条都是硬断言,任何一条违例 `npm test` 直接失败,没有 baseline,也没有
  "允许的例外".

另有一组**测试级**契约,都在 `test/` 下,每条的文件头写着它守什么,为什么值得守
-- 已覆盖的主题包括样式归属,默认值只有一处,编辑器外壳的对齐算术,样式表的分发
闭环(以各文件头为准,这里只是让你知道有这么几类).其中一条值得展开:
`test/emittedClasses.test.ts` 断言"库**产出的每个类名**,库的样式表里要么有默认
规则,要么在 `INTENTIONAL_HOOKS` 里显式声明它只是定位钩子(带理由)".背景是
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
   还能继续用的前提.代价是**一次写 = 一次提交**:分开写多份状态时,读它们的
   `computed` 会先按中间态评一次再按终态评一次,中间态对订阅者可见 -- 一次交互
   尽量只写一个 signal(理由与推论见 `src/reactive/index.ts` 开头的四条硬约束).
3. **`root` 注入**:建节点,挂全局监听都从调用方给的 root 走,不读全局
   `document` / `window`;同页两个实例,嵌进别人的页面,Shadow DOM 都靠这一条.

## 测试

- 组件测试用库自带的 DOM 桩:`test/domStub.ts`(从应用侧复制一份,分家期间
  两边同步维护)与 `test/desktopFixture.ts`(窗口配置夹具).
- 库的测试**不引用应用源码**:`npm test` 在库里单独跑得绿,是"UI 与计算真的
  解耦了"最直接的证据(库的 job 只用 Node 就能跑).

## 还没做的

附录 B.2 列的 7 类补件里 `Menu` 已补(见上表),`Splitter` 与 `ScrollArea` 按下面的
结论去掉,还剩 4 类:`TextField` / 表格件 / `Dialog`·`Toast` / `Tooltip`.它们是新功能
而不是"分离"的前置条件,按普通排期补即可(该长成什么样取决于下一个真实
消费者).

### 窗口正文的排布:只需要一个列容器(2026-10 定案)

窗口正文(`.window > .window-body`)已经是列 flex,直接子节点也已经被
`.window-body > *` 拉满(`flex: 1 1 auto; min-height: 0`).所以窗口正文里要做的
只有一件事:**一个按顺序往下摞,超出就滚的容器**.

```css
display: flex; flex-direction: column; gap: ...; padding: ...; overflow-y: auto;
```

**"超出就滚"的是这个容器自己,不是它里面的某个元素**(2026-10 修订):一旦把
`overflow-y` 交给里面的卡片,滑条就跑到窗口内的元素上(缩进一圈,贴着卡片的描边),
正文根反而不滚,还得靠一层层 `overflow: hidden` + `min-height: 0` 把滚动顶下去 --
同一个"哪里滚"有两处说法,改一处忘一处不报错,只表现为滑条位置慢慢分叉.
`miko_graphcalc` 的七个窗口现在都是这一个形状:视图 / 参数 / 源码 / 实体 / 求值 / 诊断
六个窗口是"正文根就是滚动区"(诊断那颗正文根就是库的消息区容器,**不要框体**:
`createMessageArea({ modifier: 'message-area--unframed' })` -- 窗口外壳那圈描边就是
它的框,再套一层就是两层边框 + 一圈白给的内边距),过程窗口是它自己的几个滚动块
(题目 / 参数回显 / 步骤,页头不该跟着滚,所以那里保持"sticky 布局 + 内部滚动块").

由此作废的:`Splitter`(两家零使用,graphcalc 窗口化时主动删掉了自己的分栏控制器),
单独的 `ScrollArea` 语义(它就是上面那个列容器),以及原方案文档
`docs/value-text-window-layout-plan.md` 里的全部内容 -- 那份文档连同它的演示页
`example/layout/` 已删:`createStack` / `createScrollArea` 双原语,`.ui-fill`,
"三条显式拉伸出口",Phase 4(`.ui-panel-body > * { flex: 0 0 auto }`),
`createStage`,面板尺寸出口,一个都不做.

### 编辑器不滚,宿主滚(2026-10 修订)

`createCodeEditor()` 的外框(`.code-editor`)现在**宽高都由内容给出**:
`width: max-content` + `min-width: 100%`,`min-height: 100%`(内容比宿主小时填满).
textarea 与高亮层同处 `.code-editor-input` 的一格(`display: grid` +
`grid-area: 1 / 1`),高亮内容那个 `white-space: pre` 的 `<pre>` 在流内,于是
"最长行 / 行数"直接变成外框的尺寸 -- **不需要任何 JS 量文本宽高**.

由此:

- 编辑器里没有滚动区间,滚动条归**装它的那一层**(窗口正文根 / 页面的滚动容器);
  长行横向滚时行号槽 `position: sticky; left: 0` 钉在左边(外框因此用
  `overflow: clip` 而不是 `hidden`:`hidden` 会建立 scrollport,sticky 会以它为
  参照系而失效);
- 老坑"textarea 的滚动条占位,高亮层不占位,两者最大滚动偏移差一个滚动条厚度"
  不存在了(两边都不滚);`EditorHighlight.sync` / `EditorLineNumbers.sync` 保留,
  消费者把 textarea 改回固定尺寸时仍然对齐;
- **消费者要自己提供滚动**:把编辑器放进固定高度的盒子时,那个盒子(或它的祖先)
  必须有 `overflow: auto`,否则超出部分会被裁掉.词法高亮没起来时(高亮层
  `display: none`)这一格的高度回到 textarea 自己的 `rows`,此时长源码仍在
  textarea 内部滚 -- 兜底路径不会被裁.

### 下游脱 katex 暂缓

第二个消费者(`Toyosatomimiko.github.io`)仍直接依赖 `katex`
(`src/ieee754/ieee754.ts` 的 `import katex` + `katex.render`,选项是
`displayMode: true`),而库的 `createFormulaElement` 固定 `displayMode: false`,
模板缓存的键也只有 LaTeX.要它脱掉直接依赖,前提是库里先补一个**带 `displayMode`
的渲染出口**并把 `displayMode` 并进模板缓存键;在那之前它不动.该仓 `README.md` 与
`vite.config.ts` 里"katex 是可选 peer"的表述已经过期(库现在把 katex 放在
`dependencies` 里,`peerDependencies` 为空),无论脱不脱都要改.

## 交付

**给两个应用仓库**(npm):推一个版本 tag,应用侧 `npm ci` + `sync_miko_ui` 就对齐到
新产物 -- 与下面"给 npm"是同一条命令,顺序与判据见 `RELEASING.md`.

**滚动资产**:把 `main` 推到 GitHub.

```sh
git push origin main
```

`.github/workflows/release.yml` 的 `release` job 随后把包根打成
`miko_ui_dist.tar.gz`,挂到滚动 release `ui-latest`,并从那个公开 URL 重新下载验
一遍 sha256.**这条链路目前没有消费者**(两个应用走 npm),保留给将来接它的消费
者;本地想先看一眼资产:

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
