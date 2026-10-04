# 数值/文本显示统一 · 窗口内布局确定:方案

> 状态:**方案 A(数值/文本)已落地,含第五轮把 KaTeX 收进库;方案 B(窗口内布局)仍是方案.**
> 下面的「第四轮」「第五轮」两段是实现记录 -- 第四轮那段与本文最初的设计有**三处实质
> 偏离**,引第 3 节时以它为准.
> 库的 `src/` 与 `styles/` 已按方案 A 改过,`example/` 的读数与口径也已迁移.
> 目标版本:`0.2.0`(**暂定**).
>
> **2026-10 第四轮:方案 A 落地.**落地面:`src/shared/valueText.ts`(新),
> `src/shared/numberText.ts`(重写),`src/widgets/ValueDisplay.ts`(新)与它的两个样式类,
> `NumberField`/`Slider` 的 `text` 选项,`src/index.ts`,单测(312 -> 358 项全绿).
> 与第 3 节的设计有**三处偏离**,都是被消费者侧的真实证据逼出来的:
>
> 1. **`format` / `parse` 两个回调被删掉,不收"并存".**第 3.5 节写的是"新增 `text?`,
>    与既有 `format`/`parse` 并存,加而不删";落地时选了**只留 `text`** -- 同一件事留
>    两条入口正是这次统一要消灭的东西.代价是两个消费者**各一处**机械迁移:站点
>    `src/setting/page_opacity.ts:75` 的 `format: formatOpacity`,graphcalc
>    `src/ui/view/ViewPanel.ts:155` 的 `format: formatPointValue`
>    (前者的期望文本 `"0.90"` 仍由 `numberText({ syntax: 'edit', digits: 2, trimZeros: false })`
>    产出).
>
>    **2026-10 更正(消费者实测)**:这里原写"后者等价于 `digits: 4`"**不成立**,三处都不
>    成立:①不带 `syntax: 'edit'` 的 `numberText({ digits: 4 })` 是**显示档**,`NaN` 输出
>    `'NaN'` 过不了 `assertEditSafe`,`NumberField` 构造期直接抛(这条最硬);②即使给了
>    `syntax: 'edit'`,默认档在 `[1e-4, 1e6)` 之外会切成 `e+n`(`1e-5` -> `1.0000e-5`,
>    而旧口径 `String(Number(v.toFixed(4)))` 给 `0`);③`trimZeros: false` 又把 `0.2`
>    写成 `0.2000`(那是站点 opacity 那个档位,不是这个).
>
>    **真正的等价写法**是
>    `numberText({ syntax: 'edit', digits: 4, exponentialAt: { low: 0, high: Infinity } })`
>    -- 显式关掉指数回退(`high: Infinity` 恒成立,定点分支吃下全部有限值),再加本轮
>    修掉的"舍入到零去符号"(`-0.00004` 原本给 `-0`,旧口径给 `0`);两者齐了才对每一个
>    有限值逐字符等于 `String(Number(v.toFixed(4)))`,非有限值给空串(与旧文本被浏览器
>    消毒成空串同效),且 `assertEditSafe` 为真.单测 `numberText.test.ts` 的
>    「"定点 n 位去零"要逐字符等于 String(Number(v.toFixed(n)))」逐值钉住了这条.
>    消费者这轮用一份 6 行自定义 `ValueText` 达到同样效果(逐字符保持既有显示),
>    **不迁移也不违反契约** -- 库给的就是"口径可以自己实现"这个出口.
> 2. **编辑档默认改成"无损",而不是第 3.3 节的"6 位定点 + 放宽指数门槛".**理由:
>    定点位数一旦少于控件 `step` 的小数位,用户只要编辑一下输入框,值就会被**静默
>    量化**(拖动 / 输入 / 失焦三步都不报错,也没有任何断言会红).`NUMBER_TEXT_EDIT`
>    因此取 JS 的最短往返表示(`String(v)`,非有限值给空串),`assertLossless` 把这条
>    钉进单测.固定小数位**仍然支持** -- 就是站点 `toFixed(2)` 那个档位 -- 只是不再
>    当默认.**副作用要说清楚**:第 3.5 节承诺的"站点 7 条 metro 滑块一行不改就干净"
>    **不成立**了,无损档会把 `0.8999999999999999` 原样显示.那 7 条的尾巴是**值**漂了
>    (`min + n * step` 的浮点误差),不是文本的问题;正确的出口是控件已有的 `normalize`
>    (`step: 0.01` 就该把值落回 2 位小数网格),这是下一轮的事,本轮没做.
> 3. **`NumberTextOptions` 比第 3.2 节少三个字段,`syntax: 'edit'` 多一条硬规则.**
>    - 去掉 `group`:两个消费者零需求,判据同第 4.7 节那条"库里有没有 `var()` 读它"
>      -- 没人用的选项不加,要千位分隔符的调用方自己写 `toText`;
>    - 去掉 `nonFinite`:三种语法各自的非有限值写法是**固定的**(`plain`/`latex` 给
>      `String(v)`,`edit` 给空串),没有可配置的余地;
>    - 去掉 `minusZeroAsZero`:`-0` 在每条分支上本来就输出 `0`
>      (`String(-0) === '0'`,`(-0).toFixed(n)` 也不带负号),这个选项是空的;
>    - `'edit'` 下带 `suffix` **直接抛**而不是静默降级 -- 那个组合会被 number 输入框
>      消毒成空串,静默正是这个坑最难查的地方.
>
> 另有两条按方案落地时的补强:
>
> - `NumberField` 建控件时对传进来的口径跑 `assertEditSafe`,不合格**直接抛**
>   (第 3.3 节原写的是"dev 环境控制台告警 + 降级到 `String()`"):库的产物不读
>   `process.env`(`tsconfig.build.json` 把 `types` 清空),而静态配置错误本来就该在
>   构造期就炸;
> - `'latex'` 语法的期望值**照抄 graphcalc 的既有断言**(`src/math/paramValue.test.ts:56-77`
>   的 `2.775558\times10^{-17}` / `1.25\times10^{20}` / `0.1` 边界 / `0`),所以
>   `src/math/latexNumber.ts` 那份"与库的 `formatNumber` 同一档位"的抄写可以整块删掉.
>
> **第 3 节保留原样,不回改** -- 它是决策过程的一部分,以上面这段的偏离为准.
> 方案 B(第 4 节)这一轮**一个字没动**.
>
> **2026-10 第五轮:KaTeX 收进库(消费者侧的新约束).**下游(计算器)规定**不许直接
> 依赖 katex**,而 `katex` 此前是**可选 peer**(应用必须自己声明并安装),那条规定照旧
> 落不了地 -- 照字面读就是"应用仍然要知道 katex".所以这一轮改三处:
>
> 1. **`katex` 从 `peerDependencies`(optional)移进 `dependencies`**:应用侧从自己的
>    `package.json` 删掉 `katex` / `@types/katex` 即可.`scripts/check_ui_boundary.py`
>    的 `deps` 规则同步改成"允许**且要求** `dependencies` 里有 katex,
>    `peerDependencies` 必须为空" -- 只允许不要求的话,它下次又会被静默改回 peer.
> 2. **公式渲染器成为可注入出口**:`formula/FormulaView.ts` 新增
>    `setFormulaRenderer` 与文本替身 `TEXT_FORMULA_RENDERER`,换渲染器时模板缓存整体
>    失效(缓存键只认 LaTeX);`testing/domStub.ts` 的 `installDomStub()` 默认装替身
>    (要在桩里跑别的渲染器传 `{ formula: 'keep' }` -- 装桩与换渲染器因此没有先后
>    顺序契约).于是消费者测试里的 `vi.mock('katex')`(实测 graphcalc **4 个**测试文件各一处)
>    整块删掉 --
>    那条 mock 正是"下游直接依赖 katex"的残迹.真 KaTeX 要 `createElementNS`,手写
>    DOM 桩给不了,这也是替身**必需**而不是便利的原因(单测把这条钉住了).
> 3. **`createValueDisplay` 多一个通用 `render?: (text) => Node` 出口**:读数要的是
>    "排出来的公式"而不是文本本身时,把 `numberText({ syntax: 'latex' })` 的产出交给它
>    (示例里因此多了一条 `方位角(公式)` 读数).做成"文本 -> 节点"而不是给显示件加
>    "公式变体",是为了让 widgets 层仍然不认识 formula 层.
>
> 连带意义:第 3.2 节的 `syntax: 'latex'` 轴在这里闭环 -- graphcalc 的
> `src/math/latexNumber.ts`(注释自陈"与库的 `formatNumber` 同一档位")整块由
> `numberText({ syntax: 'latex' })` 顶替,而它渲染那一半本来就走库的
> `createFormulaElement`.
>
> **消费者侧要跟着做的(graphcalc 实测,五步)**:①`package.json` 删 `katex` 与
> `@types/katex`;②4 个测试文件里的 `vi.mock('katex')` 与
> `vi.mock('katex/dist/katex.min.css')` 整块删掉(公式渲染由 `installDomStub()` 装替身);
> ③`vite.config.ts` 的 `resolve.dedupe` 去掉 `'katex'`(留 `@preact/signals-core`)--
> 那条 dedupe 原本的理由正是"让 `vi.mock('katex')` 拦得住库",现在理由消失;
> ④删 `src/math/latexNumber.ts`,调用点改用 `numberText({ syntax: 'latex' })`
> (档位同值,既有断言逐条保留);⑤要"排出来的公式读数"就在显示件上传 `render`
> (别在应用里再拼一格 DOM);⑥删掉 `panels.css` 2 条 + `process.css` 2 条的
> `.katex { font-size: var(--katex-font-size) }`,以及 `uiConfig.ts` 的 `katexFontSize`
> 与 `applyUiConfig.ts` 写 `--katex-font-size` 的那一段 -- 库现在自己消费这个令牌
> (见下一条).
>
> **2026-10 第五轮补(消费者实测的两条)**
>
> 1. **样式接缝闭环:`--katex-font-size` 由库自己消费.**此前它只写着"由消费侧读",
>    而消费侧那条 `.katex { font-size: ... }` 与 KaTeX 自带的
>    `.katex { font: normal 1.21em ... }` **同特异度**,又排在 `katex.min.css` 之前,
>    只能比先后 -- 必输.下游实测的字节偏移:`panels.css`/`process.css` 的 4 条规则在
>    产物 ~18.7KB 处,KaTeX 自带在 ~34.5KB 处(该产物 CSS 依次为 18702 / 19510 /
>    21761 / 22594 与 35031).所以 `katexFontSize: 1.5` 长期**空转**(他们的文档里
>    "1.5em = 24px"是旧结论,实际渲染是 1.21em = 19.36px).落法:
>    - `createFormulaElement` 的产物**总带**基线类 `.ui-formula`(消费者类跟在后面,
>      与 `ui-button` / `ui-readout-value` 同一条"基线在前"的约定);
>    - `styles/widgets.css` 加一条 `.ui-formula > .katex { font-size: var(--katex-font-size) }`
>      -- **(0,2,0) 与顺序无关**,而且只覆盖 `font-size` 这一个 longhand,KaTeX 的
>      font-family / line-height 仍由它自己的简写提供;
>    - `--katex-font-size` 的默认值从 `1.5em` 改成 **`1.21em`(KaTeX 自己的值)**:
>      令牌从"空转"变成"真生效"的那一刻,库的默认值必须等于引擎原值,否则所有不配置
>      的消费者都会在一次 minor 里悄悄变大;要放大就改令牌(配置过的消费侧本来就会写);
>    - 新增 `test/formulaFontSize.test.ts` 守三件事:唯一消费点,选择器是 0,2,0 且
>      不包 `:where(`(本库其它基线类的习惯写法,用在这里会把特异度清零,掉回必输局),
>      以及 CSS 里的类名就是 TS 里产出的那个.
> 2. **`-0` 缺陷修正 + 一条文档更正.**第四轮记录里"`-0` 在每条分支上本来就输出 `0`"
>    只对**负零**成立:定点档遇到"舍入到零的负数"(如 `(-0.00004).toFixed(4)` 给
>    `-0.0000`)会输出 `-0`,而调用方照 JS 语义写的 `String(Number(v.toFixed(n)))`
>    给 `0`.已在 `renderFixed` 里去掉这个舍入产物的符号,并加单测.同一条链上还更正了
>    第四轮那句"graphcalc ViewPanel 那处等价于 `digits: 4`"(见第 1 条偏离的更正块):
>    等价写法是 `syntax: 'edit'` + `exponentialAt: { low: 0, high: Infinity }`(关掉
>    指数回退),不是裸的 `digits: 4`.
>
> **2026-10 第一轮评审**:先只审方案,不动代码;两处破坏性变更(D2 默认口径切档,
> Phase 4 去掉正文拉伸通吃)**搁置,待消费者侧实验后再定**.
>
> **2026-10 第二轮:消费者调研 + 实测(已并入本文)**.库里唯一的两个消费者
> (`miko_graphcalc`,`ToyosatomiminoMiko.github.io`)的正文做法已逐条查清,
> 三处争议在 headless Chromium 里对着库的真实样式表量过.结论有四条与初稿相反:
>
> 1. **Phase 4(去掉 `.window-body > *` 通吃)从"搁置待实验"改成可直接落地** --
>    实测对两家现有布局**逐像素无影响**(4.2-a),而真实缺陷在别处(2.2 第 5 条);
>    **(第三轮:后半句作废 -- 那个"真实缺陷"在真实层级里不存在,Phase 4 降级为可不做)**;
> 2. **Phase 3(把 `.ui-panel-body` 改成列 flex)的风险被低估,收益被高估** --
>    实测会打断面板正文的 margin 塌陷(4.6),而站点从"拉伸语义"里一分钱好处都
>    拿不到(它的面板没有定高);建议改成 **opt-in**(7/D8);
> 3. **`Splitter` 降级**:两家零需求,graphcalc 还主动删掉了自己的分栏控制器(7/D7);
> 4. **初稿的两条"现状"写错了**:`formatNumber` 不是死代码(消费者在用,见 1.1),
>    而"全库没有 `ResizeObserver`"也不成立 -- 库的编辑器层自己在用(见 1.2 与
>    4.4 第 6 条).
>
> **2026-10 第三轮:布局结论已定(按两家真实结构复核 + headless 重测;可视化演示见
> `example/layout/`)**.四条:
>
> - 初稿的"工具条 + 主体 + 底栏"**是凭空造的**:graphcalc 六个窗口正文全是单子节点,
>   站点面板也没有定高,两家都没有这种布局.该形状从方案里删掉(第 8 节),**不再作为
>   Phase 4 的理由**;
> - **主目标 = 两个原语**:`createStack`(顺序堆叠)+ `createScrollArea`(吃剩余 + 滚).
>   理由是同一段容器 CSS 在 graphcalc 三处 + 站点面板各写一遍(2.2 第 3 条);
> - **Phase 4(默认不拉伸)降级为"可不做"**:真实元素上逐像素无差别,而且两个原语
>   **不依赖它**(显式出口特异度更高).见 4.2-b,第 6 节,D13;
> - **2.2 第 5 条与验收 9 作废**:`.process-header` / `.process-truncated` 在真实层级里
>   根本吃不到 `.window-body > *`.顺带把示例的"垂直居中"这个真毛病改掉了(9.10).
>
> 另:下面的行号按写入时的 HEAD(commit `32d9f3b`);此后源码又动过一轮
> (`d2134b1` 等),引用请以内容和符号名为准.已核对过的计数差异见 1.1 的脚注.
>
> 前置阅读:`README.md` 的「公开面」「三条设计约束」「边界契约」;
> `src/shared/numberText.ts`;`styles/desktop.css` 的 `.window-body` 一节;
> `styles/widgets.css` 的 `.ui-panel-body` 一节;
> `test/scrollbarStyles.test.ts`(它守的那条"独立规定"与本方案第 4.5 节正面冲突).

## 0. 一句话

这两件事的根子是同一个:**库把"值长什么样"和"窗口里怎么排"都留给了消费者**,
而库自己只提供零件.于是每个应用各写一份 `.readout` 与一份 `.pane`,
同一份数值在滑杆框,数字框,读数三处显示成三种文本.

本方案给这两件事各定一份**库内唯一口径**:

- 数值/文本:一个可配置的**策略对象**(`ValueText<T>`)负责"值 ↔ 文本",
  编辑态与显示态各自一个预置,新增只读显示件 `createValueDisplay` /
  `createReadoutRow`;
- 窗口内布局:**先给两个布局原语** -- `createStack`(按顺序堆叠,替掉消费者各写一遍的
  `display:flex; flex-direction:column; gap` / margin 节奏)与 `createScrollArea`
  (吃掉剩余高度,超出就滚,自带 `.ui-scrollbar`;可选 `minHeight` 下限);
  "正文默认排布规则是否改写"(Phase 4)按第三轮结论**降级为可不做**,
  `createSplitter` 按 D7 无限延后.目标是让"哪块吃掉剩余,哪块滚,东西按什么顺序摞"
  从"消费者的约定"变成"库的契约".

## 1. 现状(事实清单)

### 1.0 两个消费者的形态基线(2026-10 调研)

库的两个形态**被两家消费者分别用掉一半,交集几乎为空**.下面这张表是本文所有
"现状"判断的基准;第 1.1/1.2 节的计数都指它:

| | `miko_graphcalc` | `ToyosatomiminoMiko.github.io` |
| --- | --- | --- |
| 库的哪一半 | `mountDesktop` / **6 个窗口** | `createPanel` / **5 块面板** |
| 另一半 | `createPanel` 零使用 | 窗口系统零使用(`.window` / `desktop.css` 全零命中) |
| 正文容器 | `div.ui-panel-body.window-body` | `div.ui-panel-body` |
| 正文直接子节点数 | **恒为 1**(6/6 窗口) | **8 / 4 / 7 / 2 / 3**(OLED/RBT/IEEE754/Calendar/SETTING) |
| 对 `.ui-panel-body` 的覆盖 | 3 处重复声明骨架(`.panel` / `.right-page` / `.process-panel`) | **0 条**规则命中 |
| 纵向节奏靠什么 | 手写 flex 三段式 + 百分比 + `min-height` 令牌 | 内容自带 `margin` + 嵌套 `gap` + **OLED 的 3 个 `<br>`** |
| 定高 | 窗口几何由 `UI_CONFIG.window` + `resolveRelativeGeometries` 写成行内样式 | 面板高度 = 内容高(无 height/overflow,整页滚动) |
| 手挂 `.ui-scrollbar` | **14 处** | **1 处**(库 `CodeEditor` 的 textarea);另有 2 处滚动区漏挂 |
| 取值口径 | `UI_CONFIG` -> `applyUiConfig()` 写 `:root` | `tokens.css` + 页面级 CSS 变量 |
| 取库方式 | `miko_ui` 从 npm 装;本地改库走 `scripts/dev_ui_link.py` 符号链接 | 同左 |

两条与本文直接相关的推论:

1. **"窗口正文只有一个宿主"是约定,不是测试**:graphcalc 六个窗口的 `content.body`
   数组各一项,但它的单测只断言 `body.length > 0`.这是可以收进库的契约点(4.3).
2. **站点对库面板的默认值零覆盖**:它没有一条规则是为了抵消 `.ui-panel-body` 的
   `padding` / `flex` / `min-height` 而存在.所以站点既是"库默认值够用"的证据,
   也是"库一改默认值就直接改到它"的风险面(4.6).

### 1.1 数值/文本的显示点

| 位置 | 现在怎么出文本 | 备注 |
| --- | --- | --- |
| `src/shared/numberText.ts:10` | `formatNumber`:定点 6 位去尾零,`\|v\| < 1e-4` 或 `>= 1e6` 回退科学计数法 | 纯函数,已导出公开面 |
| `src/shared/numberText.ts:22` | `formatVector`:`[1, 2, 3]` | 输出不可被 `Number()` 解析 |
| `src/widgets/NumberField.ts:91` | 默认 `format = String(value)` | 可被 `options.format` 覆盖 |
| `src/widgets/NumberField.ts:82` | `defaultParse`:trim + `Number.isFinite` | 私有函数,**不对外**,别处想用只能抄 |
| `src/widgets/Slider.ts:110` | 默认 `format = String(value)` | 同一份口径还喂给重置按钮的 `title` / `aria-label`(`Slider.ts:148`) |
| `src/widgets/RangeInput.ts:67,83,92` | 直接 `String(value)` | 裸滑杆**没有** `format` 出口 |
| `example/main.ts:102-121` | 消费者自写 `createReadout`:`String(value)` / `value.toFixed(3)` | 示例侧的抄写 |
| `example/example.css:63-81` | 消费者自写 `.readout-row` / `.readout` | 库的样式表里没有读数件 |
| `src/editor/EditorLineNumbers.ts:106` | `String(i)` | 行号是整数,不受影响 |

**消费者侧实测(2026-10)**:数值->文本口径在 graphcalc 里是 **6 套并行**
--库的 `formatNumber`/`formatVector` 只覆盖其中 2 个文件 **12 个调用点**(第三轮复核:
`adapters/entityText.ts:53-62` 11 处 + `ui/evaluation/integralItem.ts:245` 1 处;初稿写
"8 处",按行算才是 6 行),另外 5 套是
`String(Number(toFixed(4)))`(`ui/view/ViewPanel.ts:66`),LaTeX 版
(`math/latexNumber.ts:14-30`,注释自陈"与库的 `formatNumber` 同一档位"),
不舍入的直出(`compiler/dsl/latex.ts:20-27`),刻度版
(`render/core/tickLabel.ts:42`),以及 `${name}=${value}` 的裸拼
(`ui/process/ProcessPanel.ts:47-51`).站点**主站**侧只有两处格式化,其中一处正是为了躲
浮点尾巴而写的 `toFixed(2)`(`setting/page_opacity.ts:40-47`);整仓还有
`src/4xx_page/451/ember/stats.ts:153-162` 的 5 处 `toFixed`(独立页的 HUD,不算主站口径).

**所以要修正初稿的一句话**:`formatNumber` 确实是**库内零引用**,但**不是死代码**
--graphcalc 引它,且另外几处是在"重新实现同一档位".消费者侧缺的不是这个函数,
而是"同一个口径能被三处共用"的那个对象.

**两家共同缺的显示能力**(实测计数):

| 能力 | graphcalc | 站点 | 备注 |
| --- | --- | --- | --- |
| `<output>` 语义 | 0 | 0 | 读出行全是 `<div>` / `<span>` |
| `title=` 全精度逃生口 | 0 | 0 | 现有 `title` 都是非数值标签 |
| `font-variant-numeric: tabular-nums` | 1 处(`css/process.css:131`) | 0 | 且那一处是**步骤序号**,不是数值读数 |
| `aria-live` | 1 处(`appViews.ts:117`,诊断坞) | 0 | 唯一一处不是数值读数 |

### 1.2 窗口/面板正文的布局事实

| 位置 | 现状 |
| --- | --- |
| `styles/desktop.css:184-192` | `.window > .window-body`:`display:flex; flex-direction:column; flex:1 1 auto; min-height:0; padding:0; overflow:hidden` |
| `styles/desktop.css:194-197` | `.window-body > * { flex: 1 1 auto; min-height: 0 }` -- **通吃所有直接子节点** |
| `styles/widgets.css:529-534` | `.ui-panel-body`:`flex:1 1 auto; min-height:0; padding:var(--panel-body-padding)`(**没有 `display`**,块级) |
| graphcalc `css/panels.css:19-27` | `.panel` / `.right-page` 只写 `display:flex; flex-direction:column; min-height:0`,**刻意不写 `flex:1 1 auto`**:注释明写"`.window-body > *` 已经给了,两处都写就会在下一次改窗口正文骨架时漏掉一处" |
| graphcalc `css/panels.css:38-59, 99-118` | 三种手搓排布:滚动中段(`flex:1 1 auto; min-height:var(--...); overflow-y:auto`),定高底栏(`flex:0 1 auto; max-height:34%` + `:empty{display:none}`),唯一子元素自己当滚动区 |
| graphcalc `css/process.css:20-38, 185-191` | 固定页头 / 固定截断提示**一条 flex 声明都没有**(靠默认 `flex:0 1 auto`);全应用 `flex:0 0 auto` 只有 3 处,全在行内小件上 |
| 站点 `src/oled/ui/oled_panel.ts:275-280` | 3 个 `<br>` 当纵向间隔(面板体没有 `gap`/`margin`) |
| 站点 `src/setting/setting.css:37-45` | 三块 `fieldset` 的组间距靠 `margin: var(--...) 0 var(--...)`,注释明写"上一组的 margin-bottom 与下一组的 margin-top 会塌成较大的那个" |
| `src/desktop/WindowManager.ts:660-663` | `_applyGeometry` 写 `--window-body-height`(给浮层的 `max-height` 用) |
| `styles/widgets.css:135-146` | `.menu-panel` 消费 `--window-body-height`;**没有 `--window-body-width`** |
| README.md:269-274 | `Splitter` / `ScrollArea` / 表格件 / `TextField` 明确列为"还没做的" |
| 全库 | **没有 JS 测量排版**(布局全靠 CSS).两个例外都在编辑器对齐:`EditorLineNumbers` / `EditorHighlight` 各持一个 `ResizeObserver`(尺寸变化不一定补发 `scroll` 事件);`EditorHighlight` 还用 `requestAnimationFrame` 合并输入重绘.窗口侧仍走 `WindowManager.onGeometryChange(id)`.**注意**:初稿把这里写成"全库没有 `ResizeObserver`",是错的(见 4.4 第 6 条) |

## 2. 问题

### 2.1 数值/文本

1. **同一份值,三种文本**.`1e6` 在数字框里是 `1000000`(`String`),在用了
   `formatNumber` 的读数里是 `1.000000e+6`;`0.1+0.2` 一个显示
   `0.30000000000000004`,另一个显示 `0.3`.这不是"消费者选错了",而是库把
   口径的全部选择权下放了,又没有给一个可共享的对象.消费者侧的 6 套并行口径
   (1.1)就是这条的后果.
2. **`formatNumber` 库内零引用**.消费者在用,但库里的 `Slider` / `NumberField`
   默认都不走它,于是"库导出的口径"与"库控件的口径"是两回事.
3. **编辑态与显示态被同一个 `format` 混在一起**.`NumberField.format` 同时承担
   "给用户看的文本"和"能解析回来的文本".这两件事的要求相反:显示要短,要好看,
   编辑要能被 `Number()` 咬住.所以消费者一改 `format`,就把可编辑性一起改了.
   站点为此**放弃了百分比显示**:`setting/page_opacity.ts:40-47` 写着"数值框这边
   还必须给**纯数字**文本:它是 `<input type="number">`,写 `90%` 会被浏览器当成
   非法值丢掉(框里变空),所以这里不做百分比换算".
4. **没有只读显示件**.`createNumberRow` / `createSwitchRow` 都有,唯独"只读的
   值"没有,于是 `example` 里的 `createReadout` 与 `.readout*` 样式注定要在每个
   应用里重写一遍(站点 6 处,graphcalc 6 套口径,见 1.1).
5. **两处顺手该补的能力**:全精度 `title` 与 `tabular-nums` 在两家都是 0
   (1.1 表),`<output>` 语义也是 0.这三样对消费者是零改动的净收益.

### 2.2 窗口内布局

1. **`.window-body > *` 是通吃规则**.它同时表达了三件事:拉伸,给 `min-height:0`,
   隐式等分(多个直接子节点各拿 1 份 `flex-grow`).三件事都不该是默认值:
   - 放两个 `<div>` 就直接对半分高/按内容比压缩,这从来没人声明过(两家现有布局都是
     单子节点,所以这条今天没人踩到,但它是一条**没有出口**的隐式约定);
   - 按钮被拉成整行宽(`example` 只好反向抵消 -- 见 `example.css` 的 `.pane > button`);
   - 顺带一提,库给的那条 `flex: 1 1 auto` 正是 graphcalc 单子节点窗口**今天**能铺满的
     原因(`css/panels.css:19-21` 的注释明写"不要再写一遍").所以换掉它必须让
     `:only-child` 顶上来 -- 这也是 Phase 4 只能"单独决策,可以往后放"的原因(4.2).
2. **"正文里怎么排"没有库内契约**.graphcalc 为此写了一份注释当契约
   (`css/panels.css:19-21`:不要再写 `flex`),站点则发明了自己的节奏(`<br>` +
   `margin` + `gap`).同一件事两种做法,都不是库定的.
3. **滚动没有出口,而且每个窗口都要重来一遍**.正文是 `overflow:hidden`;要滚动,消费者
   得自己套一层 `overflow:auto` + 手挂 `.ui-scrollbar` + 在每一层上写 `min-height:0`
   (漏一层就是"滚不动"或"被压扁").实测两家合计:**手挂 14 + 1 处,漏挂 2 处**(1.0 表).
   更要紧的是这段 CSS 是同一件事抄三遍:graphcalc 的 `#view-controls`(8 条),
   `#params-panel`(6 条 + 一个 `:root` 令牌),`.object-list-body`(5 条 + 4 层包裹),
   站点面板正文再用 margin 排一遍 -- **这就是"主目标是两个原语"的理由**(第三轮).
4. **定高内容的下限没有出口**.graphcalc 要"窗口被拖到太矮时,内容先压到 120px,
   再自己出滚动条,而不是把窗口撑破"(`css/panels.css:33-37`,`uiConfig.ts:158-161`).
   它现在的实现是**直接对抗**库的 `min-height:0`:自己定义两个 `min-height` 令牌,
   经 `applyUiConfig()` 写进 `:root`(见 4.3 的接口缺口).
5. ~~"固定栏"今天并不固定(初稿的 Phase 4 唯一硬理由)-- **2026-10 第三轮作废**~~.
   初稿拿"正文高 263px 里塞 400px + 40px 两块"的**合成块**当证据,推出 `.process-header`
   被压成 23.9px -- 在真实层级里不成立:那两个"固定栏"是窗口正文的**孙节点**
   (`.window-body > .right-page > .process-panel > header`),`.window-body > *` 根本吃不到
   它们;它们在 `.process-panel` 里是 `min-height:auto`(内容下限),而
   `.process-steps`(`flex:1 1 auto; min-height:0`)先吸收全部收缩.
   实测(真实结构 + graphcalc 真实 CSS,9 个窗口高 480->120px):`.process-header` 恒
   **99px**,`.process-truncated` 恒 **29px**,`.process-steps` 始终可滚,现状与
   "Phase 4 之后"**逐像素相同**.所以"该固定的被压扁"这个真实缺陷不存在,Phase 4 只能
   算契约澄清(4.2-b,D13).
6. **站点侧会为"面板正文改列 flex"付出代价(实测)**.站点 5 块面板的正文靠
   `margin` 间隔;改成列 flex 后 margin 不再塌陷,SETTING 页的组间距从 16px 变成
   26px(4.6).而它从"拉伸语义"里拿不到任何好处 -- 它的面板没有定高.

## 3. 方案 A:数值/文本显示的统一

### 3.1 分三层,先把概念拆开

```text
   ┌ 口径(纯数据,无 DOM) ─────────────────────────────┐
   │  ValueText<T> = { toText(v): string; fromText(t): T | null } │
   └──────────────────────────────────────────────────────┘
              │ 同一个对象被三处共用
              ▼
   ┌ 编辑态 ─────────┐   ┌ 显示态 ─────────┐
   │ NumberField     │   │ createValueDisplay │
   │ Slider          │   │ createReadoutRow   │
   │ RangeInput      │   │ (只读 <output>)    │
   └─────────────────┘   └────────────────────┘
```

`ValueText<T>` 刻意是**一个对象**而不是两个回调:口径要能整体传递
(`const text = numberText({...})`,然后 `NumberField` / `Slider` / 读数三处给同一个
`text`),否则"统一"只是口号.

### 3.2 接口草案

```ts
// src/shared/numberText.ts(重写内部,保留旧导出)
export interface ValueText<T> {
    /** 值 -> 文本.同一输入必须同输出(纯函数,无状态,不读环境). */
    toText(value: T): string;
    /** 文本 -> 值;不可解析返回 null(不抛,不猜). */
    fromText(text: string): T | null;
}

export interface NumberTextOptions {
    /** 定点小数位;默认 6(与 formatNumber 同值). */
    readonly digits?: number;
    /** 尾零与末尾小数点是否去掉;默认 true. */
    readonly trimZeros?: boolean;
    /** 回退科学计数法的量级开区间;默认 { low: 1e-4, high: 1e6 }. */
    readonly exponentialAt?: { readonly low: number; readonly high: number };
    /** 科学计数法保留几位;默认 = digits. */
    readonly exponentialDigits?: number;
    /** `-0` 是否显示成 `0`;默认 true. */
    readonly minusZeroAsZero?: boolean;
    /** 非有限值文案;默认 `String(v)`(即 `NaN` / `Infinity` / `-Infinity`). */
    readonly nonFinite?: (value: number) => string;
    /** 千位分隔符(显示档专用);默认不加. */
    readonly group?: false | string;
    /** 固定后缀(显示档专用,如 `°`);默认无. */
    readonly suffix?: string;
    /**
     * 科学计数法的**语法**(2026-10 新增,消费者逼出来的).
     *
     * 说明:同一个"档位"(几位小数,什么时候回退指数,尾零怎么办)会被三种
     * **不同的文本语法**消费,而初稿把它们绑成了一个纯文本对象:
     *   - `'plain'`(默认):`1.000000e+6` / `0.3`;
     *   - `'latex'`:`2.775558\times10^{-17}`(graphcalc 的 `math/latexNumber.ts`
     *     为了这个语法,把 `1e-4 / 1e6 / 6 位` 的档位重抄了一遍,注释里自陈
     *     "与库的 formatNumber 同一档位");
     *   - `'edit'`:见 3.3,必须是合法 number input 语法.
     * 档位是**策略**,语法是**渲染**;合成一个对象就装不下 LaTeX 这条路.
     */
    readonly syntax?: 'plain' | 'latex' | 'edit';
}

/** 默认口径 = 现在 formatNumber 的行为,一位不差. */
export function numberText(options?: NumberTextOptions): ValueText<number>;
/** 数字数组:`[1, 2, 3]`;分隔符与括号可配. */
export function numberVectorText(options?: NumberTextOptions & {
    readonly bracket?: readonly [string, string];
    readonly separator?: string;
}): ValueText<readonly number[]>;

/** 两个预置(命名常量,消费者直接引用,不必记参数). */
export const NUMBER_TEXT_EDIT: ValueText<number>;    // 编辑档
export const NUMBER_TEXT_DISPLAY: ValueText<number>; // 显示档

/** 旧的纯函数原样保留(实现改为调用默认预置),行为由现有单测冻结. */
export function formatNumber(value: number): string;
export function formatVector(value: readonly number[]): string;
/** 解析也搬进来成为公开口径(现在藏在 NumberField 里). */
export function parseNumber(text: string): number | null;
```

### 3.3 编辑档必须是"合法 number input 语法"

这是本方案里**最容易踩,必须写成硬规则**的一条:

`<input type="number">` 的 `value` 写入时会做**值消毒**(value sanitization):
不合法的字符串被浏览器**静默替换成空串**.也就是说,如果消费者给 `NumberField`
一个带千位分隔符或单位的 `format`(比如 `1,234.5` 或 `0.6 rad`),
`input.value = format(next)` 的结果是**输入框变空**,而且值源没变,没有报错.

**这条不是猜的**:站点独立踩到并写进了注释 -- `src/setting/page_opacity.ts:40-47`:
"数值框这边还必须给**纯数字**文本:它是 `<input type="number">`,写 `90%` 会被
浏览器当成非法值丢掉(框里变空),所以这里不做百分比换算."库把这条变成硬规则,
消费侧就不必各自记住它.

由此定两条:

1. `NUMBER_TEXT_EDIT` 的 `toText` 输出**必须**匹配
   `^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$`(允许指数,不允许分隔符 / 空白 / 单位),
   单测对所有边界值穷举这条正则;
2. 分隔符与后缀(`group` / `suffix`)**只有显示档能用**;`numberText` 模块提供
   `assertEditSafe(text: ValueText<number>): boolean` 作开发期自检,`NumberField`
   在 `NODE_ENV !== 'production'` 时对自己的口径跑一次,不合格就在控制台告警并
   降级到 `String()` -- 坏口径不该以"输入框空白"的形式出现.

编辑档与显示档的差别只有两处,其余全部继承默认:

| 选项 | `NUMBER_TEXT_EDIT` | `NUMBER_TEXT_DISPLAY` |
| --- | --- | --- |
| `exponentialAt` | `{ low: 1e-6, high: 1e15 }` | `{ low: 1e-4, high: 1e6 }`(同 `formatNumber`) |
| `group` / `suffix` | 恒为 `false` / 无 | 可选,默认也不开 |

"编辑档把科学计数法的门槛放宽"的理由:`1000000` 这种量级落在可编辑框里,
`1.000000e+6` 会让用户没法直接改第 4 位;而 `String(1e21) === '1e+21'` 本来就是
指数,浏览器接受,所以放宽到 1e15 不引入新语法.

> **消费者侧的位数现实**(2026-10):预置的 6 位对两家都不合用 -- 站点要 2 位
> (`page_opacity.ts:45`),graphcalc 要 4 位去零(`ViewPanel.ts:66`).所以两个预置
> 必须允许 `digits` 覆盖(`numberText({ ...NUMBER_TEXT_DISPLAY, digits: 2 })`),
> 单测要覆盖"预置 + digits 覆盖"这条路.

### 3.4 只读显示件

```ts
// src/widgets/ValueDisplay.ts(新)
export interface ValueDisplayOptions<T> {
    readonly value: ValueSource<T>;
    readonly text?: ValueText<T>;          // 默认:number 用 NUMBER_TEXT_DISPLAY,其余 String
    /** 全精度文本,写进 title;默认对 number 用 `String(v)`(最短往返表示). */
    readonly exact?: (value: T) => string;
    /** 空值文案;默认 '-'. */
    readonly placeholder?: string;
    /** 值更新是否让读屏播报;默认 false(见下). */
    readonly announce?: boolean;
    /** `<output for=...>`:关联产生这个值的输入框 id. */
    readonly forIds?: readonly string[];
    /** 追加在 `.ui-readout-value` 上的消费者类名(与 createButton 同一条约定). */
    readonly class?: string;
}
export interface ValueDisplayHandle<T> {
    readonly element: HTMLOutputElement;
    set(value: T): void;
    dispose(): void;
}

/** 一行读数:复用 `.control-row`,只给值那半边的外观. */
export function createReadoutRow<T>(
    name: string,
    options: ValueDisplayOptions<T>,
): { readonly row: HTMLDivElement; readonly value: ValueDisplayHandle<T> };
```

产出结构(与 `createNumberRow` 同一套行词汇,消费者不写库的类名):

```html
<div class="control-row">
  <span class="ui-readout-name">方位角</span>
  <output class="ui-readout-value" aria-live="off" title="0.5999999999999999">0.6</output>
</div>
```

四条硬约定:

1. **`<output>` 语义对,但默认不播报**.HTML-AAM 把 `<output>` 映射成
   `role="status"`(隐式 live region);拖动滑杆时它每帧都变,不关掉就是读屏轰炸.
   所以库固定写 `aria-live="off"`,要播报才由 `announce: true` 交给 ARIA
   (`aria-live="polite"` + `aria-atomic="true"`).
2. **显示文本短,`title` 给全精度**.`0.1+0.2` 显示 `0.3`,
   `title="0.30000000000000004"`,鼠标停上去就能看到真实值.这条替代"提高小数位
   直到看得出来"那种做法.两家现在都没有这个逃生口(1.1),装进库是零改动收益.
3. **等宽数字,不跳字**.`.ui-readout-value` 带
   `font-variant-numeric: tabular-nums;`(token 另有 `--code-font-family` 出口),
   拖动时数字宽度不抖动.两家现在合计只有 1 处 `tabular-nums`,而且不是读数.
4. **只读,不进 Tab 序**.显示件不接收键盘输入,所以不给 `tabindex`;
   需要"点一下变成可编辑"的那条路留给 `TextField`(README 已列出的补件),
   本方案不顺手造它.

### 3.5 现有控件的接入(不破坏选项名)

`NumberField` / `Slider` **新增**一个可选 `text?: ValueText<number>`,与既有的
`format` / `parse` 并存,优先级 `text` > `format`/`parse` > 默认.

- 加而不删:现有调用一行不用改;
- 默认档的切换放在 Phase 2(破坏性,见第 6 节):`String(value)` ->
  `NUMBER_TEXT_EDIT`.这是"统一"真正落地的那一步 -- 不切默认,统一只是多了个
  没人用的对象.
- `RangeInput` 加 `text?: ValueText<number>`,只用于 `input.value` 的写入
  (`.value` 对 range 只是字符串,不显示数字,但保持同一个口径免得将来分叉).

> **现状提醒**:站点 7 条 metro 滑块的 `step` 是 `0.01` 且 `min` 有 `0.2`
> (`metro_window/src/config.ts:242-254`)却不传 `format`,数值框会露出
> `0.8999999999999999` 这类尾巴;唯一传了 `format: toFixed(2)` 的那条正是为了躲它
> (`setting/page_opacity.ts:75`).所以"默认档"这件事的收益在站点侧是**现成的**:
> 7 条滑块一行不改就干净.

### 3.6 与既有机器契约的关系

- `test/emittedClasses.test.ts`:`ui-readout-name` / `ui-readout-value` 必须在
  `styles/widgets.css` 里有真规则(不能进 `INTENTIONAL_HOOKS`);
  `control-row` 已有规则,复用不给白名单加一条.
- `scripts/check_ui_boundary.py`:口径层是纯函数(`src/shared/`),不碰
  `document` / `window` / id,八条断言不受影响;库不引新依赖(`Intl` 是标准全局,
  见决定 `D1`).
- `src/index.ts`:`export * from './shared/numberText'` 已经在了;新件按现有分组
  补一行 `export * from './widgets/ValueDisplay'`.

## 4. 方案 B:窗口内布局确定

### 4.1 三层

```text
   ③ 尺寸口径   --window-body-width / -height(JS 写的派生量)+ onGeometryChange
   ────────────────────────────────────────────────────────────────
   ② 布局原语   createStack / createScrollArea(本期;Splitter 按 D7 无限延后)
   ────────────────────────────────────────────────────────────────
   ① 正文默认   唯一子节点拉满;直接子节点不拉伸 / 溢出裁切 = Phase 4,**可不做**
```

原则:**默认值是确定的,拉伸是显式的**.现在正好相反.

> **第三轮**:①②两层的分工变了 -- **②是主目标**(顺序堆叠 + 滚动出口),
> ①是可选的契约澄清,而且两个原语不依赖 ①(见 4.2-b / D13).所以本期只落 ②.

### 4.2 ① 正文默认口径:先落"显式拉伸";默认值是否改写另议(Phase 4 可不做)

**先说实测(2026-10,headless Chromium 154,对库真实样式表,未改任何仓库)**.

**a. 去掉通吃规则,对两家现有布局是 no-op** -- 两家窗口正文全是单子节点
(graphcalc 6/6,示例 4/4),`:only-child` 兜住了:

| 场景 | 现状(`1 1 auto`) | 方案(`0 0 auto` + `:only-child{flex:1 1 0}`) |
| --- | --- | --- |
| 单子节点,内容矮 | child **263.0** | child **263.0** |
| 单子节点,内容 500px 超高 | child **263.0** | child **263.0** |

**b. 真实元素上的复测(第三轮,推翻初稿的外推)**:graphcalc `process` 窗口的真实层级
(`window-body > .right-page > .process-panel > header + steps + truncated`,真实 CSS)在
9 个窗口高(480 / 400 / 340 / 300 / 263 / 240 / 200 / 160 / 120px)下,`.process-header`
恒 **99px**,`.process-truncated` 恒 **29px**,`.process-steps` 始终可滚 -- 现状与
"Phase 4 之后"**逐像素相同**(原因见 2.2 第 5 条:那两个"固定栏"是孙节点,
`.window-body > *` 吃不到).

初稿那张"239.1 / 23.9"的表是**合成块**测的(两块直接放进窗口正文,才吃得到通吃规则);
那个场景两家消费者都没有,已作废.同一份合成结构换个层级就复现不出来,这也是
"抽象地造形状"的代价.

**所以 Phase 4 的定位要改**:它不是"修一个真实缺陷",而是"把'唯一子节点铺满,其余按内容高'
从一条巧合的默认值写成契约".而三条显式出口(`:only-child` / `.ui-fill` / `.ui-scroll-area`)
**不依赖它**就能生效(第三轮实测:把 4.2 下面那条 `> *` 注释掉重跑,五张真实结构的卡片
结果一字不差).结论:**Phase 3 先做,Phase 4 可不做**(第 6 节,D13).

契约写在**面板正文这一层**(窗口复用面板,见 4.6):

```css
/* styles/widgets.css:正文容器的排布契约 */
.ui-panel-body {
    flex: 1 1 auto;
    min-height: 0;
    min-width: 0;
}

/* 直接子节点默认**按内容高排**:不拉伸,也不被压扁.
   **这一条是 Phase 4 的可选部分(第三轮降级为可不做)**:下面的显式出口不依赖它.
   为什么不留 CSS 默认的 `0 1 auto`:它允许压缩 -- 内容比正文高时会被压扁
   而不是被裁掉(画布/图片尤其明显).`0 0 auto` 让溢出表现为裁切,与
   `.window-body` 的 `overflow:hidden` 一致,也让"确定"有个唯一答案. */
.ui-panel-body > * { flex: 0 0 auto; }

/* 三条显式拉伸出口(特异度 0,2,0 > 上面那条 0,1,0,顺序无关)**是 Phase 3 的全部**:
   - 唯一子节点:编辑器 / 画布 / 单个 pane 占满正文这个常见情形;
   - .ui-fill:多个区域里明确声明"这块吃掉剩余";
   - .ui-scroll-area:显式滚动区(语义见 4.3).
   basis 用 0 而不是 auto:多个 fill 时**均分**剩余高度,不按内容比(见 4.4 第 1 条). */
.ui-panel-body > :only-child,
.ui-panel-body > .ui-fill,
.ui-panel-body > .ui-scroll-area {
    flex: 1 1 0;
    min-height: 0;
    min-width: 0;
}

/* styles/desktop.css:窗口正文自己要是**列 flex**(窗口这一半照旧,见 4.6/D8-A),
   相对面板的差异只有 padding 与 overflow.`flex: 1 1 auto; min-height: 0`
   由上面的 `.ui-panel-body` 给,这里不抄第二份(graphcalc `panels.css:19-21` 的
   同一条教训).
   **注意**:Phase 4 删的是 `.window-body > *` 那条通吃规则,不是下面这一段 --
   `display` / `flex-direction` 必须留着,漏一条窗口正文就塌成内容高. */
.window > .window-body {
    display: flex;
    flex-direction: column;
    padding: 0;
    overflow: hidden;
}
```

**但"默认给 `.ui-panel-body` 加 `display:flex; flex-direction:column`"这一步建议
拆出来单独决策(7/D8)**:实测它会打断面板正文的 margin 塌陷(4.6),而站点从
"拉伸"里拿不到好处.两种落法:

- **A(推荐,opt-in)**:`.ui-panel-body` 默认**保持块级**;`createPanel({ stack: true })`
  (或 `.ui-panel-stack` 类)才给列 flex + `gap`;窗口正文的排布契约写在
  `.window > .window-body`(窗口这一半照旧是列 flex).好处:站点零迁移;坏处:
  窗口与面板的"同一份契约"变成"同一份子节点策略 + 可选的栈容器".
- **B(全量,初稿写法)**:`.ui-panel-body` 直接变列 flex,消费侧同步把面板正文的
  `margin` 间距改成 `gap`.好处:一处契约;坏处:站点 5 块面板,约 17 处间距规则要
  跟着改(站点 <br> 间隔实测不受影响,见 4.6).

两条要注意的(对两种落法都成立):

- `:only-child` 会命中"正文里恰好只有一个节点"的所有情形,包括那个节点是
  `.ui-scroll-area` 或 `.ui-fill` -- 结论一致,不冲突;
- `.ui-scroll-area` 的 `overflow` 在 `layout.css`(0,1,0),这里的拉伸在
  `widgets.css`(0,2,0),两者属性不重叠,所以单独引 `widgets.css` 或单独引
  `layout.css` 都不会把对方盖坏.

**分期上的一个细节**:三条显式拉伸出口是 `(0,2,0)`,已经高于旧规则
`.window-body > * { flex: 1 1 auto }` 的 `(0,1,0)`,所以布局原语在 Phase 3
就能直接生效,不必等 Phase 4.而"默认不拉伸"那条与旧规则**同特异度**,谁赢由
`styles.css` 的导入顺序决定(桌面在后 -> 旧规则赢),所以它只能和"删掉旧规则"
一起做 -- 这也是 Phase 4 必须单独立项,也因此可以一直往后放的原因.

### 4.3 ② 布局原语(本期两个:Stack + ScrollArea;Splitter 见 D7)

```ts
// src/layout/Stack.ts
export interface StackOptions {
    readonly children?: readonly Child[];
    readonly direction?: 'column' | 'row';   // 默认 column
    readonly gap?: string;                   // 默认 var(--layout-gap)
    readonly padding?: string;               // 默认 var(--layout-padding)
    readonly align?: 'stretch' | 'start' | 'center' | 'end' | 'baseline';
    readonly justify?: 'start' | 'center' | 'end' | 'between';
    /** 吃掉剩余空间(等价于在正文里 .ui-fill);默认 false. */
    readonly fill?: boolean;
    /** 消费者作用域类(2026-10 新增,见下面的"接口缺口 1"). */
    readonly class?: string;
}
export function createStack(options?: StackOptions): {
    readonly element: HTMLDivElement;   // .ui-stack[.ui-stack--row][.ui-fill]
};

// src/layout/ScrollArea.ts
export interface ScrollAreaOptions {
    readonly child?: Child;
    /** 只滚一个轴;默认 both. */
    readonly axis?: 'y' | 'x' | 'both';
    /** 给内部内容加内边距(留白归滚动区,滚动条贴外沿);默认 var(--layout-padding). */
    readonly padding?: string;
    /**
     * 内容下限(2026-10 新增,见下面的"接口缺口 2"):默认 `0`
     * (方案的唯一语义是"吃掉剩余,超出就滚");给成 `var(--...)` 或 `120px`
     * 就变成"窗口比下限还矮时,先停在下限,再自己滚".
     */
    readonly minHeight?: string;
    readonly class?: string;
}
export function createScrollArea(options?: ScrollAreaOptions): {
    readonly element: HTMLDivElement;
    readonly content: HTMLDivElement;
};

// src/layout/Splitter.ts  (README 的补件清单里那一项;需求见 7/D7,已降级)
export interface SplitterOptions {
    readonly first: Child;
    readonly second: Child;
    readonly direction?: 'column' | 'row';        // 默认 row(左右分)
    readonly ratio?: ValueSource<number>;          // 0..1;给 signal 就是双向持久化
    readonly minRatio?: number;                    // 默认 0.1
    readonly label?: string;                       // separator 的可访问名
    readonly class?: string;
}
export function createSplitter(options: SplitterOptions): {
    readonly element: HTMLDivElement;   // .ui-splitter
    readonly first: HTMLDivElement;     // .ui-splitter-pane
    readonly second: HTMLDivElement;
    readonly handle: HTMLElement;       // role="separator"
    dispose(): void;
};
```

`createStack` / `createScrollArea` 是"类名契约的出口":消费者**不写库的类名**
(与 `Row.ts` 的既有约定一致),库改类名不破坏消费者.

**接口缺口(2026-10 由消费者证据逼出来,必须在实现前定死)**:

1. **`class` 出口不是可选项**.graphcalc 的 `src/config/styleLayers.test.ts:122-144`
   **禁止**应用给"只含库的类"的选择器写样式(选择器里必须有一个库不拥有的类).
   于是 `createScrollArea` 一旦产出 `.ui-scroll-area`,消费者就**无法**给它写
   `min-height` -- 而 graphcalc 现在正是这么做的(`css/panels.css:40`
   的 `#view-controls{min-height:...}`).库对 `createButton` / `createBadge` /
   `createPanel` 已有"基线在前,消费者作用域类在外"的约定,布局原语漏了这条.
2. **`ScrollArea` 需要 `minHeight`**.graphcalc 要的恰是"压到 120px 就停住,再滚"
   (`--view-controls-min-height` / `--params-panel-min-height`,
   由 `UI_CONFIG.panel` 经 `applyUiConfig` 写成 `:root`,见
   `src/config/uiConfig.ts:158-167`,`src/app/applyUiConfig.ts:36-38`).
   只有 `min-height:0` 的滚动区表达不了这条反方向需求.
   **注**:这两个令牌原本被抄进了库的 `styles/tokens.css` 与 `theme/tokens.ts`
   (领域名进库,违反第 8 节第 1 条),**2026-10 已清出库**(见第 5 节).
3. `createStack` 的默认 `gap` / `padding` 走新 token(4.7);消费者要自己的间距
   就在外层再加一个类,不必改原语的默认值.

`.ui-scroll-area` 的定义刻意**只有一个语义**:它就是那块"吃掉剩余高度,超出就滚"
的区域(`flex:1 1 0; overflow:auto`,拉伸部分见 4.2).要一个**固定高度**的滚动框,
用 `minHeight` 与自己的类压 `flex`,或不要它 -- 库不提供第二种滚动语义,否则
"确定"又变成两种解释.

`styles/layout.css` 只放原语自己的外观(`.ui-stack*` 的 `gap/padding/方向`,
`.ui-scroll-area` 的 `overflow`,`.ui-splitter*`),不写任何"父亲是谁"的选择器;
挂进 `styles/styles.css` 的位置是 **`widgets.css` 之后,`desktop.css` 之前**
(总入口现有的 `token -> 滚动条 -> 控件 -> 桌面` 顺序里,布局原语属于"控件"那一档),
见 4.8 的分发三门.

`Splitter` 的比例换算与夹取抽成纯函数(`src/layout/splitterGeometry.ts`),
与 `desktop/WindowGeometry.ts` 同一条路数:没有 DOM,单测穷举.

### 4.4 确定的六条不变量(写成契约,不是注释)

> **第三轮注**:六条是**目标契约**.其中第 1 条"直接子节点不拉伸"依赖 Phase 4,
> 已降级为可不做;其余五条在 Phase 3(两个布局原语 + 三条显式出口)就成立.

1. **直接子节点不拉伸**;只有 `.ui-fill` / `:only-child` / 布局原语自己声明的
   `fill` 拉满.多个 fill 用 `flex: 1 1 0`,**均分**剩余高度(不是按内容比).
2. **分配顺序 = DOM 顺序**:先出现的在上,吃掉剩余的在中,收尾的在下;
   库不提供 `order` 之类的视觉错位.
3. **溢出只发生在显式声明的滚动区**;`.window-body` 自身 `overflow:hidden`,
   裁切而不是压缩(所以子节点是 `0 0 auto` -- 这一半是 Phase 4 的可选部分).
   实测见 4.2-b:**溢出会被静默裁掉**,这正是"必须显式声明滚动区"的代价与理由.
4. **滚动区必须整体滚**:`createScrollArea` 产出的容器同时带 `ui-scroll-area` 与
   `ui-scrollbar`(见 4.5 的决定),它的 `min-height` 由原语自己写,消费者不必
   再沿链补.
5. **浮层不进正文**.正文 `overflow:hidden` 会切掉浮层;窗口浮层的唯一出口是
   标题栏的 `overlays` 槽(它就在 `.window-header` 里,见 `WindowFrame.ts:120-129`),
   面板浮层用 `Popover`(需要定位父级).这条把"为什么有 overlays 槽"落成规则.
   **消费者侧的印证**:graphcalc 的示例菜单必须走 `slots.overlays`
   (`src/config/uiConfig.ts:278`),而它的 `.panel` 也因此**不能**写 `overflow`
   (`docs/windowing-plan.md` 的 B2 第 3 条).
6. **尺寸只来自配置与 token**:`--dock-reserve` / `--window-header-height` 由
   `WindowManager` 写(已有);布局原语不写任何魔法数,间距/内边距走
   `--layout-gap` / `--layout-padding` 两个新 token.需要在尺寸变化时重排的件
   订阅 `onGeometryChange(id)`.
   **原语本身不做 JS 测量**:布局靠纯 CSS(`flex` / `overflow`)表达,这是"确定"
   的一部分,不是"库不许用 `ResizeObserver`".
   **初稿在这里写错了**(2026-10 更正):原文说"不引 `ResizeObserver`(与「不用批处理,
   不引调度器」同一条约束,也是 900 行 DOM 桩还能用的前提)"-- 三条都不成立:
   - 库**已经在用** `ResizeObserver`:`EditorHighlight.ts:87` 与
     `EditorLineNumbers.ts:87`(理由写在 `EditorHighlight.ts:85-88`:面板折叠/拖宽
     会改变编辑器尺寸,滚动位置可能被浏览器夹回去,而且**不一定补发 `scroll`
     事件**);
   - 它**不影响**测试:`src/testing/domStub.ts:681` 的 `StubResizeObserver` 提供了
     可手动 `trigger()` 的替身,并通过 `domStub.resizeObservers` 暴露给断言
     (`EditorHighlight.test.ts:119`,`EditorLineNumbers.test.ts:69` 就在用它);
   - README 那条约束管的是**响应式更新路径**(`effect` 同步执行,`set()` 返回时订阅者
     已经跑完),它不覆盖视图层的帧合并(`EditorHighlight.ts:123` 的
     `requestAnimationFrame`,桩里同样有替身:`domStub.ts:900,916`)与反馈计时
     (`FormulaCopyController.ts:149` 的 `setTimeout`).
   **缺口**:`onGeometryChange` 只服务**窗口**;站点用的是面板,没有 id 可订阅,
   所以站点只能自己 `ResizeObserver`(metro_window)或 `window.resize`(OLED).
   面板尺寸变化的出口本方案**不提供**,记为不做的事(第 8 节).

### 4.5 与"滚动条是单独一条规定"的正面冲突(必须拍板)

`test/scrollbarStyles.test.ts:11-13` 的注释写着"库的组件也不产出这个类 --
唯一的接触面是消费方自己往滚动容器上加的类名".而 4.4 第 4 条要求
`createScrollArea` 替消费者挂上 `.ui-scrollbar`.两者只能选一个:

| 方案 | 做法 | 代价 |
| --- | --- | --- |
| **A(推荐)** | 由 `createScrollArea` 挂 `.ui-scrollbar`;`styles/scrollbar.css` 一个字符不改(仍然自足,无反向引用);把测试注释改成准确表述,并**新增一条正向断言**:库内产出 `ui-scrollbar` 的 TS 文件只能是 `src/layout/ScrollArea.ts` | 需要改一条测试的注释 + 加一条断言;库与滚动条规定之间多了一条"语义引用"(不是样式耦合) |
| B | `createScrollArea({ scrollbar?: boolean })`,默认 `false`,消费者自己挂 | 保留原文,但"窗口内布局确定"就漏掉了滚动容器这一半 -- 消费者仍要记得挂类,而这正是本方案要消灭的"记得" |

选 A 的理由:那条测试真正守的是**样式自足**(`scrollbar.css` 的选择器只挂
`.ui-scrollbar`,取值只来自 token,别处不许给它写规则),这三条 A 全都不破.
"库内没有任何地方产出这个类"只是当年为了说明"独立"顺手写下的一句话,不是那份
规定的价值本身;而 `createScrollArea` 正是"滚动容器"这个语义在库里的唯一出口.

**消费者侧的量化理由(2026-10)**:手挂类这件事现在的成本是
**graphcalc 14 处 + 站点 1 处,另有站点 2 处滚动区漏挂**
(`public/css/ieee754.css:174,185` 的 `.ieee-formula` / `.ieee-special` 有
`overflow-x:auto` 却没有 `.ui-scrollbar`,于是这两块滚动区与全站滚动条主题脱节).
A 方案直接消灭这 17 个点.

### 4.6 面板与窗口共用同一份契约

库已经把"窗口 = 面板 + 几何与拖动"分了层(`Panel.ts` 文件头,`desktop.css` 的
`.window ...` 覆盖).布局契约跟着这条分层走:

- `styles/widgets.css` 的 `.ui-panel-body` 拿到**通用**部分(子节点策略,见 4.2);
- `styles/desktop.css` 只写窗口的差异(`padding:0`,`overflow:hidden`,列排布),
  不再重复任何排布规则;
- 布局原语(`.ui-stack` / `.ui-scroll-area` / `.ui-splitter`)不依赖任何一个,
  所以嵌进面板正文同样成立.

**实测代价(2026-10,headless Chromium)**:把 `.ui-panel-body` 从块级改成列 flex
对站点意味着两件事,一好一坏:

| 站点面板正文的排版手法 | 块级(现状) | 列 flex |
| --- | --- | --- |
| OLED 的 3 个 `<br>` 间隔 | 间隔 **18.0** | 间隔 **18.0** ✅(`<br>` 被块化后仍占 17px 行高) |
| SETTING 三块 `fieldset` 的 `margin` 间隔 | **16.0**(塌陷) | **26.0**(16+10 **相加**) ❌ |

第二条不是小数目:站点 SETTING 页的组间距,IEEE754 面板 7 个子节点之间的间距
全靠 margin 塌陷,而 `.setting-group` 的注释把"塌陷成较大的那个"写成了**故意**的
行为(`src/setting/setting.css:38`).它是**库的示例抓不到**的回归:示例的 `.pane`
用 `gap`,没有 margin.所以:

- 若走 D8-A(opt-in),这一条不发生,站点零迁移;
- 若走 D8-B(全量),消费侧必须同步把面板正文的 margin 间距换成 `gap`
  (站点 5 块面板,约 17 处规则),并**用站点的真浏览器冒烟验收**(9.5),
  而不是拿库的示例目视.

另一条代价(初稿已写,仍然成立):`.ui-panel-body` 从块级变 flex 后,`margin`
不再折叠,宽度默认拉伸.对面板里常见的一列内容基本无感,但不是零差异;
`ui-panel*` 是 v0.1.8 刚加的,消费面是站点 5 块面板,改动窗口现在还便宜.

### 4.7 三个新 token

```css
/* tokens.css */
--layout-gap: 8px;         /* 布局原语的默认间距 */
--layout-padding: 10px;    /* 布局原语的默认内边距 */
--layout-hit-size: 8px;    /* Splitter 手柄的命中宽度(负偏移跨在边界上,同 resize-handle) */
```

名字取 `--layout-*` 而不是复用 `--panel-*`:前者是"容器怎么排",后者是"框体长
什么样",混用会让"窗口正文没有内边距"这条差异重新变成猜谜.

**顺带一条硬规则(2026-10 已执行)**:库的 `tokens.css` 里**不放消费者域名的
尺寸**.曾经有 `--params-panel-min-height` / `--view-controls-min-height` 两个
应用窗口名令牌(库内零引用,只服务 graphcalc),已退回应用.判据很硬:**库的样式表
里有没有 `var()` 读它?** 没有就别加.建议在库侧补一条机器守卫(第 5 节).

**第三轮给这条判据加个限定**:它只适用于**尺寸类** token -- 库里有 17 个配色/字体
token(`--color-bg-app` / `--color-syntax-*` ...)在库内一次 `var()` 都没被读到,却正是
**给消费者的主题面**.照字面做成守卫会把它们全判违规,所以守卫要写成"被库的样式读
**或**被 JS/消费者读",并且只对尺寸类生效.

> **2026-10 第五轮订正**:这段原文拿 `--katex-font-size` 当"只被消费侧读"的例子,
> 已经不成立 -- 该令牌现在由库的 `widgets.css` 读(`.ui-formula > .katex`,见
> 五轮补第 1 条),它因此从"消费者主题面"变成"库内真读的令牌";剩下的主题面例子
> 以 `--color-*` 为准.

### 4.8 新样式表的分发三门(2026-10 新增)

`styles/layout.css` 是新的一份分组入口,它要过三道门,漏一道就是"库改了但消费侧
不知道":

| 门 | 位置 | 漏掉的症状 |
| --- | --- | --- |
| 1. `exports` | 库 `package.json` 的 `exports`(现在逐份列了 7 个样式入口) | 消费者 `import 'miko_ui/styles/layout.css'` 直接解析失败 |
| 2. 消费者的样式分层守卫 | graphcalc 的 `src/config/styleLayers.test.ts:46-53` 与 `src/config/cssPalette.test.ts:43-48` **逐份列出库的 CSS** | 新表里的类不在"库拥有的类"集合里 -> 应用给它们写样式**不会**被那条契约抓到(静默失效) |
| 3. 站点的引入方式 | 站点 `src/main.ts:32-45` **逐份 import** 库的样式表(不引 `styles.css`) | 新表不会自动到;站点的布局原语将没有样式 |

graphcalc 引的是聚合入口 `miko_ui/styles.css`,所以第 1 门过了它就自动拿到;
站点是逐份引,第 3 门必须显式加一行.这条差异是"库加样式表"这类改动的固定成本,
写进第 5 节的改动清单.

## 5. 改动清单(按文件)

| 文件 | 动作 | 属 Phase |
| --- | --- | --- |
| `src/shared/numberText.ts` | 重写为策略工厂 + 两个预置 + `parseNumber` + `syntax` 轴;保留 `formatNumber` / `formatVector` 旧签名与行为 | 0 |
| `src/shared/numberText.test.ts` | 补策略与边界用例(含编辑档语法正则,`syntax: 'latex'`,`digits` 覆盖) | 0 |
| `src/widgets/ValueDisplay.ts` | 新增 `createValueDisplay` / `createReadoutRow`;**第五轮补 `render?: (text) => Node` 出口**(公式读数) | 1 / 第五轮 |
| `src/formula/FormulaView.ts` | **第五轮**:渲染器出口 `setFormulaRenderer` + 文本替身 `TEXT_FORMULA_RENDERER`;缓存随渲染器整体失效.**第五轮补**:产物总带基线类 `.ui-formula`(令牌要选得到它) | 第五轮 |
| `styles/widgets.css` + `styles/tokens.css` | **第五轮补**:`.ui-formula > .katex { font-size: var(--katex-font-size) }`(0,2,0,压过 KaTeX 自带);`--katex-font-size` 默认 `1.5em` -> `1.21em`(引擎原值) | 第五轮补 |
| `test/formulaFontSize.test.ts`(新) | **第五轮补**:守"令牌唯一消费点 + 选择器 0,2,0 且不包 `:where(` + CSS 类名 = TS 产出" | 第五轮补 |
| `src/shared/numberText.ts` + 其单测 | **第五轮补**:`renderFixed` 去掉"舍入到零"的负号(不再吐 `-0`);单测逐值钉住 `String(Number(v.toFixed(n)))` 等价写法 | 第五轮补 |
| `src/testing/domStub.ts` | **第五轮**:`installDomStub()` 自动装公式文本替身(消费者测试不再 `vi.mock('katex')`) | 第五轮 |
| `package.json` + `package-lock.json` + `scripts/check_ui_boundary.py` | **第五轮**:`katex` 从可选 peer 移进 `dependencies`;守卫改成"允许且要求 `dependencies` 带 katex,`peerDependencies` 为空" | 第五轮 |
| `example/main.ts` / `example/example.css` | **第五轮**:多一条 `方位角(公式)` 读数(口径 `syntax: 'latex'` + `render` 走库的 `createFormulaElement`) | 第五轮 |
| `styles/widgets.css` | `.ui-readout-name` / `.ui-readout-value` 默认规则(含 `tabular-nums`);正文子节点策略(4.2) | 1 / 3 |
| `src/widgets/NumberField.ts` / `Slider.ts` | 加 `text?`(唯一口径出口,`format` / `parse` 两个回调删除);Phase 2 切默认档.`RangeInput` **不给** `text?`:`input.value` / `min` / `max` / `step` 是 DOM 机器属性,机器语法只有 `String(v)`(见 `numberText.ts` 文件头) | 1 / 2 |
| `src/index.ts` | 补导出(`ValueDisplay`,布局组) | 1 / 3 |
| `src/layout/Stack.ts` / `ScrollArea.ts` / `splitterGeometry.ts` / `Splitter.ts` | 新增布局组(三个原语都要 `class` 出口;`ScrollArea` 要 `minHeight`) | 3 / 5 |
| `styles/layout.css` + `styles/styles.css` + `package.json` 的 `exports` | 新增 `./styles/layout.css` 并挂进总入口(4.8 第 1 门) | 3 |
| `styles/desktop.css` | **(Phase 4,已降级为可不做)** 删掉 `.window-body > *` 通吃规则.注意 `.window > .window-body` 自己那几条(`display:flex` / `flex-direction:column` / `flex:1 1 auto` / `min-height:0`)**必须保留** -- 它们才是窗口正文的列 flex;相对面板的差异只剩 `padding:0` 与 `overflow:hidden` | 4(可不做) |
| `styles/tokens.css` | 三个 `--layout-*`;**已清出两个消费者域名令牌(2026-10)** | 3 / 已完成 |
| `src/theme/tokens.ts` | 同步删掉那两个令牌的 JS 镜像 | 已完成 |
| `src/theme/tokens.test.ts`(或新 `test/tokensContract.test.ts`) | **守卫**:`tokens.css` 的 CSS 兜底值 ↔ `DEFAULT_DESKTOP_CONFIG` 逐条同值(2026-10 起直接读 CSS 文本);库 token 名里不出现消费者域名(至少禁止已知应用词).原"与 `DEFAULT_THEME_TOKENS` 键集合一致"一项随那层 JS 镜像删除而作废(见 4.7 的收敛记录) | 3 / 部分已完成 |
| `test/emittedClasses.test.ts` | 不加白名单(新类全部有真规则);若采用 4.5-A 则加正向断言 | 3 |
| `test/layoutStyles.test.ts`(新) | 解析 CSS 文本守 4.2 / 4.4 的形式断言 | 3 |
| `test/scrollbarStyles.test.ts` | 按 4.5 的决定改注释并加断言 | 3 |
| `example/main.ts` / `example/example.css` | **已做(第三轮)**:窗口正文口径改成"按顺序从上往下堆叠" -- `.pane` 去掉 `justify-content:center`,删掉多余的 `.pane-menu`;读数字形与 `.readout*` 暂留.**待 Phase 1/3**:读数改用 `createReadoutRow`,正文改用 `createStack`,再把 `.readout*` 与 `.pane` 删掉 | 第三轮 / 1 / 3 |
| `example/layout/`(新) | **已做(第三轮)**:五张**真实结构**卡片(代码框 / 实体-求值列表 / 参数窗口 / 视图设置 / 示例读数窗口)+ "现状 / 方案"开关 + 现场实测标签.不是库的一部分,不进 npm 包;`package.json` 的 `files` 不含 `example/`,所以不用改分发 | 第三轮 |
| **`miko_graphcalc` `src/config/styleLayers.test.ts` / `cssPalette.test.ts`** | 库新增样式表时**必须**把 `./styles/layout.css` 补进两份 LIB_CSS 列表(4.8 第 2 门) | 3 |
| **`Toyosatomimiko.github.io` `src/main.ts`** | 逐份 import 库样式表,新增 `styles/layout.css` 要显式加一行(4.8 第 3 门) | 3 |
| **`miko_graphcalc` `css/panels.css`** | 走 D8-A 则零改动;走 D8-B 则把 `.diagnostic-list` 等 margin/百分比间距改到新原语 | 3 |
| **`Toyosatomimiko.github.io` `src/setting/setting.css` 等** | 走 D8-A 则零改动;走 D8-B 则把面板正文的 margin 间距改成 `gap`(实测 16 -> 26 的那一处) | 3 |
| `README.md` | 公开面表补 `layout/` 与读数件;"还没做的"划掉 `ScrollArea`;补两条新契约 | 各 Phase |
| `docs/...`(本文) | 随实现更新状态与决策记录 | 各 Phase |

## 6. 分期与发布

两处破坏性变更(默认口径切档,去掉 `> *` 通吃)**第三轮后只剩一处**:默认口径切档.
Phase 4 那些"去掉通吃"的改动已降级为可不做(真实元素上无差别,原语也不依赖它),
所以 `0.2.0` 只带 Phase 2 这一处破坏性改动;Phase 4 将来真要做,单独发一次 minor.
**2026-10 的实测把 Phase 3 与 Phase 4 的位置对调了**:

| Phase | 内容 | 破坏性 | 闸门 |
| --- | --- | --- | --- |
| 0 | 口径层(策略工厂 + 预置 + parse + `syntax` + 单测) | 无(纯新增/等价重写) | `npm run build` |
| 1 | 显示件 + 样式 + `text?` 选项 + 示例改用显示件 | 无(默认仍 `String`) | `npm run build` + 示例目视 |
| 2 | 默认口径切到 `NUMBER_TEXT_EDIT` / `NUMBER_TEXT_DISPLAY` | **有**(默认文本变化) | 消费者同步改;`RELEASING.md` 顺序:先发库 |
| 3 | **两个布局原语**(`createStack` / `createScrollArea`)+ tokens + `layout.css` + 三条**显式拉伸**出口 + CSS 契约测试 + **4.8 的三门** | 面板正文排布**可选**(D8-A 则无) | 示例目视 + 契约测试 + **站点 `npm run smoke:home`**(走 D8-B 前先补组间距断言,见 9.5) |
| 4 | **不做(第三轮降级为可不做)**:加"直接子节点不拉伸"默认并删掉旧 `.window-body > *` 通吃 | 若做则**有**(多子节点不再等分/拉伸),但实测对两家现有布局**逐像素零影响**(4.2-a/b),且两个原语不依赖它 | 真要做:先按 4.2-b 的真实结构复测 + 一次 minor + 回归证据 |
| 5 | `Splitter`(带键盘与拖拽) | 无(新增) | **需求不足,见 7/D7;可无限延后** |

**发布顺序(2026-10 更正)**:初稿写"库先推 `main` 出滚动资产,两个应用仓库再
`npm run ui:update`" -- 这两句都已作废:

- 两个应用仓库**从 npm 装**(`"miko_ui": "^0.1.6"` + `npm ci`),构建时用
  `scripts/build.py` 的 `sync_miko_ui`(`npm view miko_ui@latest version`)对齐到
  npm 的 latest;滚动资产那条链路**当前没有消费者**(消费侧的
  `scripts/fetch_ui.sh` 已随"依赖更新为 npm:miko_ui"删除).
- **没有 `npm run ui:update` 这个脚本**;本地改库走
  `scripts/dev_ui_link.py link`(把 `node_modules/miko_ui` 换成指向工作副本的符号
  链接),要回到 npm 版就 `unlink` 或 `npm ci`.
- 所以正确的顺序是:库`npm run release:npm -- patch|minor|major`(出 npm 版)->
  等 registry 可见(1-2 分钟传播延迟)-> 再推消费侧.库侧细节见
  `RELEASING.md` 的 §7;应用侧真身在各仓库 `scripts/build.py` / `buildlib.py` /
  `dev_ui_link.py`.

## 7. 需要拍板的决定

| 编号 | 决定 | 状态 / 建议 |
| --- | --- | --- |
| D1 | 显示档是否支持千位分隔符,若支持用不用 `Intl.NumberFormat` | **默认不开**,`group` 只在消费者显式给 `Intl` 的格式化时生效.`Intl` 的输出随 ICU/区域设置变,库的默认行为不该随环境变 |
| D2 | `NumberField` / `Slider` 默认口径是否切到 `NUMBER_TEXT_EDIT` | **仍待实验,但收益已在站点侧量化**:7 条 metro 滑块(`step:0.01` + `min:0.2`)今天会露浮点尾巴,切了一行不改就干净.切了要发一次 minor + 迁移说明 |
| D3 | `createValueDisplay` 默认是否让读屏播报 | **不播报**(`aria-live="off"`),`announce:true` 才开 |
| D4 | `.window-body` 自身是否可滚 | **不滚**,保持 `hidden` + 显式 `createScrollArea`.正文可滚会让绝对定位的浮层与手柄语义一起变模糊 |
| D5 | 4.5 选 A 还是 B(`createScrollArea` 是否自己挂 `.ui-scrollbar`) | **A** + 那条正向断言.消费者侧有 17 个手挂/漏挂点支撑(4.5) |
| D6 | 多个 `.ui-fill` 是均分(`flex:1 1 0`)还是按内容比(`1 1 auto`) | **均分**(确定,可预期) |
| D7 | `Splitter` 是否本期做 | **降级为可无限延后**:两家消费者**零使用**,graphcalc 在窗口化时主动删掉了自己的分栏控制器(`RightSplitController` / `#right-splitter` / `--right-split-basis`),"一个窗口一件事"取代了分栏.真要有需求,先看 `createStage`(D11) |
| D8 | `.ui-panel-body` 是否默认变列 flex(4.2 的 A/B) | **建议 A(opt-in)**:站点对库面板零覆盖,且面板没有定高(拉伸语义拿不到好处),而默认改会打断它的 margin 塌陷(实测 16 -> 26).`createPanel({ stack: true })` 开启栈式排布 |
| D9 | 布局原语是否接受消费者 `class` | **必须接受**(4.3 缺口 1):graphcalc 的 `styleLayers` 禁止应用给库类写样式,没有出口就等于消费者无法给原语定尺寸 |
| D10 | `ValueText` 是否拆出 `syntax` 轴 | **建议拆**(3.2):同一个档位要服务纯文本 / LaTeX / 编辑三种语法,graphcalc 已经为 LaTeX 重抄了一遍档位 |
| D11 | 是否新增 `createStage`(定尺寸媒体槽) | **待议,优先级高于 Splitter**:站点 OLED 定死 1024x512,RBT 只有 1200x640 属性(CSS 零规则,窄视口被 `body{overflow-x:hidden}` 直接裁掉),而 metro_window 自己实现了整套 `ResizeObserver` + 150ms 防抖 + `dpr` 追猎 + 16:9 cover 后备缓冲.这是三家(含 451)各写一遍的东西 |
| D12 | 面板的尺寸变化出口 | **本方案不提供**(4.4 第 6 条的缺口):`onGeometryChange` 只服务窗口,面板没有 id 可订阅.站点只能自己 `ResizeObserver`.要不要给面板一条出口,列进下一轮 |
| D13 | Phase 4(`.ui-panel-body > * { flex: 0 0 auto }`)是否落地 | **可不做 / 延后**(第三轮):真实元素上逐像素无差别(4.2-b),两个原语不依赖它(4.2);它的价值只是把"唯一子节点铺满,其余按内容高"写进契约,代价却是改库的默认语义 + 一次破坏性发版.要做时先补真实结构回归证据 |

## 8. 不做的事(明确划出去)

- **不做"工具条 + 主体 + 底栏"这种形状**(第三轮):初稿拿它当 Phase 4 的唯一理由,
  但 graphcalc 六个窗口正文全是**单子节点**,站点面板也没有定高,两家都没有这种布局.
  没有消费者的形状不写进契约;真出现了就用 `createStack` + `createScrollArea` 拼,
  不需要为它新增原语.
- **布局原语不做 JS 测量排版**:原语与窗口正文的排布靠纯 CSS 表达,尺寸变化用
  `onGeometryChange`(第 4.4 第 6 条).**不是**"库不许用 `ResizeObserver`" --
  库的编辑器层已经在用(2 处),测试桩里有替身;消费者侧本来也在用
  (graphcalc 的 `RenderController` 1 处,站点 2 处:`metro_window/src/metro_window.ts:337`
  与 `451/ember/index.ts:323`,另有库编辑器层自带的 2 处).
- **不加运行时依赖(唯一例外是 `katex`,而且它由库自带)**:没有 CSS-in-JS,没有
  `Intl` 数据包.**2026-10 第五轮更正**:原文写"`katex` 仍是唯一 peer",现在它是
  `dependencies` 里的一项 -- 下游规定不许直接依赖 katex,写成 peer 就等于把安装
  责任留给了应用.守卫(`scripts/check_ui_boundary.py` 的 `deps`)盯的就是这一点.
- **不在库里放消费者域名的东西**(token 名,窗口名,面板名).**2026-10 已清理**
  两个令牌;判据:**库的样式表里有没有 `var()` 读它?** 没有就不许加,并补机器守卫
  (第 5 节).顺带记一条同类前科:graphcalc 的 `cssPalette.test.ts` 早就有一条
  "库里没有领域图例"的断言,但它只查 `--kind-*` 前缀,所以从没抓到那两个窗口名
  令牌 -- 守卫的**判据太窄**等于没有.
- **不造 `TextField`**:带输入框的文本编辑(以及"点一下变可编辑")是另一件事,
  与 README 的补件清单一起排.
- **不把 `.pane` 那套消费者内边距搬进库**:库给 `--layout-padding` 与 `createStack`,
  给多少是消费者的排版选择.
- **不搬 graphcalc 的 `.diagnostic-list` 形状**(`max-height:34%` + `:empty`)进库:
  那是"一个可收缩的定高尾条",属于应用的内容策略(它的基准还随窗口化漂移过,
  见 graphcalc `docs/windowing-plan.md` 的 B3).`MessageList` 只给条目外观这条
  分工不变.
- **不动 `.menu-anchor`**:它**不是**死规则 -- 库自己的示例在用它
  (`example/main.ts:195`,`example/README.md:42`),`widgets.css:164` 有规则.
  它是一条"消费者手加的用法词汇"(与 `.ui-scrollbar` 同类).两家真实消费者都没用
  它(null 需求),要不要让 `createMenu` 自己产出这个锚点容器,列进下一轮,
  **不要删规则**.

## 9. 验收标准

方案落地后,下面每一条都能用机器或目视验收:

1. 同一个 `signal<number>` 绑到 `Slider` 的数值框,`NumberField` 与 `createReadoutRow`,
   给同一个 `text` 时三处文本**逐字符相同**(新契约测试).
2. `formatNumber` / `formatVector` 的现有断言一条不改仍然通过(等价重写).
3. 编辑档 `toText` 的输出对全部边界值匹配 number input 合法语法正则;
   并覆盖 `syntax: 'latex'`(graphcalc 那套 `\times10^{n}`)与 `digits` 覆盖(2 位 / 4 位).
4. `npm test` 的 `emittedClasses` 不需要为新类扩白名单;`tokensContract` 守住
   "库 token 里没有消费者域名".
5. **布局的验收闸门是站点的真浏览器冒烟,不是库的示例目视**:
   `ToyosatomimikoMiko.github.io` 的 `npm run smoke:home`(headless Chromium,现 60 项)
   必须全绿 -- 它已经在断言 `#setting .ui-panel-body > fieldset.setting-group` 数量=3,
   `.bgrow` 的 gap 等.但**第三轮核对出一条缺口:它没有任何"组间距"断言**,所以 D8-B 那条
   16->26 的回归它抓不到;走 D8-B 之前必须先补一条间距断言(加在 4.6 那个位置).
   理由:面板正文的 margin/`<br>` 节奏只有站点有,库的示例抓不到(4.6 实测).
6. 示例里出现一个窗口:**一个显式滚动区 + 顺序堆叠的分组**(形状照 graphcalc 的"视图设置"
   窗口),窗口被拖到任意小尺寸时行高不变,滚动区出现滚动条,没有任何内容越界.
   -- 初稿那句"固定工具条 + `fill` 主体 + 滚动区 + `Splitter`"里的固定条与 `Splitter`
   都已删(第 8 节 / D7);要看的形状见 `example/layout/` 的五张卡片.
7. `example/example.css` 里不再有 `.readout*` 与 `.pane`(全部由库的原语承担).
8. 示例的"读数"窗口:拖滑杆时数字不跳字(`tabular-nums`),`title` 里是全精度值.
9. ~~**graphcalc 侧的回归项(实测出来的真实缺陷)**~~ **作废(第三轮)**:该"缺陷"在真实
   层级里不存在 -- `.process-header` / `.process-truncated` 是窗口正文的**孙节点**,
   吃不到 `.window-body > *`;9 个窗口高实测恒为 **99px / 29px**,Phase 4 前后逐像素相同
   (2.2 第 5 条,4.2-b).
10. **示例的正文口径(第三轮已改,可当场验收)**:`example/example.css` 的 `.pane` 不再有
    `justify-content: center`,四扇窗口一律按顺序从上往下堆叠;把读数窗口拖矮,内容从顶部
    开始,不再被挤到正文顶上(改之前:正文 62px 时第一个读数在正文顶上方 35px).
    原语落地后,这里的 `.pane` 与 `.readout*` 再换成 `createStack` / `createReadoutRow`.
11. **下游不声明 `katex` 也能排公式(第五轮验收)**三条:
    - `package.json` 的 `katex` 在 `dependencies` 且没有 `peerDependencies`(守卫 `deps` 守);
    - 消费者删掉 `katex` / `@types/katex` 与测试里的 `vi.mock('katex')` 后,公式类断言
      仍然通过 -- 靠的是 `installDomStub()` 自动装的文本替身(库自己的
      `FormulaView.test.ts` 就是这条路的样板);
    - 读数的 `render` 出口把 `numberText({ syntax: 'latex' })` 排成 KaTeX DOM
      (示例窗口里那条 `方位角(公式)` 可目视;`title` 仍是全精度纯文本);
    - **样式接缝闭合(第五轮补)**:消费侧那 4 条 `.katex { font-size: ... }` 与
      `--katex-font-size` 的写入都删掉之后,字号仍由库控制 -- 浏览器的
      `getComputedStyle(.katex).fontSize` 等于 `--katex-font-size` × 宿主 font-size
      (默认 `1.21em`);`test/formulaFontSize.test.ts` 守选择器特异度,防止有人把它
      改回单类或 `:where(...)` 而静默失效.
