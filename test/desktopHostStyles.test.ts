import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 桌面**宿主契约**:桌面根与背景层的两条口径(见 `styles/desktop.css` 的文件头).
 *
 * 为什么用机器守:这两条是窗口系统的**前提**,不是观感 --
 * 1. `.desktop-root` 的 `position: relative`:窗口层是 `absolute; inset: 0`,根若是
 *    `static`,层会以初始包含块(视口)为参照,嵌在页面里的一块桌面铺满整页;
 * 2. `.desktop-root` 的 `overflow: hidden`:窗口几何按根的 `clientWidth/Height`
 *    算,滑条一出现,那个尺寸就随滚动条变化;
 * 3. `.desktop-background` 的定位 + `--color-bg-desktop`:背景节点是消费者送的,
 *    库只能靠这个可选类给统一口径,底色也只能有一个名字.
 *
 * 判据是样式文本(静态可判定,不需要 DOM 桩),与 `scrollbarStyles.test.ts` 同一做法.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const STYLES = join(HERE, '..', 'styles');

function stripComments(css: string): string {
    return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 某条选择器的声明表;找不到就抛(选择器改名时必须有人来改这份断言). */
function declarations(css: string, selector: string): Map<string, string> {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(stripComments(css));
    if (!match) throw new Error(`styles/desktop.css 里找不到 ${selector} 的规则`);

    return new Map(match[1]
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
            const at = part.indexOf(':');
            return [part.slice(0, at).trim(), part.slice(at + 1).trim()];
        }));
}

describe('桌面宿主契约:根与背景层', () => {
    const desktop = readFileSync(join(STYLES, 'desktop.css'), 'utf8');
    const tokens = readFileSync(join(STYLES, 'tokens.css'), 'utf8');

    it('桌面根是定位上下文且不滚动', () => {
        const root = declarations(desktop, '.desktop-root');

        expect(root.get('position')).toBe('relative');
        expect(root.get('overflow')).toBe('hidden');
        // 宽高不归库:宿主可能是整页,也可能是页面里的一块.
        expect(root.has('width')).toBe(false);
        expect(root.has('height')).toBe(false);
    });

    it('背景层铺满根,压在窗口层之下,底色认 --color-bg-desktop', () => {
        const background = declarations(desktop, '.desktop-background');

        expect(background.get('position')).toBe('absolute');
        expect(background.get('inset')).toBe('0');
        expect(background.get('z-index')).toBe('0');
        expect(background.get('background')).toBe('var(--color-bg-desktop)');
    });

    it('背景层收指针事件(3D 视口 / 可交互画布就靠它)', () => {
        const background = declarations(desktop, '.desktop-background');

        expect(background.has('pointer-events')).toBe(false);
    });

    it('--color-bg-desktop 定义在 tokens.css 的 :root 里', () => {
        const block = /:root\s*\{([\s\S]*?)\n\}/.exec(stripComments(tokens));
        if (!block) throw new Error('tokens.css 里找不到 :root 变量块');

        expect(block[1]).toMatch(/--color-bg-desktop\s*:/);
    });
});
