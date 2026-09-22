# 发布 `miko_ui` 到 npm

这份文件只讲"怎么把它发出去"。库的形态与不变量见 `README.md`,抽取过程见原仓库
`miko_graphcalc` 的 `docs/ui-library-extraction-plan.md`。

## 0. 现状

**包本身已经发布就绪**:

- `npm run build` 产出 `dist/`(ESM + `.d.ts`),`npm pack` 白名单只有
  `dist/` + `styles/` + `README.md` + `LICENSE`;
- 包名是**无 scope** 的 `miko_ui`,所以**不需要 npm 组织(org)**,也不需要为了
  建 org 去碰网页;
- `publishConfig` 把发布目标钉在 `https://registry.npmjs.org` 并声明
  `access: public`,即使你的默认 registry 是镜像也能正确发布。

**唯一的卡点是账号**:`npm publish` 需要登录,而你目前登录不进去(见 §1)。

## 1. 账号(唯一的卡点)

### 1.1 "邮箱已经被注册了" —— 说明你已经有号

npm 不允许同一个邮箱注册两个账号。这条错误意味着这个邮箱上**已经存在一个 npm
账号**。npm CLI **没有**任何"忘记密码"命令,registry 上也没有重置端点(实测
`/-/forgot` 返回的 405 和随便编一个路径返回的一模一样,是通用兜底),所以按下面
分支走:

**分支 A:记得用户名和密码** —— 这是最短路径,**全程 CLI,完全不用碰网页**:

```bash
npm adduser --auth-type=legacy --registry=https://registry.npmjs.org
npm whoami --registry=https://registry.npmjs.org
```

`adduser` 同时也是登录入口:用户名密码对得上就直接登录成功。用户名忘了就翻邮箱
搜 `npm`,找 "Welcome to npm" / "Please verify your email" 那几封。

**分支 B:忘了密码** —— 只能走网页重置 <https://www.npmjs.com/forgot>,因此必须
先解决 §1.3 的 Cloudflare 问题。

**分支 C:当初是用 GitHub 一键登录注册的** —— 那个账号可能压根没有密码,直接用
"Sign in with GitHub" 登录,别走邮箱密码(同样需要网页可达)。

**分支 D:确认这个邮箱不是你的**(被别人注册了)—— 写邮件给
`support@npmjs.com` 说明;网页 support 表单在 CF 后面,邮件更靠得住。

### 1.2 如果只想尽快发出去:换个邮箱开新号

旧账号如果找不回来,最省事的就是**用另一个邮箱注册一个新账号**——新号没有历史
包袱,注册完直接就能发 `miko_ui`:

```bash
npm adduser --auth-type=legacy --registry=https://registry.npmjs.org
```

用自己另一个邮箱,或者 Gmail 的 `+` 别名(如 `you+npm@gmail.com`)。注意:

- 一次性邮箱域名会被 npm 拒绝;
- **注册后可能需要邮箱验证才能发布**。如果验证链接指向 `www.npmjs.com`,那这一步
  仍然要过 CF —— 这一点没有实测过,遇到时会明确报错。

### 1.3 如果 `www.npmjs.com` 被 Cloudflare 挡住

症状:`www.npmjs.com` 的任何路径(包括 `/login`、`/signup`、`/forgot`)都返回
403 / "Sorry, you have been blocked";同时 `registry.npmjs.org` 正常。这通常是
**出口 IP 信誉**问题(机房 IP、代理出口),不是账号问题 —— 同一个出口访问
stackoverflow 之类 CF 站点也会被挑战。

- 根治:换出口 IP(手机热点 / 换 ISP / 关掉 VPN)。
- 浏览器侧:关掉 uBlock / Privacy Badger 一类扩展(会打断 Turnstile)、关"阻止
  第三方 Cookie"、换浏览器或隐身模式。
- 别用 curl 测网页,CF 必拦 curl;用真浏览器。
- 隔 15–30 分钟再试,反复重试会加剧限流。

### 1.4 注册/登录通道的实测情况

`registry.npmjs.org` 的 **legacy 账号端点仍然可用**:空 body 打
`PUT /-/user/org.couchdb.user:<name>` 会返回
`400 {"error":"child \"password\" fails because [\"password\" is required]"}` ——
它在正常校验创建账号所需的字段,不是 403/404/410。

```bash
# 关键:必须显式 --auth-type=legacy。npm 10+ 的 login/adduser 默认走网页
# (会给你一个 www.npmjs.com/login?... 的链接),那条路正好撞在 CF 上。
npm adduser --auth-type=legacy --registry=https://registry.npmjs.org

# 想让它成为默认行为:
npm config set auth-type legacy
```

若命令报 `EROFS` / "read-only file system" 指向 `~/.npm`,那是运行环境的写权限
限制,不是 npm 的问题 —— 换一个普通 shell 跑。

## 2. 发布

```bash
cd packages/miko_ui

npm run build          # 可选:prepack 会自动跑
npm pack --dry-run     # 核对清单:应只有 dist/ + styles/ + README + LICENSE
npm publish
```

`npm publish` 的生命周期顺序固定,不需要你手动补:

1. `prepublishOnly` → `npm run typecheck && npm test`(8 条边界守卫 + 217 个用例);
2. `prepack` → `npm run build`(构建 `dist/`);
3. 打包、上传。

发布后核对:

```bash
npm view miko_ui version --registry=https://registry.npmjs.org
npm view miko_ui dist.tarball --registry=https://registry.npmjs.org
```

### 2.1 如果被 403 拦下:`Two-factor authentication ... is required`

```
npm error 403 403 Forbidden - PUT https://registry.npmjs.org/miko_ui -
  Two-factor authentication or granular access token with bypass 2fa enabled
  is required to publish packages.
```

这条**不是认证失败**——请求已经通过认证到了 registry,只是账号开了 2FA,而手上的
token 没有"绕过 2FA"的权限。两种解法:

**A. 交互式一次性密码(最快,不用换 token)**

```bash
npm publish --otp=123456      # 认证器 App 里的 6 位码,30 秒一轮
```

**B. 换一个带 bypass 的 Granular Access Token(适合反复在本机发)**

网页上新建 token 时勾上 **Bypass two-factor authentication** —— 这个勾**默认是
不勾的**,绝大多数"我明明建了 token 却被 2FA 拒"都是漏了它。官方原文:"By
checking this box, the token will bypass 2FA for publishing even if 2FA is enabled
at the account or package level."

**先自查,别猜**:registry 会把每个 token 的 `bypass_2fa` 直接告诉你(只读,不打印
token 本身):

```bash
TOKEN=$(grep -oP '(?<=_authToken=)\S+' ~/.npmrc | head -1)
curl -s -H "Authorization: Bearer $TOKEN" https://registry.npmjs.org/-/npm/v1/tokens \
  | python3 -c "import sys,json; [print(t['name'],'bypass_2fa =',t['bypass_2fa']) for t in json.load(sys.stdin).get('objects',[])]"
```

- `bypass_2fa = False` + `permissions` 里有 `package: write` → **就是漏勾了**,
  重建一个勾上的即可,不需要验证器、不需要 `--otp`;
- `bypass_2fa = True` 却仍然 403 → 那是 npm 侧未修复的 bug
  ([npm/cli#9268](https://github.com/npm/cli/issues/9268)),该讨论里唯一被确认
  有效的绕法是**手工把正确的 token 写进 `.npmrc`**(报告者的 `~/.npmrc` 里被
  `npm login` 塞进了无效值),而不是让 CLI 去写。

> 注意:npm 正在收紧"绕过 2FA 的 token"。从 2026 年 8 月起,bypass 只对**发布**有效,
> 涉及账号身份与账号治理的操作(改邮箱、加维护者等)永远要求交互式 2FA。

**C. 长远解法:OIDC(Trusted Publishing)** —— 详见 §4。但要注意它**不是立刻可用
的退路**:配置 Trusted Publisher 本身就要过 2FA,见 §4 开头的说明。

## 3. 之后每次发版

手动发(本地):

```bash
npm version patch        # 或 minor / major;自动改 package.json + commit + 打 tag
npm publish              # 需要 --otp,除非 token 勾了 bypass
git push --follow-tags
```

自动发(推荐):配好 §4 之后,`git push --follow-tags` 就是全部动作。

## 4. CI 自动发布:推 tag 即发布

`.github/workflows/release.yml`:推 `v*` tag 即发布。当前认证方式是存在仓库
secret 里的 **Granular Access Token**(§4.1),不是 Trusted Publishing。

### 为什么不是 Trusted Publishing

它本来更好(无长期凭据 + 自动 provenance),但它要求你先在 npmjs.com 上配置
Trusted Publisher,而**配置它属于 npm 的"账号治理操作":从 2026 年 8 月起,治理
操作永远要求交互式 2FA,bypass-2FA token 在这里无效**(bypass 只对"发布"有效)。

而 npm 的 2FA **不是验证器 App**,是 **WebAuthn 安全密钥**,官方原文:

> You will be prompted to authenticate with a security-key. The security-key flow
> allows you to use biometric devices such as Apple Touch ID, Face ID or Windows
> Hello as well as physical keys such as Yubikey, Thetis or Feitian.

所以:有 Touch ID / Windows Hello(Mac/Windows)或硬件密钥 → 可以按 §4.2 升级到
OIDC;没有(例如 Linux 桌面)——用 §4.1。Linux 对 WebAuthn 平台认证器支持很差。

### 4.1 token 路线(当前采用)

一次性配置:

1. 建 token(同 §2.1 的 B):Granular Access Token,`Packages and scopes →
   Read and write`,**勾上 Bypass two-factor authentication**;
2. GitHub 仓库 → Settings → Secrets and variables → Actions → New repository
   secret,名字 `NPM_TOKEN`,值填那个 token;
3. 之后每次:
   ```bash
   npm version patch          # 0.1.0 → 0.1.1,自动 commit + 打 tag
   git push --follow-tags     # 触发 release.yml 自动发布
   ```

代价与注意事项:

- **没有 provenance 签名** —— provenance 只能由 OIDC 发布产生;
- token 是长期凭据,存在 GitHub secret 里,拥有仓库 admin 权限的人都能取用;
- **必须轮换**:当前 token 有效期到 2026-12-20,到期前换新的并更新 secret,
  否则发布会在那天突然失败。

### 4.2 有安全密钥时升级到 OIDC

1. npm 头像 → Account → Enable 2FA,按 WebAuthn 流程绑定(Touch ID / Windows
   Hello / 硬件密钥);
2. npmjs.com → 包 `miko_ui` → Settings → **Trusted Publisher** → GitHub Actions,
   填三个必填项:
   - Organization or user:`ToyosatomiminoMiko`
   - Repository:`miko_ui`
   - Workflow filename:`release.yml`(**只填文件名**,不含路径,必须带 `.yml`)
   - Environment name:**留空**。它是给"用 GitHub environment 做发布审批"的项目用
     的;要填就必须和 workflow 里 job 的 `environment:` **字面完全一致**,否则
     OIDC 声明对不上会失败;
3. 改 `release.yml`:加回 `permissions: id-token: write`,删掉 publish 那步的
   `env: NODE_AUTH_TOKEN`;
4. 之后可以删掉 `NPM_TOKEN` secret,每个版本自动带 provenance。

走 OIDC 时的官方硬要求:**npm CLI >= 11.5.1**、**Node >= 22.14.0**、只支持
**GitHub 托管的 runner**(self-hosted 不支持)。

发布成功后 npm 页面会显示 **provenance**:这个版本来自哪个仓库、哪个 commit、
哪个 workflow。

workflow 里有一道 tag 与 `package.json` 版本号一致性的校验,不一致直接失败。

> 仓库里现存的 `v0.1.0` tag 指向的是**改名之前**的形态,所以第一次自动发布要从
> `v0.1.1`(或 `v0.2.0`)开始,不要复用 `v0.1.0`。

## 5. 归档:为什么不是 `@miko/ui`

最初想发 `@miko/ui`,查下来**这条路是封死的**,记在这里免得以后重走:

- scoped 包需要 **org**,建 org **只有网页一条路**(registry 上
  `/-/org/<name>`、`/-/v1/org/<name>`、`/-/org/create`、`/-/npm/v1/org/<name>`
  全部 404;`npm org` 也只有 `set` / `rm` / `ls`,没有 `create`)。
- 而 `miko` 这个名字**已经被别人占用了**:包 `cc` 的 maintainers 里有用户名
  `miko`(2012 年注册)。
- npm 官方文档
  ([Migrating a User Scope to an Org Scope](http://npm.github.io/private-pkgs-orgs-docs/setup/u2o.html))
  说明:组织名若已被占用,**只有当那个名字是你自己的用户**时才会提示你迁移成
  org。别人的用户名拿不到。

> 教训:早先根据"`@miko` scope 下有 0 个包"推断名字还空着是**错的** —— 用户
> (user)与组织(org)是两套名字空间,一个用户可以不发任何包。

探测一个名字是否可用的小技巧:registry 的 `/-/org/<name>/user` 对**已存在的用户或
组织**返回 200,对未使用的名字返回 404。用之前一定跑一个随机对照名(如
`zzz_not_real_org_9f3a2b`)确认它返回 404,否则分不清"名字可用"和"这个端点本来就
不校验"。

以后若想要命名空间(如 `@miko_graphcalc/ui`),这些名字实测可用:
`miko_ui`、`miko_graphcalc`、`mikographcalc`、`toyosatomiminomiko`。

## 5.1 命名约定:连字符一律用下划线

本项目的名字(包名、文件名、脚本名)一律用 `_`,不用 `-`。已经改过的:

| 改前 | 改后 |
| --- | --- |
| 包名 `miko-ui` | `miko_ui` |
| `scripts/check-ui-boundary.mjs` | `scripts/check_ui_boundary.mjs` |
| `scripts/fix-esm-specifiers.mjs` | `scripts/fix_esm_specifiers.mjs` |
| `boundary-baseline.json` | `boundary_baseline.json` |
| `src/css-modules.d.ts` | `src/css_modules.d.ts` |
| `example/vite-env.d.ts` | `example/vite_env.d.ts` |

### 改不了的连字符(改了就是 bug,不要动)

这些不是"命名风格",是**规范或第三方固定的字符串**:

| 类别 | 例子 | 为什么不能改 |
| --- | --- | --- |
| ARIA 属性 | `aria-label`、`aria-pressed`、`aria-expanded`、`aria-hidden`、`aria-labelledby`、`aria-controls` | W3C ARIA 规范固定;写成 `aria_label` 后无障碍工具直接读不到 |
| CSSOM 属性名 | `z-index` | CSS 规范固定 |
| CSS `cursor` 关键字 | `ns-resize`、`nwse-resize` | CSS 规范固定 |
| 第三方包名 | `@preact/signals-core` | 别人的包名,写错就装不上 |
| SPDX 许可证标识 | `AGPL-3.0-or-later` | SPDX 规范固定 |
| npm 生成的文件名 | `package-lock.json` | npm 自己创建和读取 |

### 还有三类"能改但会破坏消费者"的名字(待定,见下)

- **CSS 类名**(约 60 个,如 `.window-layer`、`.is-maximized`、`.code-editor-input`)
- **CSS 自定义属性**(96 个,如 `--color-bg-panel`、`--radius-sm`)
- **`data-*` 属性**(5 个:`data-window`、`data-state`、`data-tex`、`data-dock-action`、`data-window-resize`)

这三类是**公开样式 API** —— `scripts/check_ui_boundary.mjs` 的 `css-ids` 规则与
`README.md` 的"公开面"一节都明确写着"库的样式只有类名",消费者靠它们写选择器。
上级应用 `miko_graphcalc` 实测就有耦合:`data-tex` 6 个文件、`--color-` 7 个、
`code-editor` 4 个、`--radius-` 3 个、`window-layer` / `is-maximized` /
`control-group` / `snap-preview` / `data-window` 各 1 个。改这些必须**同时**改
上级应用,否则样式静默失效(不会报错,只是看起来不对)。

## 6. 两个已知坑

### 6.1 上级应用用的是 git archive tarball 依赖 —— 不要只打 tag

`miko_graphcalc/package.json` 里现在是:

```json
"@miko/ui": "https://github.com/ToyosatomiminoMiko/miko_ui/archive/refs/tags/v0.1.0.tar.gz"
```

archive 里**没有 `dist/`**(`dist/` 在 `.gitignore` 里),而 `exports` 现在指向
`dist/`。实测 npm 的各依赖形式是否执行 `prepare`:

| 依赖形式 | 会跑 `prepare` 吗 |
| --- | --- |
| 远程 tarball URL(GitHub archive) | **不会** |
| 本地 tarball 文件 | 不会 |
| `file:` 本地目录 | 会 |
| `github:owner/repo#tag` / `git+...` | **会** |

结论:**在应用侧升级之前,不要给库推新 tag** —— 应用一升级就会找不到
`./dist/index.js`。`v0.1.0` 是旧形态(exports → 源码),不受影响。

发布成功后,应用侧要**同时**改两处:依赖的**键名**(`@miko/ui` → `miko_ui`)和源码
里的 import(Library 已全部改名,应用侧还是旧名,共 3 处
`import ... from '@miko/ui'` 在 `src/app/RenderController.ts`,1 处
`resolve('@miko/ui/styles/tokens.css')` 在 `src/app/applyUiConfig.test.ts`)。

```json
"miko_ui": "^0.2.0"
```

若暂时不想依赖 registry,用 git 形式(库里的 `prepare` 会让它在安装时自动构建):

```json
"miko_ui": "github:ToyosatomiminoMiko/miko_ui#v0.2.0"
```

### 6.2 Node 原生 `import 'miko_ui'` 会失败

根的 `index` 经 `export *` 会拉进 `FormulaView`,那里有一条
`import 'katex/dist/katex.min.css'`,Node 的 ESM 加载器不认识 `.css`,报
`ERR_UNKNOWN_FILE_EXTENSION`。Vite / webpack / Next / Rollup 都没问题(它们把 CSS
当资源处理)。

要让 Node 侧(SSR、node 环境的 vitest)也能 import 根入口,得删掉
`src/formula/FormulaView.ts` 里那一行,改由消费者自己引 katex 的样式;代价是
`miko_graphcalc` 那边要补一行 `import 'katex/dist/katex.min.css'`。属于跨仓库的
行为变更,没做。
