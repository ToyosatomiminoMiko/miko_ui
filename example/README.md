# `miko_ui` 最小示例

四个窗口:一个放两条**系数滑块**(普通参数 + 循环参数)与一个**计数按钮**,
一个放它们的读数,一个放**菜单**,一个放**错误 / 警告消息区**.拖滑块(或改数值框)
读数跟着变;按钮按一下计数 +1,到 255 再按回到 0;菜单项点一下,当前项与窗口
「读数window」里的"菜单选择"一起变.按钮在窗口「控件window」里,计数与读数在窗口
「读数window」里 -- 跨窗口没有一行同步代码.

窗口「消息window」放一个 `createMessageArea()` 建的消息区:该显示哪些提示是从
**现有三个 signal 算出来的派生值**,参数一进门槛提示就出现,退回去就消失 --
示例里没有第二份"当前提示"状态,也没有一行"值变了去刷提示"的同步代码.

窗口「菜单window」用同一个 `createMenu` 摆了两次:一次给 `trigger`(普通按钮,
浮层),一次不给(常驻面板).摆树 / 分组 / 当前项 / 开合全在库里,示例只给数据与
一条 `onSelect`;菜单的数据形状与下游的「示例」菜单一致:分组标题 + 每项
"标题 + 注记".

窗口标题与 Dock 标签是**两处文案**,示例故意取不同的名字(`控件window` /
`控件dock`)让"哪个是哪个"一眼可见.

```bash
# miko_ui 仓库根目录
npm run dev             # Vite 会打印实际端口
```

## 它用到了什么

| 东西 | 在这份示例里管什么 |
| --- | --- |
| `mountDesktop(root, spec)` | 宿主由库建:`index.html` 只有一个空 `#app`,窗口层 / 吸附预览 / Dock / 每个窗口的外壳都是它按配置建的.窗口清单只换 `windows`,其余照用 `DEFAULT_DESKTOP_CONFIG`. |
| `signal(50)` / `signal(0.6)` | 每条参数一个状态,滑块写它,读数读它. |
| `createSlider({ value, label })` | 窗口「控件window」里的输入:名称 + 滑杆 + 数值框 + 重置组合成一条参数行,拖它写 signal. |
| `createSlider({ value, label, normalize, text })` | 周参数的口径:`normalize` 是**调用方给的纯函数**,把越界输入回绕到 `[min, max)`,输入 7 得到 `7 - 2π`;`text` 是"值 ↔ 文本"的**唯一**口径对象,数值框与重置按钮标题共用它.控件不认识圆周,也不知道自己在表示什么角 -- "这是周期量"只体现在调用方写的 `label` 文案里;**滑块只有一种姿态,库不为"循环"另立外观,也不给根节点加变体类**. |
| `numberText({ syntax: 'edit', digits: 3 })` | 方位角的口径:**一个对象同时喂滑块的数值框与读数行**,所以两处文本逐字符相同.示例里不再有第二份 `toFixed(3)` -- 这正是"值 ↔ 文本"收成对象的意义. |
| `createReadoutRow(name, { value, text?, class })` | 窗口「读数window」的只读读数:订阅,`<output>` 语义,全精度 `title`,等宽数字与行布局全在库里,示例不再自己拼 markup 与 `.readout*`.不给 `text` 就走显示档(同一份值在编辑框里是 `0.30000000000000004`,在读数里是 `0.3`,悬停能看到全精度). |
| `createReadoutRow(name, { text, render })` + `createFormulaElement` | 「方位角(公式)」那条读数是**公式读数**:口径换成 `numberText({ syntax: 'latex' })`,再由 `render` 把 LaTeX 交给库的 `createFormulaElement` 排出来.显示件只做"文本 -> 节点",自己不认识排版器;示例里因此不需要知道 `katex`. |
| `watchValue(value, ...)` | 窗口「消息window」订阅那条派生出来的提示清单,把每一版 `render` 进消息区(读数那边已由 `createReadoutRow` 内部订阅). |
| `createButton({ text })` | 窗口「控件window」里的计数按钮:`onClick` 只写 `count.value`(`0..255`,满了回 0),计数读数订阅同一个 signal.也是窗口「菜单window」里的浮层**触发器** -- 菜单不认识窗口标题栏,任意按钮都能触发. |
| `MenuGroup` / `MenuEntry` | 菜单数据就是库的这两个类型(`value` / `text` / `hint` / `disabled`),示例**不另立一份镜像类型**. |
| `createMenu({ groups, ariaLabel, trigger?, panel? })` | 窗口「菜单window」的全部结构:摆 `role="menu"` 面板,按分组套 `role="group"` 与组标题,建出菜单项.给 `trigger` 就是浮层(自己建 `Popover`,面板叠 `.menu-popover`),不给就是常驻面板. |
| `MenuHandle.onSelect` | 唯一的业务回调:拿到被点项的 `value`;浮层**先关再回调**,回调抛错也不会僵在屏幕上. |
| `MenuHandle.setActive` | 当前项只有一个来源:两份菜单都把选中的 `value` 写进 `menuChoice`,再由它刷各自的当前项(高亮 + `aria-current`). |
| `createMessageArea({ class })` | 窗口「消息window」里的容器:`div.message-area[aria-live=polite]` 的框体 / 列表节奏 / 滚动 / 播报属性都在库里,示例只给一笔 `ui-scrollbar`.容器不给消费者留"要不要写 `aria-live`"这个坑 -- 漏了它,增量渲染就白做(见下). |
| `computed(() => MessageEntry[])` | 提示清单是派生值:它读到的三个 signal 任一变化就重算,所以"什么情况报警"只有这一处,没有第二份"当前提示"状态. |
| `MessageList.render(entries)` | 唯一的落 DOM 入口:内容一致时**一次 DOM 操作都不做**,所以拖滑块时同一批提示不会被每帧重放(容器带 `aria-live`,重放等于读屏一直念同一句). |
| `MessageEntry` | 一条提示的形状(`level` 只有 `warning` / `error` + 一行文字),示例直接用库的类型,不另立镜像. |

控件与展示件**互不认识**:滑块只知道往 signal 里写,读数只知道读 signal.
数据只有一份,所以中间不需要任何"值变了去同步另一个窗口"的手工回路.

**值变成文本也只有一处**:方位角那条滑块与它下面的读数行拿到的是**同一个**
`numberText(...)` 对象,所以"框里写什么"与"读数显示什么"不可能分叉.读数不给 `text`
时走显示档(短,好看,全精度另在 `title` 里);编辑框那条路则要求文本能被
`<input type="number">` 咬住 -- 这两件事是同一个对象上的两个方向,不是两份约定.

**菜单的样式一行都不在示例里**:面板 / 分组 / 菜单项 / 注记分别是库的
`.menu-panel` / `.menu-group` + `.menu-group-title` / `.menu-item` /
`.menu-item-hint`,浮层位置是库的 `.menu-anchor` + `.menu-popover`.示例的
`example.css` 只剩页面级规则与窗口正文排布.

示例唯一挂的**库的**类名是 **`ui-scrollbar`**,挂在两处会溢出的容器上(菜单面板与消息区):
面板有 `max-height`,消息区自己 `overflow-y: auto`,内容多了都会滚动,而滚动条是库的
**另一条独立规定**(`styles/scrollbar.css`)-- 两件都不认识它,它也不认识它们,所以
"这份容器要不要统一滚动条外观"由消费者挂类决定.不给这个类,照样能滚,只是用系统
滚动条(下游应用挂在标题栏浮层那颗面板上).

消息区的**外观也一行都不在示例里**:框体 / 条目内边距 / 配色分别是库的
`.message-area` 与 `.diagnostic` / `.diagnostic-warning` / `.diagnostic-error`
(`styles/feedback.css`).示例给它的只有"摆在窗口正文的哪一列".

## 目录

```text
example/
  index.html      只有一个 #app 的页面
  main.ts         全部示例代码(状态 -> 两条滑块/一个按钮/五条读数/两处菜单/一列提示 -> 四个窗口)
  example.css     页面级规则 + 窗口正文的排布,说明行,以及示例自己挂在读数上的 `.readout-value`
                  (读数行的行布局 / 名字截断 / 值贴右 / 等宽数字都在库的样式表)
```

CSS 导入的类型不在这里声明:库自己的 `src/css_modules.d.ts` 有一条全局的
`declare module '*.css'`,而 `tsconfig.json` 把 `src/**` 与 `example/**` 放进
同一个检查程序,所以示例的 `import 'miko_ui/styles.css'` / `import './example.css'`
由库那一侧兜住 -- 示例这一层不需要 `vite/client`.

## 它验证了什么

- 这个目录的 import 里没有一条 `@/...`,也没有别的应用代码 -- "库能被外部
  消费"在这里是可运行的;
- `example/**` 进 `npm run typecheck`,并且走**包名自引用** -- 类型只能来自
  `dist/index.d.ts`(公开面),所以"公开面少导出一个"会在这里编译不过;
- 窗口系统的行为(拖动 / 缩放 / 吸附 / 最大化 / 最小化 / Dock)没有一行示例代码,
  全部来自库的默认配置;
- 菜单的**直接显示**与**任意按钮触发**是同一个 `createMenu`:差别只是给不给
  `trigger`,触发器是一颗普通 `createButton`,库侧没有任何"窗口标题栏"的前提;
- 菜单的声明侧只有数据 + 一条 `onSelect`,结构 / 当前项 / 开合 / 外观
  全在库侧;
- 消息区的**容器**也是库建的:`aria-live` 与 `MessageList.render()` 的"内容一致时
  零 DOM 操作"是一对配套的默认,示例没有机会漏写其中一个;
- 提示是派生值:`computed` 依赖的那三个 signal 一变清单就重算,示例里没有第二份
  "当前提示"状态,也没有"值变了去刷提示"的回路.

## 子目录

- **`layout/`** -- 窗口正文排布演示:**graphcalc / 本示例里真实存在的五种正文**
  (代码框 / 实体-求值列表 / 参数窗口 / 视图设置 / 本示例的读数窗口),每张卡片写着出处.
  顶上一档开关在"现状(照抄今天自己写的 CSS)"与"方案(`createStack` + `createScrollArea`)"之间切,
  卡片下面是现场量的数字(内容高 vs 可见高 / 滚不滚得动 / 行有没有被压 / 有没有被裁).
  跑法:`npm run dev` 后打开 <http://localhost:5173/layout/>.它只引库的样式表加**两份原型表**,
  库的 `src/` 与 `styles/` 一个字没改;细节见 [`layout/README.md`](./layout/README.md).
