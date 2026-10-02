import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import * as reactive from './index';
import {
    computed,
    effect,
    isSignal,
    onValueChange,
    peekValue,
    setValue,
    signal,
    watchValue,
} from './index';

describe('signal', () => {
    it('写值通知订阅者,返回值是退订函数', () => {
        const count = signal(1);
        const seen: number[] = [];
        const stop = count.subscribe((value) => seen.push(value));

        count.value = 2;
        count.value = 3;
        stop();
        count.value = 4;

        expect(seen).toEqual([1, 2, 3]);
        expect(count.value).toBe(4);
    });

    it('同值不通知(Object.is):写回同一个值不会打转', () => {
        const value = signal('a');
        const listener = vi.fn();
        value.subscribe(listener);

        value.value = 'a';

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith('a');
    });

    it('peek 读值但不建立依赖', () => {
        const source = signal(1);
        const doubled = signal(0);
        effect(() => {
            doubled.value = source.peek() * 2;
        });

        source.value = 5;

        expect(doubled.value).toBe(2);
    });
});

describe('computed', () => {
    it('从依赖算出值,依赖变化后重算', () => {
        const radius = signal(2);
        const area = computed(() => Math.PI * radius.value ** 2);

        expect(area.value).toBeCloseTo(Math.PI * 4);

        radius.value = 3;

        expect(area.value).toBeCloseTo(Math.PI * 9);
    });
});

describe('effect', () => {
    it('立刻同步跑一次;依赖变化后同步重跑', () => {
        const value = signal(1);
        const seen: number[] = [];

        effect(() => seen.push(value.value));
        value.value = 2;

        expect(seen).toEqual([1, 2]);
    });

    it('退订之后不再重跑', () => {
        const value = signal(1);
        const listener = vi.fn();

        const stop = effect(() => {
            listener(value.value);
        });
        expect(listener).toHaveBeenCalledTimes(1);

        stop();
        value.value = 2;

        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('回调返回的清理函数在重跑前与销毁时执行(上游语义)', () => {
        const value = signal(1);
        const cleaned: number[] = [];

        const stop = effect(() => {
            const current = value.value;
            return () => cleaned.push(current);
        });

        value.value = 2;
        stop();

        expect(cleaned).toEqual([1, 2]);
    });
});

describe('值源工具(ValueSource)', () => {
    it('isSignal 认品牌位,不认形状', () => {
        expect(isSignal(signal(1))).toBe(true);
        expect(isSignal(computed(() => 1))).toBe(true);
        expect(isSignal(1)).toBe(false);
        // 长得像但不是我们发出来的:不算.
        expect(isSignal({ value: 1, peek: () => 1 })).toBe(false);
    });

    it('普通值:peekValue 原样,watchValue 立刻回调一次且不可写', () => {
        const seen: number[] = [];
        const stop = watchValue(7, (value) => seen.push(value));

        expect(peekValue(7)).toBe(7);
        expect(seen).toEqual([7]);
        expect(() => setValue(7, 8)).not.toThrow();
        stop();
        expect(seen).toEqual([7]);
    });

    it('onValueChange 跳过订阅时那一次,只报之后的变化', () => {
        const source = signal(1);
        const seen: number[] = [];
        const stop = onValueChange(source, (value) => seen.push(value));

        setValue(source, 1);
        setValue(source, 2);
        stop();
        setValue(source, 3);

        expect(seen).toEqual([2]);
    });

    it('signal:watchValue 给初值并在变化时回调,setValue 写回', () => {
        const source = signal(1);
        const seen: number[] = [];
        const stop = watchValue(source, (value) => seen.push(value));

        setValue(source, 2);
        setValue(source, 2);
        stop();
        setValue(source, 3);

        expect(seen).toEqual([1, 2]);
        expect(peekValue(source)).toBe(3);
    });
});

describe('U7 的三条约束', () => {
    it('公开面里没有批处理入口(也不拿它做批处理)', () => {
        // 更新路径不引调度器:转出 batch 就等于把它开放给消费者.
        expect('batch' in reactive).toBe(false);
        expect(Object.keys(reactive).sort()).not.toContain('batch');
    });

    it('库源码里一次都没有调用批处理入口', () => {
        const root = fileURLToPath(new URL('..', import.meta.url));
        const offenders: string[] = [];
        const walk = (dir: string): void => {
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
                const full = join(dir, entry.name);
                if (entry.isDirectory()) {
                    walk(full);
                    continue;
                }
                if (!entry.name.endsWith('.ts')) continue;
                const code = readFileSync(full, 'utf8')
                    .split('\n')
                    .filter((line) => {
                        const text = line.trim();
                        return !text.startsWith('//')
                            && !text.startsWith('*')
                            && !text.startsWith('/*')
                            && !text.startsWith('*/');
                    })
                    .join('\n');
                if (/\bbatch\s*\(/.test(code)) offenders.push(full);
            }
        };
        walk(root);

        expect(offenders, '批处理入口只允许出现在注释里').toEqual([]);
    });
});
