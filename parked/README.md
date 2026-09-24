# `parked/` -- 搁置:没人调用的旧实现

这里放**已经从库里移除,但不想删掉**的实现.当前只有一件:菜单的键盘支持
(上下键回绕 + Esc 关浮层),见 `menuKeyboard.ts`.

库的立场是**不负责键盘**:`createMenu` 只做结构 / 开合 / 选中,不注册任何键盘
规则(见 `src/widgets/Menu.ts` 文件头的"键盘:一件都不做").`KeyboardController`
仍然导出,但它是给应用用的**路由出口**,库自己不往里塞行为.

## 这个目录是惰性的

| 机制 | 扫描范围 | 会管到 `parked/` 吗 |
| --- | --- | --- |
| `npm run typecheck` | `tsconfig.json` 的 include:`src` / `test` / `example` | 不会 |
| `npm run build:dist`(进 dist/) | `tsconfig.build.json` 的 include:`src/**` | 不会 |
| `npm test`(vitest) | `vitest.config.ts` 的 include:`src/**/*.test.ts` | 不会 |
| 库边界检查 | 只走 `src/` 与 `styles/` | 不会 |

所以这里的代码**不参与任何门禁**:它不是 API,也不保证跟得上 `MenuHandle` 的
变化 -- 哪天对不上了,不会有任何地方报错.

## 要复活它

1. 把 `menuKeyboard.ts`(与它的测试)搬回 `src/`;
2. 改掉文件里的 `../src/...` / `../test/...` 路径(搬进 `src/` 后要变成同级相对路径);
3. 再按当时的口径决定:是给 `createMenu` 加回 `keyboardBindings()`,还是让它
   继续当独立辅助件,由应用自己接进 `KeyboardController`.
