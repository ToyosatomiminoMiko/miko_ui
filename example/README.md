# `miko_ui` 最小示例

三个窗口:一个放两条**系数滑块**(普通参数 + 循环参数)与一个**计数按钮**,
一个放它们的读数,一个放**菜单**.拖滑块(或改数值框)读数跟着变;按钮按一下
计数 +1,到 255 再按回到 0;菜单项点一下,当前项与窗口「读数window」里的"菜单选择"
一起变.按钮在窗口「控件window」里,计数与读数在窗口「读数window」里 -- 跨窗口没有一行
同步代码.

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
| `createSlider({ cyclic: true, normalize })` | 循环参数的两半:**`cyclic` 只管外观**(名字后显示 `cyclic`,根节点加 `is-cyclic` 高亮),**`normalize` 管口径**(越界值回绕到 `[min, max)`,输入 7 得到 `7 - 2π`).循环语义在控件里只做提示,取值由消费者给的纯函数决定. |
| `watchValue(value, ...)` | 窗口「读数window」订阅各自的 signal,把值写进只读读数. |
| `createButton({ text })` | 窗口「控件window」里的计数按钮:`onClick` 只写 `count.value`(`0..255`,满了回 0),计数读数订阅同一个 signal.也是窗口「菜单window」里的浮层**触发器** -- 菜单不认识窗口标题栏,任意按钮都能触发. |
| `MenuGroup` / `MenuEntry` | 菜单数据就是库的这两个类型(`value` / `text` / `hint` / `disabled`),示例**不另立一份镜像类型**. |
| `createMenu({ groups, ariaLabel, trigger? })` | 窗口「菜单window」的全部结构:摆 `role="menu"` 面板,按分组套 `role="group"` 与组标题,建出菜单项.给 `trigger` 就是浮层(自己建 `Popover`,面板叠 `.menu-popover`),不给就是常驻面板. |
| `MenuHandle.onSelect` | 唯一的业务回调:拿到被点项的 `value`;浮层**先关再回调**,回调抛错也不会僵在屏幕上. |
| `MenuHandle.setActive` | 当前项只有一个来源:两份菜单都把选中的 `value` 写进 `menuChoice`,再由它刷各自的当前项(高亮 + `aria-current`). |

控件与展示件**互不认识**:滑块只知道往 signal 里写,读数只知道读 signal.
数据只有一份,所以中间不需要任何"值变了去同步另一个窗口"的手工回路.

**菜单的样式一行都不在示例里**:面板 / 分组 / 菜单项 / 注记分别是库的
`.menu-panel` / `.menu-group` + `.menu-group-title` / `.menu-item` /
`.menu-item-hint`,浮层位置是库的 `.menu-anchor` + `.menu-popover`.示例的
`example.css` 只剩页面级规则与窗口正文排布.

## 目录

```text
example/
  index.html      只有一个 #app 的页面
  main.ts         全部示例代码(状态 -> 两条滑块/一个按钮/三条读数/两处菜单 -> 三个窗口)
  example.css     页面级规则 + 窗口正文的排布与读数字形(菜单外观在库的 widgets.css)
  vite_env.d.ts   CSS import 的类型声明
```

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
  全在库侧.
