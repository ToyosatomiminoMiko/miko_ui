# `miko_ui` 的交付方式

这份文件讲"库怎么交到消费者手里".库的形态与不变量见 `README.md`,抽取过程见原
仓库 `miko_graphcalc` 的 `docs/ui-library-extraction-plan.md`.

> 这份文件在 2026-09 重新包含 npm:库现在同时走"滚动资产"(主,服务两个应用仓库)
> 与"npm 包"(对外,服务想 `npm install` 的人)两条链路.§6 保留的是"当年为什么
> 放弃 npm"的归档 ---- 那是历史,不是现状;现状见 §0 与 §9.

## 0. 结论:两条交付链路

| 链路 | 触发 | 形态 | 谁在用 |
| --- | --- | --- | --- |
| **A. 滚动 release 资产**(主) | 推到 `main` | tag `ui-latest` 上的 `miko_ui_dist.tar.gz`,内容被覆盖 | 两个应用仓库(`miko_graphcalc`,`ToyosatomiminoMiko.github.io`) |
| **B. npm 包**(对外) | 推 `v*` tag | `registry.npmjs.org` 上的 `miko_ui@<version>` | 想 `npm install` 的外部消费者 |

### 链路 A(§1–§5 讲的就是它)

- 每一次 main 的构建都覆盖同一个资产,发布不是"版本发布":
  - release tag:`ui-latest`(**滚动**,只是"最新一份产物"的稳定下载地址);
  - 资产:`miko_ui_dist.tar.gz`;
  - URL:`https://github.com/ToyosatomiminoMiko/miko_ui/releases/download/ui-latest/miko_ui_dist.tar.gz`.
- **交付形态是那个资产,不是 main 上的源码**:消费者机器上没有 TypeScript,也不
  构建库里任何一个字节;它们只下载产物,解开,按 `file:` 链接进来.
- 这条链路**不读也不写版本号**:消费侧判断"我缓存的这份是不是最新"靠的是清单里的
  `gitHead`(`ui-latest` 指向的 commit),不是版本号(见 §1).

### 链路 B(完整约束与坑见 §9)

需要 `package.json` 的 `version`,而且只有它在读这个字段.版本号在"只有两个同工作区
消费者"时确实只是仪式(固定/回滚的临时办法见 §5),但 npm 把它当主键 -- 要发 npm,
就必须有它.两条链路互不干扰:推 `main` 只出资产,推 `v*` tag 才发 npm.

## 1. 资产长什么样

`npm run release:pack`(= `scripts/pack_release.mjs`)把**包根**打成 tar.gz,解开后
根目录直接是这四样(没有多套一层目录):

| 条目 | 内容 |
| --- | --- |
| `package.json` | **运行期清单**,由打包脚本从仓库的 `package.json` 生成 |
| `dist/` | `tsc` 产物:`index.js` + `index.d.ts`(exports 的根入口) |
| `styles/` | 五份 CSS(exports 的 `./styles*`) |
| `LICENSE` | AGPL-3.0-or-later,跟着产物一起分发 |

清单里还有一个**由打包脚本写入**的字段:`gitHead` = 打这份包的 commit.库不写版本号,
消费侧就靠它回答"我缓存的这份是不是最新发布的" -- 拿它比 `ui-latest` tag 指向的
commit,不一致就重取.本地工作树有未提交改动时写的是 `<sha>-dirty`,那个值不等于
任何 tag,所以消费侧会把它当"不是最新"而重取发布产物(这正是想要的:本地试验包不该
被当成交付版本).`ci.yml` 的 dry-run 与 `release.yml` 的交付验收都会断言它等于
本次构建的 commit.

### 1.1 清单为什么必须是"生成"的

**`scripts` 绝不能进资产**.`npm install` 装 `file:` 链接的包时,会先跑目标清单里
的 `prepare`(实测 npm 10.9.8);而资产里既没有 `scripts/` 也没有 devDependencies,
那一步必然 `MODULE_NOT_FOUND: scripts/clean.mjs`.所以清单由
`scripts/pack_release.mjs` 用白名单重建,并顺手砍掉 `private`,`devDependencies`
这类构建期字段.

这份清单字段是**白名单 + 显式黑名单**:`package.json` 里出现一个两边都没分类的
顶层字段时,打包**直接失败**,逼人当场决定它该不该进资产(静默丢掉 `browser` 这类
字段的症状是"消费者行为悄悄分叉",太晚).要加字段就去改那个脚本里的两张表.

消费侧的 `scripts/fetch_ui.sh` 会**独立再校验一次**"清单里没有 `scripts`":库侧
生成,消费侧验收,两边互为保险(这条链路的完整规则在两个应用仓库的脚本顶部).
`ci.yml` 还会在每个 PR 上把资产 dry-run 打一遍.

## 2. 怎么发一次

推到 `main` 就够了:

```sh
npm run build          # 本地先跑同一条闸门(build:dist -> typecheck -> 边界守卫 -> vitest)
npm run release:pack   # 可选:本地把资产打出来看一眼
git commit ... && git push origin main
```

`.github/workflows/release.yml` 随后在 main 上:

1. `npm ci --ignore-scripts` + `npm run build` -- 安装时**不跑 `prepare`**,让生产
   构建只跑一次;闸门就是那条显式的 `npm run build`(与 `ci.yml` 同一条);
2. `npm run release:pack` -- 产出 `release/miko_ui_dist.tar.gz`;
3. `gh release create`(首次)或 `gh release upload --clobber`(之后)把它挂到
   `ui-latest`;资产先就位,再把 tag 挪到本次 commit(`git ls-remote --tags` 能
   对上"资产是哪一版",消费侧就是拿这个 tag 比资产清单里的 `gitHead`);
4. **验收**:从消费者用的那个公开 URL 重新下载一次,比对 sha256 **并核对清单里的
   `gitHead` 就是本次构建的 commit**,然后打印 release 页面与资产大小.

为什么是"覆盖"而不是"删掉 release 再建":消费者取的是固定 URL,中间那段 404 窗口
会让他们的 `preinstall` 直接失败.

- 只改 `*.md` 不会触发发布(`paths-ignore`);要**强制重出**一次,在 Actions 里
  `workflow_dispatch` 跑一次 Release.
- `release:pack` 打出的 tar 是**可复现**的(排序 + mtime/uid/gid 归零),所以内容
  没变则 sha256 不变 -- 消费者缓存里记的"来源"可以被人核对.

## 2.1 怎么发一版到 npm(链路 B)

一条命令:

```sh
npm run release:npm -- patch     # 或 minor / major / 显式 x.y.z
```

`scripts/release_npm.mjs` 会依次:检查前置(main 上,已跟踪文件干净,与 origin/main
一致)-> 检查 npm 上没发过这个版本,本地/远端没有同名 tag -> 只改两个文件里的版本号
并断言没有别的改动 -> 跑完整闸门 -> 提交并推 `main` -> 打 tag 并推 tag.任一步失败
都当场停下,在动 git 之前失败的话版本号会**自动还原**.加 `--dry-run` 只打印计划,
一个文件都不动.

手工兜底(脚本坏掉时用,等价于上面做的事):

```sh
npm pkg set version=0.1.3        # 记得 package-lock.json 的顶层与 packages[""] 两处也要改
git add package.json package-lock.json && git commit -m v0.1.3 && git push origin main
git tag v0.1.3 && git push origin v0.1.3
```

操作层面的笔记(故障对照,别做的事,术语)在 `docs/npm-release-note.md`.

`release.yml` 的 `publish` job 随后:

1. `npm ci --ignore-scripts` + `npm run build` -- 与 `ci.yml` 同一条闸门.发出去的
   必须是通过全部检查的那棵树;
2. 核对 tag 与 `package.json` 的 `version` 一致 -- 不一致的包发出去就再也收不回来
   (npm 不允许同版本重发);
3. 把 `scripts.prepare` 从**工作树**里摘掉(不提交,不改仓库),然后 `npm publish`.

第 3 步为什么存在:`npm publish` 打包前会自动跑 `prepare`,而 `prepare` 就是
`npm run build`;不摘掉就会构建两遍,违反"生产构建只跑一次".**`--ignore-scripts`
拦不住它** -- 那个开关只对安装阶段有效(`npm ci` 靠它跳过 `prepare`),对 pack/publish
阶段的 `prepare` 无效:实测 npm 10.9.8 下 `npm pack --dry-run --ignore-scripts` 照样
把整个 build + 全部测试跑了一遍.所以只能摘脚本,不能靠开关.副作用是发出去的 tarball
清单里也没有 `prepare`,与链路 A 的运行期清单一致(那边同样不带 `scripts`),是想要的.

认证靠 **OIDC 信任发布**:GitHub 为这次 job 签一张一次性身份票,npm 比对"是不是这个
仓库的这个 workflow 文件"就放行.没有长期 token 可偷,不需要轮换,**也不查账号
2FA** -- 2FA 只约束账号级动作(建/删 token,改包设置,批准暂存版本).公开仓库 +
公开包时,npm 还会自动附带 provenance,不需要加 `--provenance`.

两条硬约束,踩中任何一条都只在**发布那一刻**才报错:

- **npm 的 Trusted Publisher 只认 workflow 文件名**:包设置里填的是 `release.yml`,
  所以 npm 发布必须写在**这个文件**里,另起 `publish.yml` 会 ENEEDAUTH;
- npm **保存信任发布配置时不校验** owner / repo / workflow 文件名,填错只有发布时现形.

## 4. 规则的真身不在本文档里

这些规则以前抄在这里,但抄一遍就会漂移一次.规则写在各自的**执行点**旁边,本文档
只当索引:

| 规则 | 真身在哪 |
| --- | --- |
| 滚动 release / 资产名 / 覆盖上传 / 发布只在 main / 验收下载 | `.github/workflows/release.yml` 顶部 |
| 运行期清单:白名单,剔除 `scripts`,未知字段报错,可复现 tar | `scripts/pack_release.mjs` 顶部 |
| 不发 npm / 不写版本号 / `prepare` 必须留 / 锁只能用完整 `npm install` 重建 | `.github/workflows/ci.yml` 顶部 |
| 为什么 `prepare` 能救 typecheck(example 自引用包名,类型只在 `dist/`) | `tsconfig.json` 的 `include` 旁 |
| 应用侧怎么取产物(`file:` 链接,缓存目录,校验,手动兜底) | 两个应用仓库的 `scripts/fetch_ui.sh` 顶部 |
| 为什么必须去重(唯一实例,signal/effect 双注册表) | 两个应用仓库的 `vite.config.ts` 的 `resolve.dedupe` |

动过锁或依赖之后,交付前跑一次 CI 同款校验:

```sh
npx --yes npm@11 ci --no-audit --no-fund     # EUSAGE 就是锁缺跨平台条目
```

## 5. 固定,回滚与将来的版本号

现在只有一个滚动 tag,所以**没有**"装回上周那一版"的现成开关.要固定或回滚时:

1. 给想固定/回滚的那个 commit 补一个 tag(例如 `ui-2026-09-23`),把它当
   `ui-latest` 那样挂一份 `miko_ui_dist.tar.gz` 上去(`gh release create <tag> ...`);
2. 消费侧把 `MIKO_UI_RELEASE` 指成那个 tag(`MIKO_UI_RELEASE=ui-2026-09-23 npm run ui:update`),
   CI 里则以仓库变量/环境变量固定.

消费侧脚本从一开始就是按这个形状写的,所以补 tag 不需要改脚本.真要开始按语义
版本发布(多个消费者,对外承诺兼容性,发布节奏)时,再回来重写本文档,而不是打补丁.

## 6. 归档:当年为什么放弃 npm(2026-09 已被 §9 取代)

> **这是历史,不是现状.** 2026-09 库重新接上 npm(链路 B).当年那三道关是真的,但
> 解法不是"障碍消失了",而是绕开了它们 -- 现状见 §9.

留个结论,免得以后重走:

- **账号那一关就过不去**:`npm publish` 需要登录,而 `www.npmjs.com` 的注册/找回
  通道被 Cloudflare 挡(403),CLI 又没有找回密码的能力;新注册账号同样要过网页.
- **就算登录成功,2FA 也拦在前面**:publish 要么交互式 `--otp`,要么用勾了
  "Bypass two-factor authentication" 的 token;而 npm 的 2FA 是 WebAuthn 安全密钥,
  Linux 桌面上平台认证器支持很差.
- **包名也没得选**:scoped 的 `@miko/ui` 需要 org,建 org 只有网页一条路,而 `miko`
  这个用户名已被别人占用 -- 用户(user)与组织(org)是两套名字空间,拿不到.
- 于是包名一度退成无 scope 的 `miko_ui`,发布路径靠 GitHub Actions + 长期 token
  硬撑.这条路每一步都在跟账号体系搏斗,而它换来的收益(消费者从 registry 拉一个
  小库)完全可以用一个 GitHub Release 资产代替 -- 后者还不需要任何凭据.

## 7. CI/CD 的上线顺序(改库之后先看这里)

两个消费者的 CI 会在 `npm ci` 的 `preinstall` 里去下**已经挂好的**资产.所以:

1. 先推库(`miko_ui`),等 Release workflow 绿,资产挂上(它自己会重新下载验一遍);
2. 再推消费侧的改动.在这之前,消费侧的 CI 会因为下载不到资产而**明确失败** --
   这是刻意设计(见 §3 第 3 条),不是"配错了".
3. 本地开发不受影响:本机的 `.cache/miko_ui/current` 在第一次取到之后就一直复用,
   `npm run ui:update` 才会重新下载.

## 8. 什么时候要重新规划

出现下面任一条时,这份文件就该重写,而不是打补丁:

- 需要**对外发布**(别人要能 `npm install` / CDN 引)-- **已发生,见 §9**;
- 需要**可复现的固定版本**成为常态,而不只是偶尔回滚一次(§5 的临时办法不够用);
- 库**正式立项**(有版本语义,有兼容性承诺,有发布节奏);
- 出现**不再共享工作区**的第三方消费者(现在的两个消费者都在同一台机器上一起改).

## 9. 2026-09:重新接上 npm(链路 B 的现状)

当年放弃 npm 的那几道关(见 §6),现在的实际状态:

| 当年的障碍 | 现在 |
| --- | --- |
| `www.npmjs.com` 被 Cloudflare 挡(403) | 仍然需要代理才打得开;但网页只需要操作**一次**(配信任发布),不影响 CI |
| 2FA 是 WebAuthn 硬件,Linux 桌面难办 | **发布不需要它**:OIDC 身份票由 GitHub 现场签发,不查账号 2FA.2FA 只在改包设置,建/删 token,批准暂存版本时才要求 |
| 包名 / scope 拿不到 | 不存在这个问题:`miko_ui` 自 2026-09-22 起就是这个账号的包,已发过 `0.1.0` 与 `0.1.1` |

### 仓库与 npm 侧的现状

- 仓库:`package.json` 有 `version`,`files`(`dist` / `styles` / `README.md` /
  `LICENSE`)与 `publishConfig`(官方源 + `access: public`),**没有 `private`**.
  `scripts.prepare` 必须保留(理由见 `ci.yml` 顶部第 2 条),发布时才在 CI 工作树里
  临时摘掉(见 §2.1).
- npm:包设置 -> **Trusted Publisher** 里有一条 `ToyosatomiminoMiko/miko_ui` +
  workflow 文件名 `release.yml`,`Allowed actions` = `npm publish` +
  `npm stage publish`.
- 凭据:过渡期保留 `upload_miko`(bypass-2FA,2026-12-21 到期)当备用.等 OIDC 发布
  真正跑绿一次之后,再去包设置里选 **"Require two-factor authentication and
  disallow tokens"** 并撤销它.npm 已明确:**bypass-2FA token 的直接发布能力将在
  2027-01 前后取消**,所以 OIDC 不是"更优雅的选择",是唯一的长期解.
- `ci.yml` 里加了一条 `Check npm publish prerequisites`:断言 `private` 不存在,
  `version` 存在,`files` 含 `dist`,`publishConfig` 指向官方源.这四条都属于
  "缺了不会在这个 job 里红,只会在 `npm publish` 那一刻炸".

### 一个必须记住的坑

**`files` 字段不能删.** `.gitignore` 里有 `/dist`,而 npm 在没有 `files` 时会照
`.gitignore` 排除,于是发布出去的是**一个没有代码的空包**.链路 A 的 CI 检查看不到
这个(它查的是 release 资产),只有 `npm pack --dry-run` 看得见.

### 第一次真实发布(2026-09-24,`v0.1.2`)的验收结果

`publish` job 全绿,`release` job 按 `if` 正确跳过.事后从 registry 侧核对:

| 检查 | 结果 |
| --- | --- |
| `registry.npmjs.org/miko_ui/0.1.2` | ✅ 存在,`dist-tags.latest` 已指向 `0.1.2` |
| provenance | ✅ `/-/npm/v1/attestations/miko_ui@0.1.2` 返回 200(`0.1.1` 是 404 -- 那次没有 OIDC) |
| tarball 内容 | ✅ 79 个文件,含 `dist/index.js`,`dist/index.d.ts`,6 个 CSS;无 `src/`,无 `scripts/` |
| 发布清单里的 `prepare` | ✅ 已按设计摘除(其余 `scripts` 仍在,对 registry 安装没有影响:registry 安装只跑 `preinstall`/`install`/`postinstall`) |

两个**下次发布还会再遇到**的正常现象,别据此以为失败:

- **传播延迟**:job 绿了之后 registry 还要 1-2 分钟才查得到新版本(实测 `0.1.2`
  先 404,约两分钟后 200);
- 版本端点与 `dist-tags` 是分开传播的,可能一个先到一个后到.
