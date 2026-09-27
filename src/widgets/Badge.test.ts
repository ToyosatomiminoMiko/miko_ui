/**
 * 徽章件单测.
 *
 * 锁三件事:结构(span + 文案),类名组合(基线在前,消费者变体类在后),以及
 * "没有变体类时不留下尾随空格".
 *
 * 没有交互与 dispose 可测:徽章是静态件(见 `Badge.ts` 的文件头).至于"基线
 * 真的在样式表里"这一条,由 `test/emittedClasses.test.ts` 的类名契约守着,
 * 不在本文件重复.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { installDomStub, type StubElement } from '../testing/domStub';
import { createBadge } from './Badge';

beforeEach(() => {
    installDomStub();
});

describe('createBadge', () => {
    it('建 span,文案进 textContent,基线类在前', () => {
        const badge = createBadge('曲线') as unknown as StubElement;

        expect(badge.tagName).toBe('span');
        expect(badge.className).toBe('ui-badge');
        expect(badge.textContent).toBe('曲线');
    });

    it('消费者变体类叠在基线后面(顺序即层叠意图)', () => {
        const badge = createBadge('积分', { class: 'kind-analysis' }) as unknown as StubElement;

        expect(badge.className).toBe('ui-badge kind-analysis');
    });

    it('不给变体类时不产生尾随空格', () => {
        const badge = createBadge('区域', {}) as unknown as StubElement;

        expect(badge.className).toBe('ui-badge');
    });
});
