/**
 * 桌面外壳两个尺寸的**单一来源**契约.
 *
 * `--window-header-height` 与 `--dock-reserve` 是同一份数被 JS 与 CSS 各消费一次:
 * 运行期唯一来源是 `DesktopConfig`(`WindowManager._writeShellVars` 把它写到桌面
 * 根的行内变量),`styles/tokens.css` 的 `:root` 只是"没有 JS / 纯 CSS"时的兜底值,
 * 必须与 `DEFAULT_DESKTOP_CONFIG` 同值.
 *
 * 改一处忘了另一处不会报错:表现是窗口盖住任务栏,或任务栏下多一条缝.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DESKTOP_CONFIG } from '../desktop/types';

/** 读 `styles/tokens.css` 的 `:root` 里某个变量的值(注释已去掉). */
function readToken(name: string): string {
    const css = readFileSync(new URL('../../styles/tokens.css', import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    const match = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(css);
    if (!match) throw new Error(`styles/tokens.css 里找不到 ${name}`);
    return match[1].trim();
}

/** 两个尺寸的 token 名与它在配置里的同源字段. */
const SHELL_SIZES = [
    { token: '--window-header-height', config: () => `${DEFAULT_DESKTOP_CONFIG.headerHeight}px` },
    { token: '--dock-reserve', config: () => `${DEFAULT_DESKTOP_CONFIG.dockReserve}px` },
] as const;

describe('桌面外壳尺寸的单一来源', () => {
    for (const { token, config } of SHELL_SIZES) {
        it(`${token}:tokens.css 的 CSS 兜底值与 DEFAULT_DESKTOP_CONFIG 同值`, () => {
            expect(readToken(token)).toBe(config());
        });
    }
});
