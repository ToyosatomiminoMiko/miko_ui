/**
 * 样式表的分发闭环:库加一份 `styles/*.css`,漏一处就是"库改了但消费侧拿不到".
 *
 * 库内守两门:`package.json` 的 `exports` 逐份列出 `./styles/<name>`(漏了
 * `import 'miko_ui/styles/<name>.css'` 直接解析失败);总入口 `styles/styles.css`
 * 逐份 `@import`(引总入口的消费者拿不到新表).另有两条反向的:总入口不许
 * import 不存在的文件,`files` 必须含 `styles`(漏了包里就没有样式表).
 *
 * 消费侧那两门(应用仓库逐份列库的 CSS,站点逐份 import)测试够不着,只能靠
 * 发布清单提醒.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const STYLES = join(ROOT, 'styles');

const CSS_FILES = readdirSync(STYLES).filter((name) => name.endsWith('.css'));

/** 总入口里 `@import "./x.css"` 引到的文件. */
function entryImports(): string[] {
    const entry = readFileSync(join(STYLES, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    return [...entry.matchAll(/@import\s+["']\.\/([^"']+)["']/g)].map((match) => match[1]);
}

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    exports: Record<string, string>;
    files: string[];
};

/** 总入口的公开出口是 `./styles.css`(指向 `styles/styles.css`),分组入口是 `./styles/<name>`. */
function exportKey(name: string): string {
    return name === 'styles.css' ? './styles.css' : `./styles/${name}`;
}

describe('样式表的分发闭环', () => {
    it('扫到的样式表不是空的(断言本身没写坏)', () => {
        expect(CSS_FILES.length).toBeGreaterThan(4);
        expect(CSS_FILES).toContain('tokens.css');
    });

    it('每份样式表都在 package.json 的 exports 里,且指向它自己', () => {
        const missing = CSS_FILES.filter((name) => pkg.exports[exportKey(name)] !== `./styles/${name}`);
        expect(
            missing,
            '这些样式表没挂进 exports(消费侧 `import "miko_ui/styles/<name>.css"` 会解析失败)',
        ).toEqual([]);
    });

    it('除总入口外,每份样式表都被 styles.css 引到,且引到的文件都存在', () => {
        const imported = entryImports();

        const missing = CSS_FILES.filter((name) => name !== 'styles.css' && !imported.includes(name));
        expect(missing, '这些样式表没进总入口:引 styles.css 的消费者会拿不到它们').toEqual([]);

        const dangling = imported.filter((name) => !CSS_FILES.includes(name));
        expect(dangling, '总入口 import 了不存在的文件').toEqual([]);
    });

    it('package.json 的 files 白名单含 styles(npm 包里才有样式表)', () => {
        expect(pkg.files).toContain('styles');
    });
});
