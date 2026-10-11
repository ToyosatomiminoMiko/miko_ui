/**
 * 库自带字体的分发闭环:字体文件,`@font-face`,字体 token 三者的契约.
 *
 * 为什么值得一条测试:这三样里任何一处对不上**都不会报错** --
 * 少一个文件,`@font-face` 的 url 只是 404(浏览器静默退回回退字体);族名与 token
 * 写岔,`--font-family-base` 就指向一个没人声明的族名,同样静默.两种失效都表现为
 * "看着也像等宽字体",只能在契约层钉住:
 *
 *   1. `styles/fonts.css` 的每条 `@font-face` 都是 `url()` + woff2,且**不许**
 *      `local()`:观感不该跟着消费者机器上装了什么字体变;
 *   2. 三条 url 指的文件真的在包里(`files` 白名单收整个 `styles/`,所以只要文件
 *      落在 `styles/` 下就会被打出去),OFL 许可全文也在;
 *   3. 族名与 tokens.css 的 `--font-family-base` 首位一致,`--code-font-family` 是
 *      它的别名,而且 `:root` 上真的把默认字体设成了它(库主动给的那一份).
 *
 * 反向的"漏一处"由 `styleExports.test.ts` 守(exports 与总入口逐份列出来).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const STYLES = join(HERE, '..', 'styles');
const FONT_DIR = join(STYLES, 'fonts', 'jetbrains_mono_slashed');

/** 库真正用到的三个字重(其余字重没有消费方,不进包). */
const EXPECTED = [
    { weight: '400', file: 'JetBrainsMonoSlashed-Regular.woff2' },
    { weight: '600', file: 'JetBrainsMonoSlashed-SemiBold.woff2' },
    { weight: '700', file: 'JetBrainsMonoSlashed-Bold.woff2' },
];

function stripComments(css: string): string {
    return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

const FONTS_CSS = readFileSync(join(STYLES, 'fonts.css'), 'utf8');
const TOKENS_CSS = readFileSync(join(STYLES, 'tokens.css'), 'utf8');

/** 每条 `@font-face` 的声明体(注释已剥掉,注释里出现的同名文本不算声明). */
function fontFaces(): string[] {
    return [...stripComments(FONTS_CSS).matchAll(/@font-face\s*\{([\s\S]*?)\}/g)].map((match) => match[1]);
}

/** `tokens.css` 的 `:root` 块(与 `cssDefaults.test.ts` 同口径). */
function rootBlock(): string {
    const block = /:root\s*\{([\s\S]*?)\n\}/.exec(stripComments(TOKENS_CSS));
    if (!block) throw new Error('tokens.css 里找不到 :root 变量块');
    return block[1];
}

/** `:root` 里某个 token 的值. */
function tokenValue(name: string): string {
    const match = new RegExp(`(?:^|[;{\\s])${name}\\s*:\\s*([^;]+);`).exec(rootBlock());
    if (!match) throw new Error(`tokens.css 的 :root 里没有 ${name}`);
    return match[1].trim();
}

/** 字体栈里的第一个族名(去掉引号). */
function firstFamily(stack: string): string {
    return stack.split(',')[0].replace(/["']/g, '').trim();
}

describe('库自带字体的分发闭环', () => {
    const faces = fontFaces();

    it('解析到了三条 @font-face,两个字体 token 也读得到(断言本身没写坏)', () => {
        expect(faces).toHaveLength(3);
        expect(tokenValue('--font-family-base')).not.toBe('');
    });

    it('每条 @font-face 都是 woff2 + url(),不写 local()', () => {
        const offenders = faces.filter(
            (face) => !/format\(\s*['"]woff2['"]\s*\)/.test(face) || /local\(/.test(face),
        );
        expect(
            offenders,
            '字体必须来自包里那一份:local() 会让观感跟着"消费机器上装了什么字体"变',
        ).toEqual([]);
    });

    it('字重正好是库用到的 400 / 600 / 700', () => {
        const weights = faces
            .map((face) => /font-weight\s*:\s*(\d+)/.exec(face)?.[1])
            .sort();
        expect(weights).toEqual(EXPECTED.map((entry) => entry.weight));
    });

    it('每条 url() 指的文件真的在包里,许可全文也在', () => {
        const urls = faces.map((face) => /url\(\s*['"]([^'"]+)['"]\s*\)/.exec(face)?.[1] ?? '');
        const missing = urls.filter(
            (url) => !url.startsWith('./') || !existsSync(resolve(STYLES, url)),
        );
        expect(missing, '这些 url 不是 styles/ 下的相对路径,或找不到对应文件').toEqual([]);
        expect(urls.map((url) => url.split('/').pop()).sort()).toEqual(
            EXPECTED.map((entry) => entry.file).sort(),
        );
        expect(
            existsSync(join(FONT_DIR, 'LICENSE.txt')),
            'OFL 1.1 要求再分发时带着许可全文',
        ).toBe(true);
    });

    it('族名与 --font-family-base 首位一致,--code-font-family 是它的别名,:root 上真的设了这个默认字体', () => {
        const families = new Set(
            faces.map((face) => /font-family\s*:\s*([^;]+);/.exec(face)?.[1].replace(/["']/g, '').trim()),
        );
        // 正控:三条 @font-face 必须是同一个族,否则下面的"一致"没有意义
        expect(families.size).toBe(1);
        const family = [...families][0] ?? '';

        expect(firstFamily(tokenValue('--font-family-base'))).toBe(family);
        expect(tokenValue('--code-font-family')).toBe('var(--font-family-base)');
        expect(
            /font-family\s*:\s*var\(\s*--font-family-base\s*\)/.test(rootBlock()),
            ':root 上没有把 --font-family-base 设成库的默认字体',
        ).toBe(true);
    });
});
