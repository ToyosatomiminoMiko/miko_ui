/**
 * 桌面外壳两个尺寸的**单一来源**契约.
 *
 * `--window-header-height` 与 `--dock-reserve` 是同一份数被 JS 与 CSS 各消费
 * 一次:几何用它们算工作区上沿与正文高度,CSS 用它们画 `.dock` 高度、
 * `.window-header` 高度与 `.window.is-maximized` 的 `inset`.
 *
 * 口径:
 * 1. **运行期唯一来源是 `DesktopConfig`**(`headerHeight` / `dockReserve`),
 *    由 `WindowManager._writeShellVars` 写到桌面根的行内变量上;
 * 2. `styles/tokens.css` 的 `:root` 与 `DEFAULT_THEME_TOKENS` 是"没有 JS /
 *    纯 CSS"场景的兜底值,必须与 `DEFAULT_DESKTOP_CONFIG` 同值.
 *
 * 这条靠注释守不住:改了一处忘了另一处,页面上的表现是窗口盖住任务栏(或
 * 任务栏下多一条缝),不会在别处报错.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DESKTOP_CONFIG } from '../desktop/types';
import { DEFAULT_THEME_TOKENS } from './tokens';

/** 读 `styles/tokens.css` 的 `:root` 里某个变量的值(注释已去掉). */
function readToken(name: string): string {
    const css = readFileSync(new URL('../../styles/tokens.css', import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    const match = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(css);
    if (!match) throw new Error(`styles/tokens.css 里找不到 ${name}`);
    return match[1].trim();
}

/** 两个尺寸在两份默认表里的配对. */
const SHELL_SIZES = [
    { token: '--window-header-height', config: () => `${DEFAULT_DESKTOP_CONFIG.headerHeight}px` },
    { token: '--dock-reserve', config: () => `${DEFAULT_DESKTOP_CONFIG.dockReserve}px` },
] as const;

describe('桌面外壳尺寸的单一来源', () => {
    for (const { token, config } of SHELL_SIZES) {
        it(`${token}:tokens.css 与 DEFAULT_THEME_TOKENS 同值`, () => {
            expect(readToken(token)).toBe(DEFAULT_THEME_TOKENS[token]);
        });

        it(`${token}:CSS 兜底值与 DEFAULT_DESKTOP_CONFIG 同值`, () => {
            expect(DEFAULT_THEME_TOKENS[token]).toBe(config());
        });
    }
});
