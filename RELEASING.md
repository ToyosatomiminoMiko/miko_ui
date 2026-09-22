# `miko_ui` 的交付方式

这份文件讲"库怎么交到消费者手里"。库的形态与不变量见 `README.md`,抽取过程见原
仓库 `miko_graphcalc` 的 `docs/ui-library-extraction-plan.md`。

> 旧版本这份文件是"怎么发到 npm"的操作手册(账号、2FA、Cloudflare、token...)。
> 那些内容跟着 `npm publish` 一起作废了,但仍在 git 历史里,不必再维护。

## 0. 结论:不发布,交付 = GitHub 上的 `main`

- **不发 npm**:没有 registry 包、没有 `npm publish`、没有 tarball、没有
  `publishConfig`、没有 NPM_TOKEN secret。`package.json` 里 `private: true`
  把这条路直接焊死。
- **不打 tag、不写版本号**:`package.json` 里没有 `version`,仓库里没有 release
  workflow,也没有 registry 同步检查。库只服务**一个**消费者
  (`miko_graphcalc`),本身还在 demo 阶段、没有正式立项,不存在"对外承诺一个稳定
  版本"这件事 —— 那版本号就只是负债:每改一次都要决定升哪一位,而没有任何人依赖
  这个决定。
- **交付形态就是 `main` 分支本身**:消费者 clone 下来,在本地构建。

为什么不"按 tag 固定":那是"多消费者 + 需要可复现 + 需要回滚"才有价值的机制。
现在唯一的消费者在同一个工作区里,固定 tag 只会制造"本地明明改好了、应用却还在用
旧 tag"的假故障。等真出现第二个消费者(或真的需要回滚到某个已知状态)再把 tag 加
回来:打一个 tag + 消费者把 `MIKO_UI_REF` 指过去,成本极低。

## 1. 消费者怎么取库

唯一入口是 `miko_graphcalc/scripts/fetch_ui.sh`。应用侧的 `preinstall` 会自动调用
它,所以在应用仓库里 `npm ci` / `npm install` 就顺带把库备好了。

| 情况 | 行为 |
| --- | --- |
| `packages/miko_ui` 不存在 | `git clone --depth 1 --branch main` |
| 已存在,但不是 git 工作副本 | 告警,跳过更新,直接构建目录里的内容 |
| 已存在,默认(不加参数) | **原样复用**,一个字节都不碰 git |
| 已存在,`--update`,工作区脏 | 告警,跳过更新 |
| 已存在,`--update`,干净且能快进 | `git fetch --depth 1 origin main` + `merge --ff-only` |
| 已存在,`--update`,本地领先或历史分叉 | 告警,跳过更新 |
| `--rebuild` | 忽略"产物已是最新"的短路,强制重新安装与构建 |

取到之后在库目录里跑 `npm ci`(无 lock 时 `npm install`)+ `npm run build`,产出
`dist/`;若 `dist/index.js`、`dist/index.d.ts` 都在、`node_modules` 也在,且
`src/`、`styles/`、`scripts/`、几个 tsconfig 与 `package.json` 都不比它新,则整体
跳过 —— 所以 `preinstall` 反复执行是廉价的。

**刻意不做的事**:脚本绝不 `git reset --hard`,也绝不覆盖本地改动。库的本地副本
就是开发工作区(demo 阶段改动通常直接在那里做),取库脚本没有权力丢弃它。

可覆盖的环境变量:

| 变量 | 默认值 |
| --- | --- |
| `MIKO_UI_REPO` | `https://github.com/ToyosatomiminoMiko/miko_ui.git` |
| `MIKO_UI_REF` | `main`(clone 时必须是分支或 tag,不能是裸 SHA) |
| `MIKO_UI_DIR` | `<应用仓库根>/packages/miko_ui` |
| `MIKO_UI_UPDATE=1` | 等同 `--update` |

## 2. 改了库怎么交付

```sh
cd packages/miko_ui
npm run typecheck && npm test     # 边界守卫(pretest)+ vitest
npm run build                     # 可选:消费者取库时会自己构建
git commit ... && git push origin main
```

没有更长的流程:没有 `npm version`、没有 tag、没有 release secret、没有 CI 发布
job。库自己的 CI(`.github/workflows/ci.yml`)只验一件事:推到 `main` 上的东西
**装得上、查得过、测得过、构建得出来**。

## 3. 应用侧怎么接

```json
"@miko/ui": "file:packages/miko_ui"
```

`@miko/ui` 是应用侧给这条 `file:` 依赖起的名字;库目录里的包名是 `miko_ui`,
`file:` 链接不要求两者一致。应用里 `import '@miko/ui'` 解析到的是构建产物
`dist/index.js` + `dist/index.d.ts`,`import '@miko/ui/styles.css'` 走 `exports`
里的样式入口。

两个容易踩的点:

1. **库的运行时依赖 `@preact/signals-core` 装在库自己的 `node_modules` 里**。
   `file:` 链接不会把它提升到应用根目录,所以"取库 + 构建"这一步必须真的执行
   (脚本会做);只把目录拷过来而没有 `node_modules` 的库会让应用构建报模块找不到。
2. **`dist/` 必须在应用 typecheck / vite build 之前存在**。这就是取库脚本放在
   `preinstall` 的原因:它的执行时机早于 npm 解析 `file:` 依赖。

## 4. 归档:为什么放弃 npm

留个结论,免得以后重走:

- **账号那一关就过不去**:`npm publish` 需要登录,而 `www.npmjs.com` 的注册/找回
  通道被 Cloudflare 挡(403),CLI 又没有找回密码的能力;新注册账号同样要过网页。
- **就算登录成功,2FA 也拦在前面**:publish 要么交互式 `--otp`,要么用勾了
  "Bypass two-factor authentication" 的 token;而 npm 的 2FA 是 WebAuthn 安全密钥,
  Linux 桌面上平台认证器支持很差。
- **包名也没得选**:scoped 的 `@miko/ui` 需要 org,建 org 只有网页一条路,而 `miko`
  这个用户名已被别人占用 —— 用户(user)与组织(org)是两套名字空间,拿不到。
- 于是包名一度退成无 scope 的 `miko_ui`,发布路径靠 GitHub Actions + 长期 token
  硬撑。这条路每一步都在跟账号体系搏斗,而它换来的收益(一个消费者从 registry 拉
  一个小库)完全可以用一次 `git clone` 代替。

## 5. 什么时候要重新规划

出现下面任一条时,这份文件就该重写,而不是打补丁:

- 出现**第二个消费者**(别的仓库也要用这个库);
- 需要**对外发布**(别人要能 `npm install`/CDN 引);
- 需要**可复现的固定版本**或回滚到某个已知状态;
- 库**正式立项**(有版本语义、有兼容性承诺、有发布节奏)。

在那之前,加 tag、加版本号、加发布流水线都是纯粹的仪式。
