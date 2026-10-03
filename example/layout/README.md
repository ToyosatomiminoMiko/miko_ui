# 窗口正文排布演示(`example/layout/`)

五张卡片 = **graphcalc / miko 示例里真实存在的五种窗口正文**(每张写着出处).
顶上一档开关在两种写法之间切,拖窗口高度滑杆就能看见差别;卡片下面那排数字是现场量的.

- 库的 `src/` 与 `styles/` **一个字没改**;
- 两份样式表都是这个演示页的**原型**,默认关闭:`now.css` 是"照抄 graphcalc / 示例今天自己写的 CSS",
  `proto.css` 是"换成方案的两个原语";
- 卡片里没有编出来的布局.上一版演示里那张"工具条 + 主体 + 底栏"**已删** --
  graphcalc 六个窗口正文全是单子节点,没有这种布局.

## 怎么跑

库根目录:

```sh
npm run dev          # = npm run build:dist && vite example
```

打开 <http://localhost:5173/layout/>.带参数可直接进某一档(截图/复现用):

```
?mode=now&h=263     现状 + 窗口 263px
?mode=next&h=100    方案 + 窗口 100px(看"窗口很矮"时的差别)
```

## 五张卡片

| 卡片 | graphcalc / 示例里的出处 | 现状要写 | 方案要写 |
| --- | --- | --- | --- |
| ① 代码框 | `appViews.ts:73-92` · `panels.css:22-27` | `.panel` 骨架 + `#editor-panel` 包一层 + 手挂 `.ui-scrollbar` | 不用改(唯一子节点由 `:only-child` 铺满) |
| ② 实体 / 求值列表 | `appViews.ts:158-169`,`173-195` · `panels.css:78-94`,`112-144` | 4 层包裹 + 最里层 5 条 + 手挂类 | `createScrollArea({ child: createStack({ children: 条目 }) })` |
| ③ 参数窗口 | `appViews.ts:104-114` · `panels.css:51-59` · `uiConfig.ts:162-167` | `#params-panel` 6 条 + `--params-panel-min-height` 令牌(还要 `applyUiConfig` 写 `:root`)+ 手挂类 | `createScrollArea({ minHeight: '120px', child: createStack({ gap: '10px', children: 行 }) })` |
| ④ 视图设置 | `appViews.ts:215-218` · `panels.css:38-46` · `ViewPanel.ts:171/236/262` | `#view-controls` 8 条(一个元素同时当"滚动区 + 堆叠容器")+ 令牌 + 手挂类 | `createScrollArea({ minHeight: '120px', child: createStack({ children: [组1, 组2, 组3] }) })` |
| ⑤ 示例读数窗口 | `example/example.css:45-51` | `.pane { justify-content: center }`(没有堆叠出口,也没有滚动出口) | `createScrollArea({ child: createStack({ gap: '12px', padding: '10px 16px' }) })` |

分组那一半不用造:④ 里的三组就是库的 `createControlGroup`(`.control-group` + `.control-title`).

## 从这五张卡片读出来的结论

1. **真正缺的是"容器"那一半**:一个吃掉剩余高度,超出就滚的区,加一个按顺序堆叠的容器.
   今天 `graphcalc` 在三处各写一遍(见上表),站点面板正文再写一遍(margin 节奏).
2. **滚动条不该消费者手挂**:库的 `.ui-scrollbar` 是独立规定,graphcalc 手挂 14 处,站点漏挂 2 处;
   滚动容器归库之后这件事该由库做(方案 4.5 选 A).
3. **示例的读数窗口是个真实的小毛病**:它把读数垂直居中,窗口一矮,内容会被挤到正文顶上
   (实测:正文 62px 时第一个读数在正文顶上方 35px,且没有滚动出口).
4. **两个原语不需要 Phase 4 就能成立**:把 `proto.css` 里"默认不拉伸"那句注释掉再跑,
   五张卡片的结果一字不差(出口规则特异度更高).所以方案可以先只做
   `createStack` + `createScrollArea`,不动库的 `desktop.css`.

## 快照

快照本身是生成物,**不保留在仓库里**(本机有清理进程会删未跟踪的图片);需要时按下表
参数重拍即可(页面本身不用改):

| 想看的 | 参数 |
| --- | --- |
| 现状,正常高度 | `?mode=now&h=263` |
| 方案,正常高度 | `?mode=next&h=263` |
| 现状,窗口很矮(读数够不到) | `?mode=now&h=100` |
| 方案,窗口很矮(还能滚) | `?mode=next&h=100` |

## 与方案文档的关系

对应 `docs/value-text-window-layout-plan.md` 的 4.2 / 4.3 / 4.4.
**但那份文档里"工具条 + 主体 + 底栏"这个例子是凭空造的**(它还把它当成 Phase 4 的理由),
本演示页不再演示它;`Splitter` 同理(graphcalc 窗口化时把自己的分栏控制器删了).
