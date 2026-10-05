/**
 * 编辑器外壳的**对齐算术**契约(见 `styles/editor.css` 文件头):
 *
 *   gutter padding-top 11px = 外框 border 1px + textarea padding-top 10px
 *   GUTTER_CHROME_PX  15    = 外框 border 1px + gutter padding-left 8px
 *                             + 行号 padding-right 6px
 *
 * 错一像素的症状是"行号整体偏一格":不报错,DOM 桩不解析样式表也不做布局.
 * 高亮层同理:字体/字号/行高/内边距/制表位差一点就是高亮与文字错位,越往右下
 * 越明显.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

/** `选择器 -> 声明体`,顶层规则足够:editor.css 里没有媒体查询与嵌套. */
function rules(file: string): Map<string, string> {
    const css = readFileSync(join(ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const map = new Map<string, string>();
    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        map.set(match[1].replace(/\s+/g, ' ').trim(), match[2]);
    }
    return map;
}

/** 取声明体里第一条 `property: value`. */
function decl(block: string, property: string): string {
    const match = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`).exec(block);
    if (!match) throw new Error(`找不到声明 ${property}`);
    return match[1].trim();
}

/** `12px` -> 12;`0` 也算合法长度(简写里常见,`0px` 与 `0` 同义). */
function px(value: string): number {
    const text = value.trim();
    if (text === '0') return 0;
    const match = /^(-?\d+(?:\.\d+)?)px$/.exec(text);
    if (!match) throw new Error(`不是 px 值: ${value}`);
    return Number(match[1]);
}

/** `padding` 简写 -> [上, 右, 下, 左]. */
function paddingSides(value: string): [number, number, number, number] {
    const parts = value.split(/\s+/).map(px);
    if (parts.length === 1) return [parts[0], parts[0], parts[0], parts[0]];
    if (parts.length === 2) return [parts[0], parts[1], parts[0], parts[1]];
    if (parts.length === 3) return [parts[0], parts[1], parts[2], parts[1]];
    if (parts.length === 4) return [parts[0], parts[1], parts[2], parts[3]];
    throw new Error(`看不懂的 padding: ${value}`);
}

const CSS = rules('styles/editor.css');
const FRAME = '.code-editor';
const TEXTAREA = '.code-editor-textarea';
const HIGHLIGHT = '.code-editor-highlight-code';
const GUTTER = '.code-editor-gutter';
const LINES = '.code-editor-lines';

/** `.code-editor` 的边框宽度:它把里面的 gutter / textarea 一起往内推. */
function frameBorder(): number {
    const match = /(\d+(?:\.\d+)?)px/.exec(decl(CSS.get(FRAME)!, 'border'));
    if (!match) throw new Error('看不懂 .code-editor 的 border');
    return Number(match[1]);
}

/** 源码里的 `GUTTER_CHROME_PX`(gutter 里除数字之外的固定宽度). */
function gutterChromePx(): number {
    const source = readFileSync(join(ROOT, 'src/editor/EditorLineNumbers.ts'), 'utf8');
    const match = /const GUTTER_CHROME_PX = (\d+)/.exec(source);
    if (!match) throw new Error('EditorLineNumbers.ts 里找不到 GUTTER_CHROME_PX');
    return Number(match[1]);
}

describe('编辑器外壳的对齐算术', () => {
    it('解析到了需要的选择器与常量(断言本身没写坏)', () => {
        for (const selector of [FRAME, TEXTAREA, HIGHLIGHT, GUTTER, LINES]) {
            expect(CSS.has(selector), `editor.css 里没有 ${selector}`).toBe(true);
        }
        expect(gutterChromePx()).toBeGreaterThan(0);
    });

    it('gutter 的 padding-top = 外框边框 + textarea 的 padding-top', () => {
        const expected = frameBorder() + paddingSides(decl(CSS.get(TEXTAREA)!, 'padding'))[0];
        expect(paddingSides(decl(CSS.get(GUTTER)!, 'padding'))[0]).toBe(expected);
    });

    it('GUTTER_CHROME_PX = 外框边框 + gutter 左内边距 + 行号右内边距', () => {
        const expected = frameBorder()
            + paddingSides(decl(CSS.get(GUTTER)!, 'padding'))[3]
            + px(decl(CSS.get(LINES)!, 'padding-right'));
        expect(gutterChromePx()).toBe(expected);
    });

    it('高亮层与 textarea 的内边距逐项相同', () => {
        expect(paddingSides(decl(CSS.get(HIGHLIGHT)!, 'padding'))).toEqual(
            paddingSides(decl(CSS.get(TEXTAREA)!, 'padding')),
        );
    });

    it('高亮层 / textarea / 行号的字体,字号,行高,软换行逐项相同', () => {
        for (const property of ['font-family', 'font-size', 'line-height', 'white-space']) {
            const values = [HIGHLIGHT, TEXTAREA, LINES].map((selector) => decl(CSS.get(selector)!, property));
            expect(new Set(values).size, `${property} 三处不一致: ${values.join(' | ')}`).toBe(1);
        }
    });

    it('高亮层与 textarea 的制表位相同(行号只显示数字,不参与这条)', () => {
        expect(decl(CSS.get(HIGHLIGHT)!, 'tab-size')).toBe(decl(CSS.get(TEXTAREA)!, 'tab-size'));
    });

    it('宽高由内容给出,两个盒子同占一格,行号槽 sticky(滚动归宿主)', () => {
        // 编辑器自己不再滚(见 styles/editor.css 的"滚动归属"):外框随内容长,
        // 内容比宿主小时由 min-* 填满;textarea 与高亮层同处网格一格,于是
        // "严格同尺寸重叠"由布局保证,不再靠 `inset: 0` 算.
        const frame = CSS.get(FRAME)!;
        const input = CSS.get('.code-editor-input')!;
        const highlight = CSS.get('.code-editor-highlight')!;
        const textarea = CSS.get(TEXTAREA)!;
        const gutter = CSS.get(GUTTER)!;

        expect(decl(frame, 'height')).toBe('auto');
        expect(decl(frame, 'min-height')).toBe('100%');
        expect(decl(frame, 'min-width')).toBe('100%');
        expect(decl(input, 'display')).toBe('grid');
        expect(decl(highlight, 'grid-area')).toBe('1 / 1');
        expect(decl(textarea, 'grid-area')).toBe('1 / 1');
        // `overflow: hidden` 会建立 scrollport,行号槽的 sticky 就以它为参照系
        // (横向滚动时行号跟着跑);`clip` 只裁切,不建立滚动容器.
        expect(decl(frame, 'overflow')).toBe('clip');
        expect(decl(gutter, 'position')).toBe('sticky');
        expect(decl(gutter, 'left')).toBe('0');
    });
});
