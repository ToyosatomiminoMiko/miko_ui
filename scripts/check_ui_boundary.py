#!/usr/bin/env python3
"""
`miko_ui` 的独立性守卫.

八条规则:

| 规则 | 目标 |
| --- | --- |
| domain-imports | 库不认识 `@/contract` `@/compiler` `@/math` `@/render` `@/config/renderConfig` |
| app-config-imports | 库不认识 `@/config/uiConfig`(配置改成注入) |
| app-source-imports | 库不认识任何 `@/` 别名(分词器/测试桩等一律注入或自带) |
| global-dom | 库(会被打包的那部分)不按 id 查节点,也不直接摸全局 `document` / `window`;不看注释,`*.test.ts` 与 `src/testing/` |
| css-ids | 库的样式只有类名(排除十六进制颜色与注释);id 选择器会变成消费者的公开 API |
| deps | `dependencies` 只允许 `@preact/signals-core` 与 `katex`(后者必须自带,见下);`peerDependencies` 必须为空 |
| exports-surface | `exports` 只有根入口(构建产物 `dist/index.*`),`styles/` 与测试入口 `./testing`,内部路径不进公开面 |
| no-batch | 库里一次都不用 `batch()`:用了就等于在更新路径上引入调度器,手写 DOM 桩立刻失真 |

前三条在这里恒为 0:本仓库没有应用源码可引用,`@/` 别名只属于消费者那一侧.
`@/` 这条同时也是"库内不许用路径别名"的机器保证,而那正是
"换消费者不用改 import"的前提.

八条都是硬断言:任何一条出现违例即非零退出.没有 baseline,也没有"允许的
例外" -- 库里的东西不属于任何单个应用,出现一处就该改成注入或自带实现.

用法:
  python3 scripts/check_ui_boundary.py            # 八条全 0 才通过
  python3 scripts/check_ui_boundary.py --list     # 打印全部违例明细

`npm test` 的 `test` 脚本会先跑这一条.

[移植注记(原 `check_ui_boundary.mjs` 直译)]
逐行正则那一套就是 JavaScript `RegExp` 的语义,而 `\\w` 与 `\\b` 在两个语言里
**默认不是一回事**:JS 的 `\\w` 恒为 `[A-Za-z0-9_]`,Python `str` 正则的 `\\w`
是 Unicode 的(汉字也算 word 字符),`\\b` 同理.这里的三条 `GLOBAL_DOM` 带
`re.ASCII` 就是为了把这个差异钉回去:否则 `// 用 document 前先...` 这种**行内**
注释(整行注释被 isCommentLine 滤掉,行内的滤不掉)在 JS 下判违例,在 Python 下
会被前面的汉字挡住后顾而判合规 -- 守卫会静默变松.以后再加正则,凡是用了
`\\w` `\\b` `\\d` `\\s` 的地方都要想一遍这件事.
"""
import json
import re
import sys
from pathlib import Path

# 本仓库的根(`scripts/` 的上一层)就是被检查的包本身.
ROOT = Path(__file__).resolve().parent.parent
PKG_SRC = ROOT / 'src'
PKG_STYLES = ROOT / 'styles'

# 源码面里不参与扫描的目录名.
SKIP_DIRS = ('node_modules', 'dist')


def walk(directory, extensions):
    """递归收集文件;`node_modules` 与 `dist` 不属于源码面.

    排序是为了让输出顺序稳定(JS 的 `readdirSync` 顺序由文件系统决定).
    """
    if not directory.is_dir():
        return []
    out = []
    for entry in sorted(directory.iterdir(), key=lambda p: p.name):
        if entry.name in SKIP_DIRS:
            continue
        if entry.is_dir():
            out.extend(walk(entry, extensions))
        elif entry.name.endswith(tuple(extensions)):
            out.append(entry)
    return out


def read_text(path):
    """按 UTF-8 读文本;非法字节按 Node 的 `readFileSync(..., 'utf8')` 那样替换掉."""
    return path.read_bytes().decode('utf-8', errors='replace')


def rel(path):
    return path.relative_to(ROOT).as_posix()


def scan(files, patterns, allow=None):
    """逐行跑一组正则,产出违例明细.

    files    -- 绝对路径列表
    patterns -- 命中即算违例(编译好的正则)
    allow    -- 白名单:命中但不算违例的行
    """
    hits = []
    for file in files:
        name = rel(file)
        lines = read_text(file).split('\n')
        for index, line in enumerate(lines):
            if allow is not None and allow(line):
                continue
            for pattern in patterns:
                if pattern.search(line):
                    hits.append({'file': name, 'line': index + 1, 'text': line.strip()})
                    break
    return hits


# `@/` 引用按优先级归类:domain > uiConfig > 其余.
DOMAIN = re.compile(r'@/(?:contract|compiler|math|render)/|@/config/renderConfig')
APP_CONFIG = re.compile(r'@/config/uiConfig')
ANY_ALIAS = re.compile(r'@/')


def alias_buckets():
    """库源码里的 `@/` 明细,一次扫描分三桶,避免同一行被数两次."""
    domain = []
    app_config = []
    other = []
    for file in walk(PKG_SRC, ['.ts']):
        name = rel(file)
        for index, line in enumerate(read_text(file).split('\n')):
            if not ANY_ALIAS.search(line):
                continue
            hit = {'file': name, 'line': index + 1, 'text': line.strip()}
            if DOMAIN.search(line):
                domain.append(hit)
            elif APP_CONFIG.search(line):
                app_config.append(hit)
            else:
                other.append(hit)
    return {'domain': domain, 'appConfig': app_config, 'other': other}


LIB_FILES = walk(PKG_SRC, ['.ts'])
# 会被消费者打包进去的那部分.
#
# 排除两类,都是**测试基建**而不是库代码:
# - `*.test.ts`;
# - `src/testing/` -- 那份 DOM 桩的职责就是造 `document` / `window`,不排除
#   它等于要求测试夹具不碰全局,规则会变成一句做不到的话.
LIB_TEST_SUPPORT = str(PKG_SRC / 'testing')
LIB_SHIPPED_FILES = [
    file for file in LIB_FILES
    if not file.name.endswith('.test.ts') and not str(file).startswith(LIB_TEST_SUPPORT)
]
STYLE_FILES = walk(PKG_STYLES, ['.css'])


def is_comment_line(line):
    """整行注释(含 JSDoc 的 `*` 行):断言守的是代码,不是文字里的提法."""
    text = line.strip()
    return text.startswith('//') or text.startswith('*') or text.startswith('/*') or text.startswith('*/')


# 全局 DOM 的判据:只看**裸标识符**,不把 `root.window.` 这类属性访问算进来
# (负向后顾排除前面是 `.`/标识符字符的情形),也不看注释与测试文件.
#
# `re.ASCII` 不能省:见文件头的"移植注记".
GLOBAL_DOM = [
    re.compile(r'(?<![.\w$])getElementById\b', re.ASCII),
    re.compile(r'(?<![.\w$])document\.', re.ASCII),
    re.compile(r'(?<![.\w$])window\.', re.ASCII),
]

# CSS 的 id 选择器:排除十六进制颜色与注释.
#
# 3/4/6/8 位的十六进制就是颜色,其余是 id 选择器.注释也一并去掉
# (块注释按字符数替换成空白,行号不漂).
CSS_COLOR = re.compile(r'^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$')
CSS_ID = re.compile(r'#[A-Za-z][A-Za-z0-9-]*')
CSS_BLOCK_COMMENT = re.compile(r'/\*[\s\S]*?\*/')


def strip_css_comments(css):
    # 只留下换行:块注释原来的行数得以保留,行号不漂.
    return CSS_BLOCK_COMMENT.sub(lambda block: re.sub(r'[^\n]', '', block.group(0)), css)


def scan_css_ids(files):
    hits = []
    for file in files:
        name = rel(file)
        stripped = strip_css_comments(read_text(file))
        for index, line in enumerate(stripped.split('\n')):
            for match in CSS_ID.finditer(line):
                if CSS_COLOR.fullmatch(match.group(0)):
                    continue
                hits.append({'file': name, 'line': index + 1, 'text': line.strip()})
                break
    return hits


def load_package_json():
    pkg_path = ROOT / 'package.json'
    if not pkg_path.is_file():
        return None
    return json.loads(read_text(pkg_path))


def check_deps(pkg):
    """库里多一个运行时依赖就是要评审的事件.

    2026-10 起 `katex` 是**库自带的运行时依赖**,不再是可选 peer:下游(计算器)
    规定不许直接依赖 katex,LaTeX 的排版与样式全部由库做完.所以它必须落在
    `dependencies` 里(下游 `npm ci` 才拿得到),`peerDependencies` 保持为空 --
    写成 peer 就等于要求下游自己声明并安装 katex,那条规定会静默失效.
    """
    if pkg is None:
        return []
    allowed_deps = {'@preact/signals-core', 'katex'}
    required_deps = {'katex'}
    dependencies = pkg.get('dependencies') or {}
    hits = []
    for name in dependencies:
        if name not in allowed_deps:
            hits.append({'file': 'package.json', 'line': 1, 'text': f'dependencies 多了一项: {name}'})
    for name in sorted(required_deps):
        if name not in dependencies:
            hits.append({
                'file': 'package.json',
                'line': 1,
                'text': f'dependencies 缺了 {name}:公式件必须由库自带,下游不许直接依赖它',
            })
    for name in (pkg.get('peerDependencies') or {}):
        hits.append({
            'file': 'package.json',
            'line': 1,
            'text': f'peerDependencies 多了一项: {name}(peer 会把安装责任推给下游;katex 已收进 dependencies)',
        })
    return hits


# 形态断言:内部路径不进 `exports`.
#
# 公开面**只有**四类,多一类都要在这里显式加:
# 1. 根入口的构建产物 -- `./dist/index.js` 与 `./dist/index.d.ts`;
# 2. 样式表 -- `./styles/` 下的任意 CSS(消费者按分组引);
# 3. **测试入口** -- `./dist/testing/domStub.js`(唯一一个非组件的公开子路径:
#    DOM 桩必须能被消费者 import,否则两边各养一份,必然漂移);
# 4. `./package.json` 自引用 -- 工具链(打包器,包管理器)读元数据要用的标准出口.
#
# 这条规则守的是"**唯一**出口"这个约定,所以它比"路径合法"更严:把
# `./dist/widgets/Button.js` 挂成 `miko_ui/widgets/Button` 会被它拦下 --
# 那样一来库内目录结构就变成了对外契约,重构要对外兼容.
ALLOWED_EXPORT_EXACT = {
    './dist/index.js',
    './dist/index.d.ts',
    './dist/testing/domStub.js',
    './dist/testing/domStub.d.ts',
    './package.json',
}


def is_allowed_export_path(value):
    return value in ALLOWED_EXPORT_EXACT or value.startswith('./styles/')


def check_exports(pkg):
    if pkg is None:
        return []
    hits = []

    def visit(value, key):
        if isinstance(value, str):
            if not is_allowed_export_path(value):
                hits.append({
                    'file': 'package.json',
                    'line': 1,
                    'text': f'exports["{key}"] 指向内部路径: {value}',
                })
            return
        if isinstance(value, dict):
            for k, v in value.items():
                visit(v, f'{key}.{k}' if key else k)

    visit(pkg.get('exports'), '')
    return hits


def collect_violations():
    """八条规则的违例明细(按声明顺序,输出顺序与它一致)."""
    buckets = alias_buckets()
    pkg = load_package_json()
    return {
        'domain-imports': buckets['domain'],
        'app-config-imports': buckets['appConfig'],
        'app-source-imports': buckets['other'],
        'global-dom': scan(LIB_SHIPPED_FILES, GLOBAL_DOM, is_comment_line),
        'css-ids': scan_css_ids(STYLE_FILES),
        'deps': check_deps(pkg),
        'exports-surface': check_exports(pkg),
        'no-batch': scan(LIB_SHIPPED_FILES, [re.compile(r'\bbatch\s*\(')], is_comment_line),
    }


def print_hits(hits):
    shown = hits[:12]
    for hit in shown:
        print(f"      {hit['file']}:{hit['line']}  {hit['text']}")
    if len(hits) > len(shown):
        print(f'      ... 另有 {len(hits) - len(shown)} 处')


def main(argv):
    violations = collect_violations()
    rules = list(violations.keys())
    counts = {rule: len(violations[rule]) for rule in rules}

    if '--list' in argv:
        for rule in rules:
            print(f'\n[{rule}] {counts[rule]} 处')
            print_hits(violations[rule])
        return 0

    failed = False

    print('UI 库边界检查')
    for rule in rules:
        now = counts[rule]
        if now > 0:
            failed = True
            print(f'  ✗ {rule}: {now} 处')
            print_hits(violations[rule])
        else:
            print(f'  · {rule}: 0 处')

    if failed:
        print('\n出现耦合.库里的东西不属于任何单个应用,请改成注入或自带实现.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
