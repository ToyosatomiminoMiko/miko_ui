/**
 * 只读数值显示件的单测.
 *
 * 这里锁三件事:
 * 1. **结构契约**:产出的类名 / ARIA 与 `styles/widgets.css` 是同一份契约;
 * 2. **两条文本**:可见文本走显示档(可以短),`title` 走全精度(必须一位不差);
 * 3. **一套口径喂多处**:同一个 `ValueText` 交给数字框,系数滑块与读数行,三处文本
 *    逐字符相同 -- 这是"数值/文本统一"这件事的核心契约,不是外观细节.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { installDomStub, StubElement } from '../testing/domStub';
import { signal } from '../reactive';
import { numberText, NUMBER_TEXT_DISPLAY, NUMBER_TEXT_EDIT } from '../shared/numberText';
import { createNumberField } from './NumberField';
import { createSlider } from './Slider';
import { createReadoutRow, createValueDisplay } from './ValueDisplay';

beforeEach(() => {
    installDomStub();
});

function stub(element: unknown): StubElement {
    return element as StubElement;
}

describe('createValueDisplay', () => {
    it('产出 <output class="ui-readout-value">,默认不播报', () => {
        const handle = createValueDisplay({ value: signal(1) });

        expect(handle.element.tagName).toBe('output');
        expect(handle.element.className).toBe('ui-readout-value');
        // HTML-AAM 把 <output> 映射成 role=status(隐式 live region);拖动时每帧都变,
        // 不关掉就是读屏轰炸.
        expect(handle.element.getAttribute('aria-live')).toBe('off');
        expect(handle.element.getAttribute('aria-atomic')).toBeNull();
    });

    it('announce 才交给 ARIA:polite + atomic', () => {
        const handle = createValueDisplay({ value: signal(1), announce: true });

        expect(handle.element.getAttribute('aria-live')).toBe('polite');
        expect(handle.element.getAttribute('aria-atomic')).toBe('true');
    });

    it('消费者类名追加在基线类之后(变体才能盖住基线)', () => {
        const handle = createValueDisplay({ value: signal(1), class: 'angle-value' });

        expect(handle.element.className).toBe('ui-readout-value angle-value');
    });

    it('forIds 落成 <output for="...">:关联产生这个值的控件', () => {
        const handle = createValueDisplay({ value: signal(1), forIds: ['ui-number-1', 'ui-range-2'] });

        expect(handle.element.getAttribute('for')).toBe('ui-number-1 ui-range-2');
        expect(createValueDisplay({ value: signal(1) }).element.getAttribute('for')).toBeNull();
    });

    /**
     * 显示文本短,title 给全精度:这一条替代"提高小数位直到看得出来"那种做法.
     * 两个消费者现在都没有这个出口(全库 `title=` 全精度计数为 0).
     */
    it('显示文本走显示档,title 给全精度', () => {
        const handle = createValueDisplay({ value: signal(0.1 + 0.2) });

        expect(handle.element.textContent).toBe('0.3');
        expect(handle.element.title).toBe('0.30000000000000004');
    });

    it('text 覆盖显示口径;exact 覆盖 title', () => {
        const handle = createValueDisplay({
            value: signal(0.6),
            text: numberText({ digits: 3, trimZeros: false }),
            exact: () => '精确值',
        });

        expect(handle.element.textContent).toBe('0.600');
        expect(handle.element.title).toBe('精确值');
    });

    /**
     * `render` 是"文本之后"的那一步:显示件把**显示文本**交出去,自己不认识任何
     * 排版器(库的 widgets 层因此不认识 formula 层).这是 LaTeX 读数在库里的唯一
     * 落点 -- 下游规定不许直接依赖 katex,所以公式必须在库里排.
     */
    it('render 出口:显示文本交给调用方排版(LaTeX 路径)', () => {
        const seen: string[] = [];
        const handle = createValueDisplay({
            value: signal(1.25e20),
            text: numberText({ syntax: 'latex' }),
            render: (visible) => {
                seen.push(visible);
                const node = document.createElement('span');
                node.textContent = `公式:${visible}`;
                return node;
            },
        });

        expect(seen).toEqual(['1.25\\times10^{20}']);
        expect(handle.element.textContent).toBe('公式:1.25\\times10^{20}');
    });

    it('render 出口每次换掉整格内容,不追加', () => {
        const value = signal(1);
        const handle = createValueDisplay({
            value,
            render: (visible) => {
                const node = document.createElement('span');
                node.textContent = visible;
                return node;
            },
        });

        value.value = 2;
        value.value = 3;

        expect(stub(handle.element).children.length).toBe(1);
        expect(handle.element.textContent).toBe('3');
    });

    it('空值仍然走占位纯文本,不经过 render', () => {
        let calls = 0;
        const value = signal<number | null>(null);
        const handle = createValueDisplay({
            value,
            placeholder: '未测',
            render: (visible) => {
                calls += 1;
                const node = document.createElement('span');
                node.textContent = `渲染:${visible}`;
                return node;
            },
        });

        expect(handle.element.textContent).toBe('未测');
        expect(calls).toBe(0);

        value.value = 1;
        expect(calls).toBe(1);
        expect(handle.element.textContent).toBe('渲染:1');
    });

    it('非数值按 String();传进来的 text 优先', () => {
        expect(createValueDisplay({ value: signal('未选') }).element.textContent).toBe('未选');
        expect(
            createValueDisplay({ value: signal('未选'), text: { toText: () => '-' } }).element.textContent,
        ).toBe('-');
    });

    it('空值给占位文案,并且不留上一个值的 title', () => {
        const value = signal<number | null>(1.5);
        const handle = createValueDisplay({ value, placeholder: '未测' });
        expect(handle.element.textContent).toBe('1.5');

        value.value = null;
        expect(handle.element.textContent).toBe('未测');
        expect(handle.element.title).toBe('');

        expect(createValueDisplay({ value: signal(null) }).element.textContent).toBe('-');
    });

    it('signal 驱动文本;set() 只改显示不写回值源;dispose 后不再响应', () => {
        const value = signal(1);
        const handle = createValueDisplay({ value });

        value.value = 2;
        expect(handle.element.textContent).toBe('2');

        handle.set(3);
        expect(handle.element.textContent).toBe('3');
        expect(value.peek()).toBe(2);

        handle.dispose();
        value.value = 4;
        expect(handle.element.textContent).toBe('3');
    });
});

describe('createReadoutRow', () => {
    it('复用 .control-row,名字与值各占一半', () => {
        const { row, name, value } = createReadoutRow('方位角', { value: signal(0.6) });

        expect(row.tagName).toBe('div');
        expect(row.className).toBe('control-row');
        expect(name.tagName).toBe('span');
        expect(name.className).toBe('ui-readout-name');
        expect(name.textContent).toBe('方位角');
        expect(value.element.className).toBe('ui-readout-value');
        expect(stub(row).children).toEqual([name, value.element]);
    });

    it('名字节点返回给需要改文案的调用方', () => {
        const { name } = createReadoutRow('缩放', { value: signal(1) });

        name.textContent = '大小';
        expect(name.textContent).toBe('大小');
    });
});

/**
 * 这次"数值/文本统一"的核心契约:同一个口径对象喂多处,文本逐字符相同.
 * 单独拎出来测,因为它不是某个控件的行为,而是三个控件之间的**跨件**约定.
 */
describe('一套口径喂多处', () => {
    const BASE = { min: 0, max: 1, step: 0.01, label: 'a' } as const;

    it('数字框 / 系数滑块的数值框 / 读数行三处逐字符相同', () => {
        const value = signal(0.1 + 0.2);
        const text = NUMBER_TEXT_EDIT;
        const field = createNumberField({ value, text });
        const slider = createSlider({ ...BASE, value, text });
        const readout = createValueDisplay({ value, text });

        const expected = text.toText(0.1 + 0.2);
        expect(field.readText()).toBe(expected);
        expect(slider.number.readText()).toBe(expected);
        expect(readout.element.textContent).toBe(expected);
    });

    it('换成显示档时三处仍然一致(读数与框由同一个对象决定,不会各自漂移)', () => {
        const value = signal(1.25);
        const text = numberText({ syntax: 'edit', digits: 4, trimZeros: false });
        const field = createNumberField({ value, text });
        const readout = createValueDisplay({ value, text });

        expect(field.readText()).toBe('1.2500');
        expect(readout.element.textContent).toBe(field.readText());
    });

    it('给同一份值,显示档与编辑档是两个明确的档位,不是一个含糊的默认', () => {
        const value = 0.1 + 0.2;
        expect(NUMBER_TEXT_EDIT.toText(value)).toBe('0.30000000000000004');
        expect(NUMBER_TEXT_DISPLAY.toText(value)).toBe('0.3');
    });
});
