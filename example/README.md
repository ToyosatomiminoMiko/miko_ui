# `miko_ui` 最小示例

五个窗口:一个放两条**系数滑块**(普通参数 + 循环参数)与一个**计数按钮**,
一个放它们的读数,一个放**菜单**,一个放**错误 / 警告消息区**,一个放**公式**.
拖滑块(或改数值框)读数跟着变;按钮按一下计数 +1,到 255 再按回到 0;菜单项点一下,
当前项与窗口「读数window」里的"菜单选择"一起变.按钮在窗口「控件window」里,计数与
读数在窗口「读数window」里 -- 跨窗口没有一行同步代码.

窗口「消息window」放一个 `createMessageArea()` 建的消息区:该显示哪些提示是从
**现有三个 signal 算出来的派生值**,参数一进门槛提示就出现,退回去就消失 --
示例里没有第二份"当前提示"状态,也没有一行"值变了去刷提示"的同步代码.
门槛(示例自己的领域口径,写在 `main.ts` 的常量里):线性数值 `> 80` 警告 /
`> 95` 报错,方位角离 `±π` 不到 `0.15` 警告,计数到 `255` 警告.

那个窗口里**只有消息**:正文根就是那颗消息区容器,没有第二层宿主,也没有窗口内的
第二个滚动区 -- 滑条落在窗口边上,就是窗口自己的那条.示例不摆任何说明文字,
门槛写在这份 README 里(窗口不解释自己);框体也不要(`message-area--unframed`):
窗口外壳那圈描边就是它的框.

窗口「菜单window」用同一个 `createMenu` 摆了两次:一次给 `trigger`(普通按钮,
浮层),一次不给(常驻面板).摆树 / 分组 / 当前项 / 开合全在库里,示例只给数据与
一条 `onSelect`;菜单的数据形状与下游的「示例」菜单一致:分组标题 + 每项
"标题 + 注记".

窗口「公式window」摆**同一件 `createFormulaElement` 的四种用法**:缺省的
**可复制**公式(带 `data-tex` / `tabindex` / `role` / `aria-label`,点一下或聚焦后
回车就把原始 TeX 写进剪贴板),`copyable=false` 的**不可复制**公式,带**消费者类名**
的公式(第二个参数 `formula-accent`,字号与颜色盖在库的基线类之后),以及一条
**活公式**:`numberText({ syntax: 'latex' })` 把 `sin(方位角)` 写成 LaTeX,再由
`render` 交给 `createFormulaElement` 排出来 -- 拖动窗口「控件window」里的方位角
滑块,这条公式跟着变.复制反馈只有一处提示节点,由示例建;成功 / 失败就地改成
`已复制 TeX` / `复制失败` 并把颜色交给库的 `.is-copied` / `.is-error`.
排版(`katex`)与它的样式表都由库带,示例这一层没有一行与 KaTeX 有关的代码.

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
| `createFormulaElement(latex, class?, copyable?)` | 窗口「公式window」里的四种用法:缺省**可复制**(挂 `data-tex` + `tabindex=0` + `role="button"` + `aria-label`,复制与键盘两条入口的钩子都在它身上),第三个参数给 `false` 就**不可复制**(读数 / 开合热区里的公式用,那组属性一个都不加),第二个参数是**消费者类名**(库的基线类 `.ui-formula` 在前,消费者类在后,所以 `.formula-accent` 盖得住字号与颜色).LaTeX 怎么排不在示例里:连 KaTeX 的样式表都由库带. |
| `FormulaCopyController(hint)` + `bind(root)` | 窗口「公式window」的复制反馈:事件委托绑在正文那一列上,点任意带 `data-tex` 的公式就把**原始 TeX** 写进剪贴板;提示节点由示例建,回显写成 `已复制 TeX` / `复制失败` 并挂库的 `.is-copied` / `.is-error`.提示可以不止一处(传数组时一次写全部节点),示例只有一处所以传单个节点. |
| `KeyboardController` + `keyboardBinding()` | 公式的 `Enter` / `空格` 复制规则注册进库的**唯一键盘出口**(库自己不挂 `keydown`),所以"聚焦公式后回车也能复制"这条入口要消费者 `register` 之后再 `bind`.这一页没有编辑器,两个内置动作给空实现. |
| `createValueDisplay({ value, text, render })` | 窗口「公式window」的**活公式**:单格 `<output>` 自带订阅,`numberText({ syntax: 'latex' })` 把 `sin(方位角)` 写成 LaTeX,`render` 再把它拼进示例自己的模板(`\sin\theta = ...`)交给 `createFormulaElement`.值 -> 文本 -> 节点三步各归各家,示例里没有一行"值变了重建公式". |
| `watchValue(value, ...)` | 窗口「消息window」订阅那条派生出来的提示清单,把每一版 `render` 进消息区(读数那边已由 `createReadoutRow` 内部订阅). |
| `createButton({ text })` | 窗口「控件window」里的计数按钮:`onClick` 只写 `count.value`(`0..255`,满了回 0),计数读数订阅同一个 signal.也是窗口「菜单window」里的浮层**触发器** -- 菜单不认识窗口标题栏,任意按钮都能触发. |
| `MenuGroup` / `MenuEntry` | 菜单数据就是库的这两个类型(`value` / `text` / `hint` / `disabled`),示例**不另立一份镜像类型**. |
| `createMenu({ groups, ariaLabel, trigger?, panel? })` | 窗口「菜单window」的全部结构:摆 `role="menu"` 面板,按分组套 `role="group"` 与组标题,建出菜单项.给 `trigger` 就是浮层(自己建 `Popover`,面板叠 `.menu-popover`),不给就是常驻面板. |
| `MenuHandle.onSelect` | 唯一的业务回调:拿到被点项的 `value`;浮层**先关再回调**,回调抛错也不会僵在屏幕上. |
| `MenuHandle.setActive` | 当前项只有一个来源:两份菜单都把选中的 `value` 写进 `menuChoice`,再由它刷各自的当前项(高亮 + `aria-current`). |
| `createMessageArea({ modifier, class })` | 窗口「消息window」里的容器:`div.message-area[aria-live=polite]` 的列表节奏 / 滚动 / 播报属性都在库里,示例只给"无框"变体类与一笔 `ui-scrollbar`.容器不给消费者留"要不要写 `aria-live`"这个坑 -- 漏了它,增量渲染就白做(见下).**容器就是那个窗口的正文根**,所以滑条是窗口自己的那条. |
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

示例挂的**库的**类名有两处,都不是"给库的类写样式",而是把库公开的两条接缝接上:
**`ui-scrollbar`** 挂在两处会溢出的容器上(菜单面板与消息区)-- 面板有 `max-height`,
消息区自己 `overflow-y: auto`,内容多了都会滚动,而滚动条是库的**另一条独立规定**
(`styles/scrollbar.css`),两件都不认识它,它也不认识它们,所以"这份容器要不要统一
滚动条外观"由消费者挂类决定(不给这个类,照样能滚,只是用系统滚动条;下游应用挂在
标题栏浮层那颗面板上);**`message-area--unframed`** 是 `createMessageArea` 的
`modifier` 出口,消息区落在窗口正文根上时用它去掉那圈框体.

消息区的**外观也一行都不在示例里**:条目内边距与配色是库的 `.diagnostic` /
`.diagnostic-warning` / `.diagnostic-error`,容器的列排布 / 节奏 / 滚动是库的
`.message-area`(`styles/feedback.css`);`--unframed` 那条变体把框体去掉,示例只补
一圈自己的内边距(`.message-pane`,与其余窗口的 `.pane` 同口径)和"它落在哪个窗口".

公式窗口的**排版也一行都不在示例里**:LaTeX -> 屏幕是库的 `.ui-formula` 与它里面的
KaTeX 产物,示例只给几笔自己的类(`.formula-group` / `.formula-row` /
`.formula-hint` / `.formula-accent` / `.formula-live`).可复制公式的"光标 + 焦点环"
用**属性选择器** `[data-tex]` 认库的公开钩子,而不是给只含库的类的选择器写规则
-- 那是消费侧明令禁止的做法(理由与分层契约见库根 `README.md`).

## 目录

```text
example/
  index.html      只有一个 #app 的页面
  main.ts         全部示例代码(状态 -> 两条滑块/一个按钮/五条读数/两处菜单/一列提示/
                  一窗公式 -> 五个窗口)
  example.css     页面级规则 + 窗口正文的排布(`.pane` / `.message-pane`),菜单的两句说明行,
                   公式窗口的几笔排布与消费者类(`.formula-*`),可复制公式的
                   `[data-tex]` 光标 / 焦点环,以及示例自己挂在读数上的 `.readout-value`
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
  零 DOM 操作"是一对配套的默认,示例没有机会漏写其中一个;那个容器**就是**消息窗口
  的正文根(窗口里只有一个孩子),所以"窗口里还有一个会滚的盒子"这件事在这个示例里
  根本不成立;
- 提示是派生值:`computed` 依赖的那三个 signal 一变清单就重算,示例里没有第二份
  "当前提示"状态,也没有"值变了去刷提示"的回路;
- 公式的**排版 / 样式 / 渲染器**全在库侧:示例只给 LaTeX 字符串与可选的消费者类名,
  `katex` 这个名字在示例里一次都没出现;可复制与不可复制的差别就是
  `createFormulaElement` 第三个参数,复制本身是 `FormulaCopyController` 的一次事件
  委托 -- 示例没有一行 per-公式 的监听;
- 活公式是"值 -> LaTeX -> 排版"三段拼起来的(`numberText` / `render` /
  `createFormulaElement`):`\sin\theta` 这个式子是**示例的领域知识**,库不认识任何
  具体公式.
