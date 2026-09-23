# `miko_ui` 最小示例

两个窗口:一个放两条**系数滑块**(普通参数 + 循环参数),一个放它们的读数。
拖滑块(或改数值框)读数跟着变,没有别的。

```bash
# miko_ui 仓库根目录
npm run dev             # Vite 会打印实际端口
```

## 它用到了什么

| 东西 | 在这份示例里管什么 |
| --- | --- |
| `mountDesktop(root, spec)` | 宿主由库建:`index.html` 只有一个空 `#app`,窗口层 / 吸附预览 / Dock / 每个窗口的外壳都是它按配置建的。窗口清单只换 `windows`,其余照用 `DEFAULT_DESKTOP_CONFIG`。 |
| `signal(50)` / `signal(0.6)` | 每条参数一个状态,滑块写它,读数读它。 |
| `createSlider({ value, label })` | 窗口「滑块」里的输入:名称 + 滑杆 + 数值框 + 重置组合成一条参数行,拖它写 signal。 |
| `createSlider({ cyclic: true, normalize })` | 循环参数的两半:**`cyclic` 只管外观**(名字后显示 `cyclic`,根节点加 `is-cyclic` 高亮),**`normalize` 管口径**(越界值回绕到 `[min, max)`,输入 7 得到 `7 - 2π`)。循环语义在控件里只做提示,取值由消费者给的纯函数决定。 |
| `watchValue(value, …)` | 窗口「数字」订阅各自的 signal,把值写进只读读数。 |

控件与展示件**互不认识**:滑块只知道往 signal 里写,读数只知道读 signal。
数据只有一份,所以中间不需要任何"值变了去同步另一个窗口"的手工回路。

## 目录

```text
example/
  index.html      只有一个 #app 的页面
  main.ts         全部示例代码(状态 -> 两条滑块/两条读数 -> 两个窗口)
  example.css     页面级规则 + 窗口正文的排布与读数字形
  vite_env.d.ts   CSS import 的类型声明
```

## 它验证了什么

- 这个目录的 import 里没有一条 `@/...`,也没有别的应用代码 —— "库能被外部
  消费"在这里是可运行的;
- `example/**` 进 `npm run typecheck`,并且走**包名自引用** —— 类型只能来自
  `dist/index.d.ts`(公开面),所以"公开面少导出一个"会在这里编译不过;
- 窗口系统的行为(拖动 / 缩放 / 吸附 / 最大化 / 最小化 / Dock)没有一行示例代码,
  全部来自库的默认配置。
