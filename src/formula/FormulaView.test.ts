import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomStub } from '../testing/domStub';

vi.mock('katex', () => ({
    default: {
        render: (tex: string, element: { textContent: string }) => {
            element.textContent = tex;
        },
    },
}));
vi.mock('katex/dist/katex.min.css', () => ({}));

import { createFormulaElement } from './FormulaView';

beforeEach(() => {
    installDomStub();
});

describe('createFormulaElement', () => {
    it('可复制公式:带 data-tex 与键盘/角色语义', () => {
        const element = createFormulaElement('x^2', 'object-expr');

        expect(element.className).toBe('object-expr');
        expect(element.dataset.tex).toBe('x^2');
        expect(element.tabIndex).toBe(0);
        expect(element.getAttribute('role')).toBe('button');
        expect(element.getAttribute('aria-label')).toBe('复制公式 TeX');
        expect(element.textContent).toBe('x^2');
    });

    it('不可复制公式:不带任何复制/焦点属性', () => {
        const element = createFormulaElement('x^2', 'eval-summary-formula', false);

        expect(element.dataset.tex).toBeUndefined();
        expect(element.tabIndex).toBe(-1);
        expect(element.getAttribute('role')).toBeNull();
        expect(element.getAttribute('aria-label')).toBeNull();
    });

    it('同一串公式渲染两次都有内容(模板 clone,不搬空缓存)', () => {
        const first = createFormulaElement('y=1');
        const second = createFormulaElement('y=1');

        expect(first.textContent).toBe('y=1');
        expect(second.textContent).toBe('y=1');
        expect(first).not.toBe(second);
    });
});
