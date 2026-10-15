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
    it('可复制公式:只挂 data-tex,基线类在消费者类之前', () => {
        const element = createFormulaElement('x^2', 'object-expr');

        // 基线类必须在前面:消费者的类要靠"在后面"才盖得住库的默认规则.
        expect(element.className).toBe('ui-formula object-expr');
        expect(element.dataset.tex).toBe('x^2');
        // 复制只有鼠标一条入口:不挂任何"假按钮"语义(见 FormulaView 的文件头).
        expect(element.tabIndex).toBe(-1);
        expect(element.getAttribute('role')).toBeNull();
        expect(element.getAttribute('aria-label')).toBeNull();
        expect(element.textContent).toBe('x^2');
    });

    it('不给消费者类也带基线类(令牌 `--katex-font-size` 靠它才选得到)', () => {
        expect(createFormulaElement('x^2').className).toBe('ui-formula');
    });

    it('不可复制公式:不带复制钩子', () => {
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

    it('传 null 还原默认渲染器:真的走 KaTeX 排版,不是文本替身', () => {
        setFormulaRenderer(TEXT_FORMULA_RENDERER);
        expect(createFormulaElement('q').textContent).toBe('q');

        setFormulaRenderer(null);
        // 换回真 KaTeX.桩现在给得出 `createElementNS`(见 domStub 的说明),所以
        // 这里**能正面断言**:真 KaTeX 排出来的结构就是 `.katex` 包
        // `.katex-mathml` + `.katex-html`.
        //
        // 原先这条断言是"桩没有 createElementNS,所以这里会抛",理由是"能抛就说明
        // 它真的去调 KaTeX 了".那个理由随着桩补上命名空间而失效(再不抛了),
        // 而且它本来就是**反向**的:任何一处与 KaTeX 无关的桩缺口都能让它变绿.
        // 现在改成直接看 KaTeX 的产物 -- 默认渲染器整个坏掉(如 katex 导入成
        // undefined)时,这两条会立刻红,红线比原来更紧.
        const rendered = createFormulaElement('q');
        expect(rendered.querySelector('.katex')).not.toBeNull();
        expect(rendered.querySelector('.katex-mathml')).not.toBeNull();
        expect(rendered.querySelector('.katex-html')).not.toBeNull();
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
