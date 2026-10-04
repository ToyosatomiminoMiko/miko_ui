/**
 * 公式件的单测.
 *
 * 这里**不 mock `katex`**:渲染器是可注入出口,而 `installDomStub()` 会自动装上
 * `TEXT_FORMULA_RENDERER`(把 LaTeX 原样写进元素).这条路径本身就是被测契约 --
 * 下游规定不许直接依赖 katex,所以"测试里怎么假渲染"必须由库给出,不能靠
 * `vi.mock('katex')`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installDomStub } from '../testing/domStub';
import {
    createFormulaElement,
    setFormulaRenderer,
    TEXT_FORMULA_RENDERER,
} from './FormulaView';

beforeEach(() => {
    installDomStub();
});

// 渲染器是模块级状态:用例自己改过就自己还原,别让下一个用例(或下一个文件)
// 悄悄继承一个替身.
afterEach(() => {
    setFormulaRenderer(null);
});

describe('createFormulaElement', () => {
    it('可复制公式:带 data-tex 与键盘/角色语义,基线类在消费者类之前', () => {
        const element = createFormulaElement('x^2', 'object-expr');

        // 基线类必须在前面:消费者的类要靠"在后面"才盖得住库的默认规则.
        expect(element.className).toBe('ui-formula object-expr');
        expect(element.dataset.tex).toBe('x^2');
        expect(element.tabIndex).toBe(0);
        expect(element.getAttribute('role')).toBe('button');
        expect(element.getAttribute('aria-label')).toBe('复制公式 TeX');
        expect(element.textContent).toBe('x^2');
    });

    it('不给消费者类也带基线类(令牌 `--katex-font-size` 靠它才选得到)', () => {
        expect(createFormulaElement('x^2').className).toBe('ui-formula');
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

describe('setFormulaRenderer', () => {
    it('替身渲染器收到 (latex, element)', () => {
        const calls: string[] = [];
        setFormulaRenderer((latex, element) => {
            calls.push(latex);
            element.textContent = 'ok';
        });

        expect(createFormulaElement('a+b').textContent).toBe('ok');
        expect(calls).toEqual(['a+b']);
    });

    it('换渲染器时模板缓存整体失效(旧产物不带进新会话)', () => {
        setFormulaRenderer((latex, element) => {
            element.textContent = `甲:${latex}`;
        });
        expect(createFormulaElement('z').textContent).toBe('甲:z');

        // 缓存键只认 LaTeX:这里若没清空,'z' 会命中上一条渲染器的模板.
        setFormulaRenderer((latex, element) => {
            element.textContent = `乙:${latex}`;
        });
        expect(createFormulaElement('z').textContent).toBe('乙:z');
    });

    it('传 null 还原默认渲染器:桩环境里真 KaTeX 排不了(没有 createElementNS)', () => {
        setFormulaRenderer(TEXT_FORMULA_RENDERER);
        expect(createFormulaElement('q').textContent).toBe('q');

        setFormulaRenderer(null);
        // 换回真 KaTeX 后同一串 LaTeX 走排版路径.手写 DOM 桩只实现库与消费者
        // 真正用到的 API,而真 KaTeX 要 `createElementNS` -- 所以这里会抛.
        // 断言 message 而不是只断言 TypeError:后者在"默认渲染器整个坏掉"
        // (`katex.render` 不是函数,katex 导入成 undefined)时也会通过,那条红线
        // 就白设了.
        expect(() => createFormulaElement('q')).toThrow(/createElementNS/);
    });

    it("installDomStub({ formula: 'keep' }) 不覆盖已装的渲染器", () => {
        setFormulaRenderer((_latex, element) => {
            element.textContent = '保留';
        });
        // 装桩在前/在后都不该把它换掉:"换渲染器"与"装桩"没有顺序契约.
        installDomStub({ formula: 'keep' });

        expect(createFormulaElement('k').textContent).toBe('保留');
    });
});

describe('TEXT_FORMULA_RENDERER', () => {
    it('把 LaTeX 原样写进元素(installDomStub 装的就是它)', () => {
        const element = createFormulaElement('\\times10^{6}');

        expect(element.textContent).toBe('\\times10^{6}');
    });
});
