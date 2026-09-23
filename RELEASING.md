# `miko_ui` 的交付方式

这份文件讲"库怎么交到消费者手里"。库的形态与不变量见 `README.md`,抽取过程见原
仓库 `miko_graphcalc` 的 `docs/ui-library-extraction-plan.md`。

> 旧版本这份文件是"怎么发到 npm"的操作手册(账号、2FA、Cloudflare、token...)。
> 那些内容跟着 `npm publish` 一起作废了,但仍留在 git 历史里,不必再维护。

## 0. 结论:交付 = 滚动 release 资产 `ui-latest`

- **不发 npm**:没有 registry 包、没有 `npm publish`、没有 `publishConfig`、没有
  `NPM_TOKEN` secret。`package.json` 里 `private: true` 把这条路直接焊死。
- **不写版本号、不打版本 tag**:库里没有 `version`,发布也不是"版本发布"。每一次
  main 的构建都覆盖同一个资产:
  - release tag:`ui-latest`(**滚动**,只是"最新一份产物"的稳定下载地址);
  - 资产:`miko_ui_dist.tar.gz`;
  - URL:`https://github.com/ToyosatomiminoMiko/miko_ui/releases/download/ui-latest/miko_ui_dist.tar.gz`。
- **交付形态是那个资产,不是 main 上的源码**:消费者机器上没有 TypeScript,也不
  构建库里任何一个字节;它们只下载产物、解开、按 `file:` 链接进来。

为什么仍然不写版本号:版本号只在"要对外承诺一个稳定接口 / 要在多个版本间回滚"
时才有价值。库服务于两个自己的应用仓库,两边都在同一个工作区里天天一起改;此时
每次提交都决定升哪一位,只是仪式。真需要固定/回滚时,成本也很低 —— 见 §5。

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
消费侧就靠它回答"我缓存的这份是不是最新发布的" —— 拿它比 `ui-latest` tag 指向的
commit,不一致就重取.本地工作树有未提交改动时写的是 `<sha>-dirty`,那个值不等于
任何 tag,所以消费侧会把它当"不是最新"而重取发布产物(这正是想要的:本地试验包不该
被当成交付版本).`ci.yml` 的 dry-run 与 `release.yml` 的交付验收都会断言它等于
本次构建的 commit.

### 1.1 清单为什么必须是"生成"的

**`scripts` 绝不能进资产**。`npm install` 装 `file:` 链接的包时,会先跑目标清单里
的 `prepare`(实测 npm 10.9.8);而资产里既没有 `scripts/` 也没有 devDependencies,
那一步必然 `MODULE_NOT_FOUND: scripts/clean.mjs`。所以清单由
`scripts/pack_release.mjs` 用白名单重建,并顺手砍掉 `private`、`devDependencies`
这类构建期字段。

这份清单字段是**白名单 + 显式黑名单**:`package.json` 里出现一个两边都没分类的
顶层字段时,打包**直接失败**,逼人当场决定它该不该进资产(静默丢掉 `browser` 这类
字段的症状是"消费者行为悄悄分叉",太晚)。要加字段就去改那个脚本里的两张表。

消费侧的 `scripts/fetch_ui.sh` 会**独立再校验一次**"清单里没有 `scripts`":库侧
生成、消费侧验收,两边互为保险(这条链路的完整规则在两个应用仓库的脚本顶部)。
`ci.yml` 还会在每个 PR 上把资产 dry-run 打一遍。

## 2. 怎么发一次

推到 `main` 就够了:

```sh
npm run build          # 本地先跑同一条闸门(build:dist -> typecheck -> 边界守卫 -> vitest)
npm run release:pack   # 可选:本地把资产打出来看一眼
git commit ... && git push origin main
```

`.github/workflows/release.yml` 随后在 main 上:

1. `npm ci --ignore-scripts` + `npm run build` —— 安装时**不跑 `prepare`**,让生产
   构建只跑一次;闸门就是那条显式的 `npm run build`(与 `ci.yml` 同一条);
2. `npm run release:pack` —— 产出 `release/miko_ui_dist.tar.gz`;
3. `gh release create`(首次)或 `gh release upload --clobber`(之后)把它挂到
   `ui-latest`;资产先就位、再把 tag 挪到本次 commit(`git ls-remote --tags` 能
   对上"资产是哪一版",消费侧就是拿这个 tag 比资产清单里的 `gitHead`);
4. **验收**:从消费者用的那个公开 URL 重新下载一次,比对 sha256 **并核对清单里的
   `gitHead` 就是本次构建的 commit**,然后打印 release 页面与资产大小。

为什么是"覆盖"而不是"删掉 release 再建":消费者取的是固定 URL,中间那段 404 窗口
会让他们的 `preinstall` 直接失败。

- 只改 `*.md` 不会触发发布(`paths-ignore`);要**强制重出**一次,在 Actions 里
  `workflow_dispatch` 跑一次 Release。
- `release:pack` 打出的 tar 是**可复现**的(排序 + mtime/uid/gid 归零),所以内容
  没变则 sha256 不变 —— 消费者缓存里记的"来源"可以被人核对。

## 3. 消费者怎么取

两个应用仓库(`miko_graphcalc`、`ToyosatomiminoMiko.github.io`)用的是同一套:

1. 根 `package.json` 里 `"@miko/ui": "file:.cache/miko_ui/current"`,并**自己声明**
   库的运行时依赖 `@preact/signals-core`(把这条关系变成应用侧的显式契约,同时
   保证只有一份实例);
2. `preinstall` -> `scripts/fetch_ui.sh`:下载 -> 校验 -> 解开 -> 原子替换
   `.cache/miko_ui/current`(gitignore)。已有健康产物时直接复用,所以
   `npm ci` 反复跑是廉价的;
3. **没有"clone 源码并本地构建"的回退**:拿不到资产就明确失败,并打印 release
   页面、期望 URL、手动下载与放置步骤。要靠本地源码构建排查库的问题时,去库仓库
   (或它的本地工作副本;本机现在在 `/mnt/IVSTINIANVS/__projects_web/miko_ui`,
   独立仓库,不在 `miko_graphcalc` 里)跑 `npm run build:dist`。

消费侧脚本里可覆盖的变量(`MIKO_UI_REPO` / `MIKO_UI_RELEASE` / `MIKO_UI_ASSET` /
`MIKO_UI_ASSET_URL` / `MIKO_UI_ASSET_FILE` / `MIKO_UI_DIR`)在两个仓库的
`fetch_ui.sh` 顶部有完整表格。

## 4. 规则的真身不在本文档里

这些规则以前抄在这里,但抄一遍就会漂移一次。规则写在各自的**执行点**旁边,本文档
只当索引:

| 规则 | 真身在哪 |
| --- | --- |
| 滚动 release / 资产名 / 覆盖上传 / 发布只在 main / 验收下载 | `.github/workflows/release.yml` 顶部 |
| 运行期清单:白名单、剔除 `scripts`、未知字段报错、可复现 tar | `scripts/pack_release.mjs` 顶部 |
| 不发 npm / 不写版本号 / `prepare` 必须留 / 锁只能用完整 `npm install` 重建 | `.github/workflows/ci.yml` 顶部 |
| 为什么 `prepare` 能救 typecheck(example 自引用包名,类型只在 `dist/`) | `tsconfig.json` 的 `include` 旁 |
| 应用侧怎么取产物(`file:` 链接、缓存目录、校验、手动兜底) | 两个应用仓库的 `scripts/fetch_ui.sh` 顶部 |
| 为什么必须去重(唯一实例、signal/effect 双注册表) | 两个应用仓库的 `vite.config.ts` 的 `resolve.dedupe` |

动过锁或依赖之后,交付前跑一次 CI 同款校验:

```sh
npx --yes npm@11 ci --no-audit --no-fund     # EUSAGE 就是锁缺跨平台条目
```

## 5. 固定、回滚与将来的版本号

现在只有一个滚动 tag,所以**没有**"装回上周那一版"的现成开关。要固定或回滚时:

1. 给想固定/回滚的那个 commit 补一个 tag(例如 `ui-2026-09-23`),把它当
   `ui-latest` 那样挂一份 `miko_ui_dist.tar.gz` 上去(`gh release create <tag> ...`);
2. 消费侧把 `MIKO_UI_RELEASE` 指成那个 tag(`MIKO_UI_RELEASE=ui-2026-09-23 npm run ui:update`),
   CI 里则以仓库变量/环境变量固定。

消费侧脚本从一开始就是按这个形状写的,所以补 tag 不需要改脚本。真要开始按语义
版本发布(多个消费者、对外承诺兼容性、发布节奏)时,再回来重写本文档,而不是打补丁。

## 6. 归档:为什么放弃 npm

留个结论,免得以后重走:

- **账号那一关就过不去**:`npm publish` 需要登录,而 `www.npmjs.com` 的注册/找回
  通道被 Cloudflare 挡(403),CLI 又没有找回密码的能力;新注册账号同样要过网页。
- **就算登录成功,2FA 也拦在前面**:publish 要么交互式 `--otp`,要么用勾了
  "Bypass two-factor authentication" 的 token;而 npm 的 2FA 是 WebAuthn 安全密钥,
  Linux 桌面上平台认证器支持很差。
- **包名也没得选**:scoped 的 `@miko/ui` 需要 org,建 org 只有网页一条路,而 `miko`
  这个用户名已被别人占用 —— 用户(user)与组织(org)是两套名字空间,拿不到。
- 于是包名一度退成无 scope 的 `miko_ui`,发布路径靠 GitHub Actions + 长期 token
  硬撑。这条路每一步都在跟账号体系搏斗,而它换来的收益(消费者从 registry 拉一个
  小库)完全可以用一个 GitHub Release 资产代替 —— 后者还不需要任何凭据。

## 7. CI/CD 的上线顺序(改库之后先看这里)

两个消费者的 CI 会在 `npm ci` 的 `preinstall` 里去下**已经挂好的**资产。所以:

1. 先推库(`miko_ui`),等 Release workflow 绿、资产挂上(它自己会重新下载验一遍);
2. 再推消费侧的改动。在这之前,消费侧的 CI 会因为下载不到资产而**明确失败** ——
   这是刻意设计(见 §3 第 3 条),不是"配错了"。
3. 本地开发不受影响:本机的 `.cache/miko_ui/current` 在第一次取到之后就一直复用,
   `npm run ui:update` 才会重新下载。

## 8. 什么时候要重新规划

出现下面任一条时,这份文件就该重写,而不是打补丁:

- 需要**对外发布**(别人要能 `npm install` / CDN 引);
- 需要**可复现的固定版本**成为常态,而不只是偶尔回滚一次(§5 的临时办法不够用);
- 库**正式立项**(有版本语义、有兼容性承诺、有发布节奏);
- 出现**不再共享工作区**的第三方消费者(现在的两个消费者都在同一台机器上一起改)。
