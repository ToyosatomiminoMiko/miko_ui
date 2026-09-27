#!/usr/bin/env python3
"""
一键把一版发到 npm:算版本号 -> 本地过闸门 -> 提交 -> 推 main -> 打 tag -> 推 tag.

用法:
    npm run release:npm -- patch           # 0.1.2 -> 0.1.3(修 bug)
    npm run release:npm -- minor           # 0.1.2 -> 0.2.0(加功能)
    npm run release:npm -- major           # 0.1.2 -> 1.0.0(破坏性改动)
    npm run release:npm -- 0.4.2           # 显式指定版本号
    npm run release:npm -- patch --dry-run # 只检查,只打印计划,一个文件都不动
    npm run release:npm -- patch --skip-gate  # 跳过本地闸门(靠 CI 兜)
    npm run release:npm -- patch --yes     # 不问"确认吗",直接做(非交互环境必需)

    (等价于直接 `python3 scripts/release_npm.py patch ...`)

按顺序做这些,任一步失败都当场停下.在动 git 之前失败的话,版本号的改动会被还原,
工作树回到你运行它之前的样子:

  1. 前置检查:在 main 上,工作树干净,与 origin/main 一致;
  2. 目标检查:npm 上没发过这个版本,本地与远端都没有同名 tag;
  3. 在**内存里**渲染出新的 `package.json` / `package-lock.json`,并断言"只有
     version 那几行变了"(见下面 diff_lines 的说明),然后才落盘;
  4. 跑本地完整闸门 `npm run build`(= build:dist -> typecheck -> 边界守卫 -> vitest);
  5. `git commit` + `git push origin main` -- 这一步只更新滚动资产(链路 A);
  6. `git tag v<version>` + `git push origin v<version>` -- 这一步才发 npm(链路 B).

为什么版本号必须**两个文件一起改**:
  `package-lock.json` 里也有版本号(顶层一个,`packages[""]` 里一个),而 `npm ci`
  会校验锁与清单是否一致.手改了 `package.json` 却忘了锁,失败会出现在一个看不出
  关联的地方(CI 的 `npm ci`).

为什么**不用 `npm version` 命令**:
  它在改完 `package.json` 后会顺手重建 `package-lock.json`(走
  `--package-lock-only`).`ci.yml` 顶部第 3 条记着这件事的后果:那样重算出来的锁
  只按**当前平台**解析,会丢掉跨平台可选依赖(`lightningcss-*`,
  `@rolldown/binding-*` 那一批),随后 CI 的 `npm ci` 直接 EUSAGE.所以这里只做
  "解析 -> 只改版本字段 -> 原样序列化回去",再用行级 diff 断言没有别的东西被改动.
  (实测:本仓库的 `package-lock.json` 经过这个来回是字节级一致的;
  `package.json` 末尾没有换行,序列化时会保持它原本的样子,不引入无关 diff.)

为什么要先生成 tag 再推,而不是反过来:
  tag 推上去之后,`release.yml` 的 publish job 会在 CI 里再跑同一条闸门.在那里
  失败的意思是"tag 已经推出去了,但这一版没发成",得删 tag 才能重来.本地先跑
  一遍,失败时连 commit 都还没产生.

[移植注记(原 `release_npm.mjs` 直译)]
这个脚本的命门是"JSON 重新序列化之后,除了 version 那几行必须字节级不变",而两个
语言的序列化器**默认不等价**:

  * Python 的 `json.dumps` 默认 `ensure_ascii=True`,会把中文转义成 `\\uXXXX`:
    本仓库 `package.json` 的 `description` 就是中文,那样会炸出一整片 diff,让
    "只改了 version" 的断言直接误报.所以下面一律 `ensure_ascii=False`.
  * 缩进形式两边一致(`indent=2` 对应 `JSON.stringify(x, null, 2)`:冒号后一个
    空格,逗号后一个空格,空容器内联),但这一点是**验证过的**,不是想当然 --
    改这里之前先拿本仓库两个 JSON 跑一遍字节比对.
  * 读写一律走 bytes(`read_bytes` / `write_bytes`),既避开 Windows 上的换行
    翻译,也保证"没动的地方一个字节都不动".
"""
import json
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# 本仓库根 = `scripts/` 的上一层.
ROOT = Path(__file__).resolve().parent.parent
PKG_PATH = ROOT / 'package.json'
LOCK_PATH = ROOT / 'package-lock.json'


def log(message):
    # flush: 闸门那一步会 stdio 继承地把子进程输出直接写到 fd 上, 不刷新的话
    # 本脚本的日志会整块堆到子进程输出后面, 顺序读起来是错的.
    print(f'[RELEASE] {message}', flush=True)


def die(message):
    print(f'[RELEASE][ERROR] {message}', file=sys.stderr)
    sys.exit(1)


class CommandFailed(Exception):
    """子进程非零退出. 与 JS 版的 `execFileSync` 抛出对应."""


def run(cmd, args):
    """跑一条命令,原样把输出接到终端(闸门要用,得让人看见测试结果)."""
    sys.stdout.flush()
    sys.stderr.flush()
    try:
        subprocess.run([cmd] + list(args), cwd=str(ROOT), check=True)
    except FileNotFoundError as err:
        raise CommandFailed(f'{cmd} 不存在({err})')
    except subprocess.CalledProcessError as err:
        raise CommandFailed(f"{cmd} {' '.join(args)} 失败(退出码 {err.returncode})")


def capture(cmd, args):
    """跑一条命令并拿到去掉首尾空白的 stdout.失败就抛."""
    result = subprocess.run([cmd] + list(args), cwd=str(ROOT), check=True,
                            capture_output=True)
    return result.stdout.decode('utf-8', 'replace').strip()


def probe(cmd, args):
    """同上,但失败时返回空串(只用于"存在吗"这类探测)."""
    try:
        return capture(cmd, args)
    except Exception:
        return ''


def read_json(path):
    """按字节读进来自己解码: 后面要拿原始文本做行级比对, 不能让它被换行翻译动过."""
    return path.read_bytes().decode('utf-8')


# ------------------------------------------------------------------ 版本号计算

SEMVER = re.compile(r'^(\d+)\.(\d+)\.(\d+)$')


def parse_semver(value):
    match = SEMVER.match(str(value if value is not None else '').strip())
    return [int(group) for group in match.groups()] if match else None


def compare_semver(a, b):
    for i in range(3):
        if a[i] != b[i]:
            return a[i] - b[i]
    return 0


def next_version(current, requested):
    cur = parse_semver(current)
    if not cur:
        die(f'package.json 里的 version 不是 x.y.z 形式: {json.dumps(current)}')

    if requested == 'major':
        return f'{cur[0] + 1}.0.0'
    if requested == 'minor':
        return f'{cur[0]}.{cur[1] + 1}.0'
    if requested == 'patch':
        return f'{cur[0]}.{cur[1]}.{cur[2] + 1}'

    explicit = parse_semver(requested)
    if not explicit:
        die(f'版本号参数只能是 major/minor/patch 或 x.y.z,收到: {requested}')
    if compare_semver(explicit, cur) <= 0:
        die(f'新版本号必须大于当前版本: {requested} 不比 {current} 大')
    return requested


# -------------------------------------------------- 文件渲染(先内存后落盘)

def serialize_like(original, obj):
    """按原文件的换行习惯序列化回去:`package.json` 末尾没有换行,别给它加一个 --
    那会变成一行与本次发布无关的 diff."""
    return json.dumps(obj, indent=2, ensure_ascii=False) + ('\n' if original.endswith('\n') else '')


def diff_lines(before, after):
    """逐行比较,返回有差异的行.用来断言"这次改动只碰到版本号":如果 JSON 重新
    序列化顺手改了别处的格式(缩进,键序,转义),这里就会暴露出来并中止发布,而不是
    把一份被格式重排过的锁文件提交上去."""
    a = before.split('\n')
    b = after.split('\n')
    out = []
    for i in range(max(len(a), len(b))):
        old = a[i] if i < len(a) else None
        new = b[i] if i < len(b) else None
        if old != new:
            out.append({'line': i + 1, 'from': old, 'to': new})
    return out


VERSION_LINE = re.compile(r'^\s*"version":\s*"')


def is_version_line(text):
    return bool(VERSION_LINE.match(text or ''))


def render_next_files(next_value):
    pkg_raw = read_json(PKG_PATH)
    lock_raw = read_json(LOCK_PATH)
    pkg = json.loads(pkg_raw)
    lock = json.loads(lock_raw)

    next_pkg_raw = serialize_like(pkg_raw, {**pkg, 'version': next_value})

    next_lock = {**lock, 'version': next_value}
    if lock.get('packages') and lock['packages'].get(''):
        next_lock['packages'] = {
            **lock['packages'],
            '': {**lock['packages'][''], 'version': next_value},
        }
    next_lock_raw = serialize_like(lock_raw, next_lock)

    pkg_diff = diff_lines(pkg_raw, next_pkg_raw)
    lock_diff = diff_lines(lock_raw, next_lock_raw)

    if len(pkg_diff) != 1 or not all(is_version_line(d['from']) and is_version_line(d['to']) for d in pkg_diff):
        die(
            f'package.json 的改动不止一行 version({len(pkg_diff)} 处).'
            '停下来,别让无关的格式重排混进这次发布.'
        )
    if len(lock_diff) > 2 or not all(is_version_line(d['from']) and is_version_line(d['to']) for d in lock_diff):
        die(
            f'package-lock.json 的改动不止那两行 version({len(lock_diff)} 处).'
            '锁文件绝不能被重新解析重排(见 ci.yml 顶部第 3 条),停下来人工看一眼.'
        )

    return {
        'pkgRaw': pkg_raw,
        'lockRaw': lock_raw,
        'nextPkgRaw': next_pkg_raw,
        'nextLockRaw': next_lock_raw,
        'pkgDiff': pkg_diff,
        'lockDiff': lock_diff,
    }


# ------------------------------------------------ 远端与 npm 上的目标检查

def published_versions(name):
    url = 'https://registry.npmjs.org/' + urllib.parse.quote(name, safe='')
    request = urllib.request.Request(url, headers={'accept': 'application/json'})
    try:
        with urllib.request.urlopen(request) as response:
            payload = response.read()
    except urllib.error.HTTPError as err:
        if err.code == 404:
            return [], {}
        die(f'查询 npm registry 失败: HTTP {err.code}')
    except OSError as err:
        die(f'连不上 npm registry(检查代理/网络): {err}')

    doc = json.loads(payload.decode('utf-8'))
    return list((doc.get('versions') or {}).keys()), dict(doc.get('dist-tags') or {})


GITHUB_REMOTE = re.compile(r'github\.com[:/](?P<owner>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?$')


def repo_web_url():
    raw = probe('git', ['remote', 'get-url', 'origin'])
    match = GITHUB_REMOTE.search(raw)
    if not match:
        return ''
    return f"https://github.com/{match.group('owner')}/{match.group('repo')}"


def confirm(question, assume_yes, dry_run):
    if assume_yes or dry_run:
        return True
    if not sys.stdin.isatty():
        die('当前不是交互终端,确认不了.确认没问题就加 --yes 再跑一次.')
    answer = input(f'{question} [y/N] ').strip().lower()
    return answer in ('y', 'yes')


def format_diff_line(entry):
    old = (entry['from'] or '').strip()
    new = (entry['to'] or '').strip()
    return f'{old} -> {new}'


# ---------------------------------------------------------------- 主流程

def main(argv):
    flags = {arg for arg in argv if arg.startswith('--')}
    for flag in flags:
        if flag not in ('--dry-run', '--skip-gate', '--yes'):
            die(f'不认识的开关: {flag}')
    positional = [arg for arg in argv if not arg.startswith('--')]
    dry_run = '--dry-run' in flags
    skip_gate = '--skip-gate' in flags
    assume_yes = '--yes' in flags

    kind = positional[0] if positional else None
    if not kind:
        die('用法: npm run release:npm -- patch|minor|major|<x.y.z> [--dry-run] [--skip-gate] [--yes]')
    if len(positional) > 1:
        die(f"只接受一个参数,多了: {' '.join(positional[1:])}")

    pkg = json.loads(read_json(PKG_PATH))
    next_value = next_version(pkg['version'], kind)
    tag = f'v{next_value}'

    log(f"包名: {pkg['name']}")
    log(f"版本: {pkg['version']} -> {next_value}(tag {tag})")
    log(f"模式: {'dry-run(不改任何文件)' if dry_run else '真实发布'}{' + 跳过本地闸门' if skip_gate else ''}")

    # 1. 前置检查 ------------------------------------------------------------

    branch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
    if branch != 'main':
        die(f'当前分支是 {branch},发布只在 main 上做')

    # `--untracked-files=no`:只看**已跟踪**文件的改动.未跟踪的草稿文件不会进这次发布
    # (commit 只加两个 JSON,tag 指向那个 commit,CI 构建的是 commit 里的树),所以它们
    # 不该拦住一次发版.这里与 `pack_release.mjs` 判"工作树脏不脏"用的是同一条口径.
    dirty = capture('git', ['status', '--porcelain', '--untracked-files=no'])
    if dirty != '':
        die(
            '有未提交的已跟踪改动,先把它们提交或还原:\n'
            + '\n'.join(f'    {line}' for line in dirty.split('\n'))
        )

    log('拉取 origin/main 的最新状态...')
    run('git', ['fetch', 'origin', 'main', '--quiet'])

    head = capture('git', ['rev-parse', 'HEAD'])
    remote_head = probe('git', ['rev-parse', 'origin/main'])
    if remote_head and head != remote_head:
        die(
            f'本地 main 与 origin/main 不一致(本地 {head[:7]} / 远端 {remote_head[:7]}).\n'
            '    先 `git pull --ff-only` 或把本地提交推上去,再发版.'
        )

    # 2. 目标检查 ------------------------------------------------------------

    if probe('git', ['rev-parse', '-q', '--verify', f'refs/tags/{tag}']):
        die(f'本地已经有 tag {tag} 了.要么换个版本号,要么先删掉它(git tag -d {tag}).')

    remote_tags = probe('git', ['ls-remote', '--tags', 'origin', f'refs/tags/{tag}'])
    if remote_tags != '':
        die(f'远端已经有 tag {tag} 了.删掉它再发: git push origin :refs/tags/{tag}')

    log('查询 npm 上已发布的版本...')
    versions, dist_tags = published_versions(pkg['name'])
    log(f"npm 上现有: {', '.join(versions) if versions else '(空包,还没有任何版本)'}")
    log(f"最新 tag(dist-tags.latest): {dist_tags.get('latest', '(无)')}")
    if next_value in versions:
        die(f"npm 上已经有 {pkg['name']}@{next_value} 了.npm 不允许同版本重发,请换一个更大的版本号.")

    # 3. 渲染新文件 ----------------------------------------------------------

    rendered = render_next_files(next_value)
    log('版本号改动(内存里渲染的结果,还没落盘):')
    for entry in rendered['pkgDiff']:
        log(f"  package.json 第 {entry['line']} 行: {format_diff_line(entry)}")
    for entry in rendered['lockDiff']:
        log(f"  package-lock.json 第 {entry['line']} 行: {format_diff_line(entry)}")

    if dry_run:
        log('dry-run 结束:一个文件都没动.去掉 --dry-run 就会真的执行下面这些:')
        log(f"  npm run build{' (会被跳过)' if skip_gate else ''}")
        log(f'  git commit -m "{tag}" && git push origin main')
        log(f'  git tag {tag} && git push origin {tag}')
        return 0

    # 走到这里之后才动工作树;任何失败都把两个文件写回原样.
    def restore():
        PKG_PATH.write_bytes(rendered['pkgRaw'].encode('utf-8'))
        LOCK_PATH.write_bytes(rendered['lockRaw'].encode('utf-8'))

    ok = confirm(
        f"确认把 {pkg['name']} 从 {pkg['version']} 发到 {next_value}?"
        f'(会提交,推 main,推 tag {tag})',
        assume_yes, dry_run,
    )
    if not ok:
        die('已取消,什么都没做.')

    # 4. 落盘 + 本地闸门 -----------------------------------------------------

    PKG_PATH.write_bytes(rendered['nextPkgRaw'].encode('utf-8'))
    LOCK_PATH.write_bytes(rendered['nextLockRaw'].encode('utf-8'))
    log('已写入新版本号: package.json / package-lock.json')

    if skip_gate:
        log('按 --skip-gate 跳过本地闸门(由 CI 兜底)')
    else:
        log('跑本地完整闸门: npm run build(失败会还原版本号)...')
        try:
            run('npm', ['run', 'build'])
        except CommandFailed:
            restore()
            die('本地闸门没过,已把版本号还原.修好之后再发.')
        log('闸门全绿.')

    # 5. 提交 + 推 main ------------------------------------------------------

    try:
        run('git', ['add', 'package.json', 'package-lock.json'])
        # 不绕过 `core.hooksPath` 指向的提交钩子(见 ci.yml 顶部第 2.1 条):这个 commit
        # 只动两个 JSON,钩子在这里通常什么都不做,但它要是坏了就该当场红,而不是被跳过.
        run('git', ['commit', '-m', tag])
    except CommandFailed:
        restore()
        die('git commit 失败,已把版本号还原.')

    try:
        run('git', ['push', 'origin', 'main'])
    except CommandFailed:
        die(
            f'推 main 失败.本地已经有一个 commit({tag}),仓库里的版本号也改了.\n'
            '    不想留这个 commit:  git reset --soft HEAD~1\n'
            '    只想稍后重推:     git push origin main'
        )
    log('已推 main:滚动资产(链路 A)会重新出一份.')

    # 6. 打 tag + 推 tag(这一步才发 npm) ------------------------------------

    try:
        run('git', ['tag', '-a', tag, '-m', tag])
    except CommandFailed:
        die(f'打 tag 失败.代码已经在 main 上了,手动补: git tag -a {tag} -m {tag}')

    try:
        run('git', ['push', 'origin', tag])
    except CommandFailed:
        die(
            f'推 tag 失败.本地 tag 已经建好了,手动补推: git push origin {tag}\n'
            f'    想放弃这次: git tag -d {tag}'
        )

    repo = repo_web_url()
    print('')
    log(f"完成:{pkg['name']}@{next_value} 已经推到 tag {tag}.")
    if repo:
        log(f'去看流水线:{repo}/actions/workflows/release.yml')
    log('publish job 绿了之后,registry 上还要 1-2 分钟才查得到新版本(传播延迟,不是失败).')
    log(f"核对包页面:https://www.npmjs.com/package/{pkg['name']}")
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main(sys.argv[1:]))
    except CommandFailed as err:
        die(str(err))
