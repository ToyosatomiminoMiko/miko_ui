# npm 发版笔记

这份是**操作笔记**:照着敲就行,不需要理解原理.原理,约束与取舍在 `RELEASING.md`
(§0 两条链路,§2.1 npm 发布流程,§9 现状与坑).

---

## 一句话

```sh
npm run release:npm -- patch
```

这一条命令就把"改版本号 -> 跑完整闸门 -> 提交 -> 推 main -> 打 tag -> 推 tag"
全做完,剩下的交给 GitHub Actions.

---

## 日常推送:版本号一个字都不用动

**改代码,修 bug 的日常推送,不要碰版本号,也不需要发 npm:**

```sh
git add -A && git commit -m "..." && git push origin main
```

推 `main` 就已经把最新产物交给两个应用仓库了(滚动资产 `ui-latest` 被覆盖,
消费侧靠 `gitHead` 判断要不要重取,全程与版本号无关).

| 你想做什么 | 命令 | 版本号 |
| --- | --- | --- |
| 日常改代码,给自己那两个应用用 | `git push origin main` | **不用动** |
| 想给 npm 上的人一个新快照 | `npm run release:npm -- patch` | 脚本自动改 |

两个 job 的分工就写在这两条上:推到**分支**只跑 `release`(资产),推到 **tag**
才跑 `publish`(npm).所以:

- npm 上的版本**落后于 `main` 是正常的** -- 它只是"上一次对外发的快照"的标记;
- 没人用 npm 时,你甚至可以几个月不发一次,`main` 照样天天推;
- 副作用只有一个:滚动资产清单里的 `version` 会停在 `0.1.2` 直到你下次发 npm.
  这不影响任何东西 -- 消费侧认的是 `gitHead`.

---

## 你唯一要决定的事:升哪一位

| 写什么 | 结果 | 什么时候用 |
| --- | --- | --- |
| `patch` | `0.1.2` -> `0.1.3` | 修 bug,改样式,内部重构(最常用) |
| `minor` | `0.1.2` -> `0.2.0` | 加了新组件/新功能,老的用法还照旧能用 |
| `major` | `0.1.2` -> `1.0.0` | 改了对外接口,别人的代码要跟着改 |
| `0.4.2` | 就是 `0.4.2` | 想指定一个具体版本号(**必须比现在大**) |

> `0.x` 阶段(现在就是)本来就不承诺稳定接口,所以日常基本只用 `patch`.
> 拿不准就用 `patch`.

---

## 标准流程(三步)

```sh
cd /.../miko_ui

# 1) 先把要发的代码提交并推上去 -- 脚本要求"已跟踪文件没有未提交改动"
git add -A && git commit -m "..." && git push origin main

# 2) 先看一眼计划(不改任何文件,只是把要做的事打印出来)
npm run release:npm -- patch --dry-run

# 3) 确认没问题,真的发
npm run release:npm -- patch
```

第 3 步会先问你一句 `确认把 miko_ui 从 0.1.2 发到 0.1.3?`,敲 `y` 回车.
(不想被问就加 `--yes`.)

---

## 脚本替你做的 6 件事

1. **前置检查** -- 在 `main` 上吗?已跟踪文件干净吗?和 `origin/main` 一致吗?
2. **目标检查** -- npm 上是不是已经发过这个版本?本地/远端是不是已经有同名 tag?
3. **改版本号** -- `package.json` 和 `package-lock.json`(两处)一起改,
   并且断言"只有 version 那几行被改动",别的地方一个字节都不许动.
4. **跑完整闸门** -- `npm run build`(构建 + 类型检查 + 边界守卫 + 全部测试).
   这一步失败的话,版本号会被**自动还原**,你什么都没损失.
5. **提交 + 推 `main`** -- 这一步只更新 GitHub 上的滚动资产,不发 npm.
6. **打 tag + 推 tag** -- 这一步 GitHub Actions 才把包发到 npm.

任一步失败都当场停下,并告诉你怎么收尾.在动 git 之前失败,工作树回到你运行它之前的样子.

---

## 发完之后看什么

| 看什么 | 在哪 | 期望 |
| --- | --- | --- |
| `publish` job | 仓库的 Actions -> Release workflow | 绿色 |
| `release` job | 同一个 workflow | **skipped**(tag 推送不该去覆盖滚动资产) |
| 包页面 | `https://www.npmjs.com/package/miko_ui` | 出现新版本号 + provenance 徽章 |
| 版本详情 | `https://registry.npmjs.org/miko_ui/<版本>` | 返回 200 |

⚠️ **一个一定会遇到,别误判的现象**:job 绿了之后,npm 上大约还要 **1-2 分钟**才查得到
新版本(实测:先 404,两分钟后 200).`dist-tags` 可能比版本端点再晚一点.
**不是发布失败,别重发.**

---

## 出错了怎么办

| 屏幕上出现 | 意思 | 怎么办 |
| --- | --- | --- |
| `有未提交的已跟踪改动` | 有改动没提交 | 先 `git add` + `git commit`,或 `git checkout -- <文件>` 还原 |
| `本地 main 与 origin/main 不一致` | 本地和远端分叉了 | 先 `git pull --ff-only`,或把本地提交推上去 |
| `本地已经有 tag vX` | 本地重复的 tag | `git tag -d vX`,或换一个版本号 |
| `远端已经有 tag vX` | 远端重复的 tag | `git push origin :refs/tags/vX` 删掉它 |
| `npm 上已经有 miko_ui@X` | 这个版本发过了 | 换一个更大的版本号(npm 不允许同版本重发) |
| `新版本号必须大于当前版本` | 你写的比现在小或相等 | 换大的 |
| `本地闸门没过` | 构建/类型检查/测试没通过 | 版本号已自动还原.修好代码再发 |
| `推 main 失败` | 网络/权限 | 本地已有一个 commit:`git reset --soft HEAD~1` 撤销,或 `git push origin main` 重推 |
| `推 tag 失败` | 同上 | `git push origin vX` 重推;放弃就 `git tag -d vX` |
| `publish` job 红了 | 看 job 日志 | 通常是 tag 与版本号不一致,或 Trusted Publisher 里的仓库/文件名对不上(填错**只有发布这一刻才报错**) |

### 发错了版本怎么办

- **能删 tag**:`git push origin :refs/tags/vX && git tag -d vX`
- **但已经在 npm 上架的那一版删不掉**(npm 不允许同版本重发).正确做法是**发下一个
  版本号**修正它,而不是想办法删掉.所以发之前多想 5 秒值不值得.

---

## 不要做的事

- ❌ **别删 `package.json` 里的 `files`**.`.gitignore` 里有 `/dist`,没有 `files` 时
  npm 会照它排除,发出去就是**一个没有代码的空包**.
- ❌ **别用 `npm version` 改版本号**.它会顺手重算 `package-lock.json`,而那会丢掉
  跨平台可选依赖,随后 CI 的 `npm ci` 直接报错.用 `npm run release:npm`.
- ❌ **别在本机 `npm publish`**.本机那个 token 已不需要(而且 2026-12-21 过期),
  本地发还会绕过流水线里的闸门与 provenance.
- ❌ **别手动重新生成 `package-lock.json`**(`npm install --package-lock-only` 之类).
  要重建只能用完整 `npm install`,理由见 `ci.yml` 顶部第 3 条.
- ❌ **别在版本号还没提交的情况下打 tag**,publish job 会因 tag 与版本号不一致而红.

---

## 术语小词典

| 词 | 说人话 |
| --- | --- |
| **registry** | npm 的服务器,包存的地方(`registry.npmjs.org`) |
| **tarball** | 发上去的那个 `.tgz` 压缩包,里面是 `dist/` + `styles/` + README + LICENSE |
| **tag(本文里的)** | git 标签.推 `v0.1.3` 这种 tag 是"发一版"的扳机 |
| **`dist-tags`** | npm 上给版本起的别名,`latest` 就是"别人 `npm install` 时默认装的那个" |
| **OIDC 信任发布** | 发布时的认证方式:GitHub 现场签发一张几分钟就作废的身份票给 npm 看.没有长期密码/token 可偷,所以**不需要账号 2FA** |
| **provenance** | npm 自动附上的"这包是在哪个仓库,哪个 commit,哪个流水线构建的"证明.公开仓库 + OIDC 才有,白拿 |
| **`files`** | npm 打包时的**白名单**:从磁盘上取哪些路径装进 tarball.构建产物 `dist/` 靠它才进得去 |
| **token** | 老办法用的长期凭据(`upload_miko`,放在你本机 `~/.npmrc`).**现在用不到了**,2026-12-21 自然过期 |
| **2FA** | 两步验证.现在**只影响"改包设置,建/删 token,批准暂存版本"这些账号级操作**,发版不需要它 |

---

## 两条交付链路(别搞混)

| | 给谁 | 怎么触发 | 产物 |
| --- | --- | --- | --- |
| **滚动资产**(主) | 你那两个应用仓库 | 推 `main` | GitHub release 上 `ui-latest` 的 `miko_ui_dist.tar.gz`,内容被覆盖 |
| **npm 包**(对外) | 想 `npm install` 的人 | 推 `v*` tag | registry 上的 `miko_ui@<版本>` |

**`npm run release:npm` 会同时触发两条**:先推 main(资产),再推 tag(npm).
两条互不干扰,`release` job 在 tag 推送时会被跳过.

细节与取舍见 `RELEASING.md`.
