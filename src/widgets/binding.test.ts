/**
 * 控件与 signal 的绑定测试(P3 的增量路径).
 *
 * `value: T | Signal<T>` 这条联合是 P3 落地的关键:传普通值 = 今天的行为
 * (上面 `widgets.test.ts` 覆盖),传 signal 才订阅.这里锁的是 signal 一侧:
 *
 * 1. **signal → DOM**:写 signal,控件自己更新,调用方不需要 `set()`;
 * 2. **DOM → signal**:用户操作写回 signal(`onChange` 之外多出来的那条线);
 * 3. **不打架**:用户输入的中途文本不会被镜像更新格式化掉(数字框的 `1.`);
 * 4. **dispose 解绑**:销毁之后写 signal 不再碰 DOM(没有泄漏的回调).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { installDomStub, StubElement } from '../../test/domStub';
import { signal } from '../reactive';
import { createNumberField } from './NumberField';
import { createSegmented } from './Segmented';
import { createSlider } from './Slider';
import { createSwitch } from './Switch';

beforeEach(() => {
    installDomStub();
});

function stub(element: unknown): StubElement {
    return element as StubElement;
}

describe('Switch', () => {
    it('signal → DOM:写值源就更新勾选态', () => {
        const visible = signal(false);
        const handle = createSwitch({ value: visible });

        visible.value = true;

        expect(handle.get()).toBe(true);
        expect(stub(handle.input).checked).toBe(true);
    });

    it('DOM → signal:用户切换写回值源', () => {
        const visible = signal(false);
        const handle = createSwitch({ value: visible });

        stub(handle.input).checked = true;
        stub(handle.input).dispatch('change');

        expect(visible.peek()).toBe(true);
    });

    it('dispose 之后写值源不再碰 DOM', () => {
        const visible = signal(false);
        const handle = createSwitch({ value: visible });

        handle.dispose();
        visible.value = true;

        expect(stub(handle.input).checked).toBe(false);
    });
});

describe('Slider', () => {
    it('signal → DOM 与 DOM → signal 双向成立', () => {
        const value = signal(0.5);
        const handle = createSlider({
            value,
            min: 0,
            max: 1,
            step: 0.1,
        });

        value.value = 0.8;
        expect(handle.get()).toBe(0.8);

        stub(handle.input).value = '0.3';
        stub(handle.input).dispatch('input');

        expect(value.peek()).toBe(0.3);
    });
});

describe('NumberField', () => {
    it('signal → DOM:写值源按 format 落到文本', () => {
        const radius = signal(0.2);
        const handle = createNumberField({
            value: radius,
            format: (value) => value.toFixed(2),
        });

        radius.value = 1.5;

        expect(handle.readText()).toBe('1.50');
    });

    it('用户输入的中途文本不会被镜像更新改写(1. 要能打出来)', () => {
        const value = signal(1);
        const handle = createNumberField({ value });
        const input = stub(handle.input);

        // 用户正在输入 "1.":解析出 1(中途态),写回值源时值没变(同值不通知);
        // 就算值变了,那一次也会被识别成"控件自己写的"而跳过文本改写.
        input.value = '1.';
        input.dispatch('input');

        expect(input.value).toBe('1.');
        expect(value.peek()).toBe(1);
    });

    it('DOM → signal:输入解析成功就写回', () => {
        const value = signal(1);
        const handle = createNumberField({ value });

        stub(handle.input).value = '42';
        stub(handle.input).dispatch('input');

        expect(value.peek()).toBe(42);
    });

    it('dispose 之后写值源不再碰文本', () => {
        const value = signal(1);
        const handle = createNumberField({ value });

        handle.dispose();
        value.value = 9;

        expect(handle.readText()).toBe('1');
    });
});

describe('Segmented', () => {
    it('signal → DOM:写值源切高亮;DOM → signal:点击写回', () => {
        const mode = signal<'size' | 'scale'>('size');
        const handle = createSegmented<'size' | 'scale'>({
            columns: 2,
            ariaLabel: '模式',
            value: mode,
            items: [
                { value: 'size', label: '大小' },
                { value: 'scale', label: '比例' },
            ],
        });
        const buttons = stub(handle.element).children as StubElement[];

        expect(buttons[0].classList.contains('active')).toBe(true);

        mode.value = 'scale';
        expect(buttons[1].classList.contains('active')).toBe(true);
        expect(handle.get()).toBe('scale');

        buttons[0].dispatch('click');
        expect(mode.peek()).toBe('size');
    });
});
