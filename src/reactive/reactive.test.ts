/**
 * 响应式层的语义测试(§8 P3 的验收项).
 *
 * 锁四件事:
 * 1. **同值不通知**(`Object.is` 短路)-- "不抖动"的来源,也是"写回同一个值
 *    不会打转"的保证;
 * 2. `effect` 的**卸载**:退订之后不再重跑,回调返回的清理函数在重跑/销毁前执行;
 * 3. `computed` 从依赖算出值,依赖没变不重算;
 * 4. **更新是同步的**(不排队、不等帧):`set()` 返回时订阅者已经跑完.
 *    这条是手写 DOM 桩还能用的前提(R2).
 *
 * 另外两条边界断言:
 * - 公开面里**没有** `batch`(约束 2):`import * as reactive` 之后按键检查;
 * - 库源码里一次都没调用 `batch(`:同一条约束的源码侧检查(CI 里由
 *   `scripts/check-ui-boundary.mjs` 的 `no-batch` 规则盯着,这里再本地守一遍).
 */
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

        // 订阅时立刻给一次当前值,之后每次变化再给.
        expect(seen).toEqual([1, 2, 3]);
        expect(count.value).toBe(4);
    });

    it('同值不通知(Object.is):写回同一个值不会打转', () => {
        const value = signal('a');
        const listener = vi.fn();
        value.subscribe(listener);

        value.value = 'a';

        // 只有订阅时那一次立刻回调;同值写入不再通知.
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith('a');
    });

    it('peek 读值但不建立依赖', () => {
        const source = signal(1);
        const doubled = signal(0);
        effect(() => {
            // 只 peek:这个 effect 不该因为 source 变化而重跑.
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

        // set() 返回时订阅者已经跑完(没有排队/微任务).
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

        setValue(source, 1); // 同值:不通知
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
        setValue(source, 2); // 同值:不通知
        stop();
        setValue(source, 3);

        expect(seen).toEqual([1, 2]);
        expect(peekValue(source)).toBe(3);
    });
});

describe('U7 的三条约束', () => {
    it('公开面里没有批处理入口(也不拿它做批处理)', () => {
        // 约束 2:更新路径不引调度器.转出 batch 就等于把它开放给消费者.
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
