/**
 * 库样式表的"默认值只有一处"契约(配色之外的那些量).
 *
 * 判据是"这个 token 在 `tokens.css` 的 `:root` 里有没有定义":定义了还写
 * `var(--x, 字面量)`,改 tokens.css 时那处兜底不会跟着动,只在"token 没被写到
 * 根元素上"时才现形(消费者没引 tokens.css,或 JS 覆盖路径漏了).
 *
 * `--window-body-height` / `--slider-field-value-width` / `--segmented-columns`
 * 这类由运行期或消费者写入的变量不在 tokens.css 里,它们的兜底是**唯一**的
 * 默认值,不受此限.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const STYLES = join(ROOT, 'styles');

function stripComments(css: string): string {
    return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function read(name: string): string {
    return readFileSync(join(STYLES, name), 'utf8');
}

const CSS_FILES = readdirSync(STYLES).filter((name) => name.endsWith('.css'));

/** `tokens.css` 的 `:root` 里定义的全部变量名. */
function definedTokens(): Set<string> {
    const block = /:root\s*\{([\s\S]*?)\n\}/.exec(stripComments(read('tokens.css')));
    if (!block) throw new Error('tokens.css 里找不到 :root 变量块');
    return new Set([...block[1].matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
}

/** CSS 文本里的全部 `var()` 引用,按括号配对取实参(兜底里可能有 `calc(...)`). */
function varRefs(css: string): { name: string; fallback: string }[] {
    const refs: { name: string; fallback: string }[] = [];
    for (const start of [...css.matchAll(/var\(/g)].map((match) => match.index)) {
        let depth = 1;
        let index = start + 4;
        while (index < css.length && depth > 0) {
            if (css[index] === '(') depth += 1;
            else if (css[index] === ')') depth -= 1;
            index += 1;
        }
        // 未闭合的 var():直接暴露,别静默跳过.
        if (depth !== 0) throw new Error(`var( 括号未闭合: ${css.slice(start, start + 40)}`);

        const inner = css.slice(start + 4, index - 1);
        const comma = inner.indexOf(',');
        const name = (comma === -1 ? inner : inner.slice(0, comma)).trim();
        const fallback = comma === -1 ? '' : inner.slice(comma + 1).trim();
        if (name.startsWith('--')) refs.push({ name, fallback });
    }
    return refs;
}

describe('库样式表的默认值只有一处', () => {
    const defined = definedTokens();

    it('解析到了 token 表(断言本身没写坏)', () => {
        // 正控:否则下面两条会因"两边都空"而假绿.
        expect(defined.size).toBeGreaterThan(50);
        expect(CSS_FILES.length).toBeGreaterThan(4);
    });

    it('tokens.css 已定义的 token,别处不再写 var() 兜底字面量', () => {
        const offenders: string[] = [];
        for (const name of CSS_FILES) {
            if (name === 'tokens.css') continue;
            for (const { name: token, fallback } of varRefs(stripComments(read(name)))) {
                if (fallback !== '' && defined.has(token)) {
                    offenders.push(`styles/${name}: var(${token}, ${fallback})`);
                }
            }
        }

        expect(
            offenders,
            '兜底字面量就是第二份默认值:删掉 `, ...`,或者说明这个 token 为什么不放 tokens.css',
        ).toEqual([]);
    });

    it('tokens.css 已定义的 token,别处不再重新声明', () => {
        const offenders: string[] = [];
        for (const name of CSS_FILES) {
            if (name === 'tokens.css') continue;
            for (const match of stripComments(read(name)).matchAll(/(--[\w-]+)\s*:/g)) {
                if (defined.has(match[1])) offenders.push(`styles/${name}: ${match[1]}`);
            }
        }

        expect(
            offenders,
            '同一个 token 被声明了两次:默认值只写在 tokens.css,别处只写覆盖时用的值',
        ).toEqual([]);
    });
});
