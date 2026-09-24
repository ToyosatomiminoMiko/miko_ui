/**
 * 公式复制控制器单测.
 *
 * 复制必须有键盘入口:可复制公式由 FormulaView 加了 `tabindex`/`role`,
 * 本控制器提供 `keyboardBinding()` 供 KeyboardController 分发,自己只绑 click.
 * 这里覆盖:binding 的键名与目标放行规则,click 委托,成功/失败两条回显路径.
 * `preventDefault` 归 KeyboardController 管,所以断言在 KeyboardController.test.ts.
 *
 * 剪贴板只有异步通道:桩默认安全上下文 + 可写成功的 `navigator.clipboard`;
 * 失败路径改 `stub.clipboard.fail`,没有剪贴板 API 的情形删 `navigator.clipboard`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomStub, type DomStub, type StubElement } from '../../test/domStub';
import { FormulaCopyController } from './FormulaCopyController';

interface Harness {
    readonly stub: DomStub;
    readonly controller: FormulaCopyController;
    readonly hint: StubElement;
    readonly root: StubElement;
    readonly formula: StubElement;
}

function setup(): Harness {
    const stub = installDomStub();
    const hint = stub.document.createElement('span');
    hint.textContent = '点击公式复制 TeX';

    const root = stub.document.createElement('div');
    const formula = stub.document.createElement('span');
    formula.setAttribute('data-tex', 'x^2');
    root.append(formula);
    stub.document.body.append(root);

    const controller = new FormulaCopyController(hint as unknown as HTMLElement);
    controller.bind(root as unknown as HTMLElement);
    return { stub, controller, hint, root, formula };
}

beforeEach(() => {
    installDomStub();
});

describe('鼠标与键盘两条复制入口(UI-P3.6)', () => {
    it('点击公式复制 TeX 并回显成功', async () => {
        const { stub, controller, hint, root, formula } = setup();

        // 事件委托:监听在 root 上,目标是公式(桩不冒泡,显式带上 target).
        root.dispatch('click', { target: formula });

        await vi.waitFor(() => {
            expect(stub.clipboard.texts).toEqual(['x^2']);
            expect(hint.textContent).toBe('已复制 TeX');
        });
        expect(hint.classList.contains('is-copied')).toBe(true);
        controller.dispose();
    });

    it('Enter 命中可复制公式时返回处理器并复制', async () => {
        const { stub, controller, hint, formula } = setup();

        // 键盘监听已上收到 KeyboardController;这里只验证本控制器给出的规则.
        const run = controller.keyboardBinding()
            .resolve({ target: formula } as unknown as KeyboardEvent);

        expect(run).not.toBeNull();
        run?.();
        await vi.waitFor(() => {
            expect(stub.clipboard.texts).toEqual(['x^2']);
            expect(hint.textContent).toBe('已复制 TeX');
        });
        controller.dispose();
    });

    it('Space 同样命中(默认键名与遗留 Spacebar 都声明)', () => {
        const { controller } = setup();

        expect(controller.keyboardBinding().keys).toEqual(['Enter', ' ', 'Spacebar']);
        expect(controller.keyboardBinding().resolve({ target: null } as unknown as KeyboardEvent))
            .toBeNull();
        controller.dispose();
    });

    it('目标不是可复制公式时放行(resolve 返回 null)', () => {
        const { controller, root } = setup();

        expect(controller.keyboardBinding()
            .resolve({ target: root } as unknown as KeyboardEvent)).toBeNull();
        controller.dispose();
    });

    it('点在没有 data-tex 的元素上不触发复制', () => {
        const { stub, controller, root } = setup();

        root.dispatch('click', { target: root });

        expect(stub.clipboard.texts).toEqual([]);
        controller.dispose();
    });

    it('复制失败时回显错误态', async () => {
        const { stub, controller, hint, root, formula } = setup();
        stub.clipboard.fail = true;

        root.dispatch('click', { target: formula });

        await vi.waitFor(() => {
            expect(hint.textContent).toBe('复制失败');
        });
        expect(hint.classList.contains('is-error')).toBe(true);
        controller.dispose();
    });

    it('非安全上下文没有异步剪贴板时归一化成失败,异常不冒泡', async () => {
        const { controller, hint, root, formula } = setup();
        // 真实浏览器里非安全上下文就是这个形态:`navigator.clipboard` 根本不存在.
        delete (navigator as unknown as Record<string, unknown>).clipboard;

        root.dispatch('click', { target: formula });

        await vi.waitFor(() => {
            expect(hint.textContent).toBe('复制失败');
        });
        controller.dispose();
    });
});

describe('dispose 复位提示', () => {
    it('dispose 后提示回到原文案且清掉状态类', async () => {
        const { controller, hint, root, formula } = setup();

        root.dispatch('click', { target: formula });
        await vi.waitFor(() => {
            expect(hint.textContent).toBe('已复制 TeX');
        });

        controller.dispose();

        expect(hint.textContent).toBe('点击公式复制 TeX');
        expect(hint.classList.contains('is-copied')).toBe(false);
        expect(hint.classList.contains('is-error')).toBe(false);
    });
});

describe('一组提示节点(列表被拆成多个窗口时,每处标题栏各有一句提示)', () => {
    /** 两个提示节点:代表"实体"与"求值"两个窗口标题栏上的那一句. */
    function setupPair(): {
        stub: DomStub;
        controller: FormulaCopyController;
        first: StubElement;
        second: StubElement;
        root: StubElement;
        formula: StubElement;
    } {
        const stub = installDomStub();
        const first = stub.document.createElement('span');
        first.textContent = '点击公式复制 TeX';
        const second = stub.document.createElement('span');
        second.textContent = '点击公式复制 TeX';

        const root = stub.document.createElement('div');
        const formula = stub.document.createElement('span');
        formula.setAttribute('data-tex', 'y = x');
        root.append(formula);
        stub.document.body.append(root);

        const controller = new FormulaCopyController(
            [first, second] as unknown as HTMLElement[],
        );
        controller.bind(root as unknown as HTMLElement);
        return { stub, controller, first, second, root, formula };
    }

    it('两个节点一起回显成功', async () => {
        const { stub, controller, first, second, root, formula } = setupPair();

        root.dispatch('click', { target: formula });

        await vi.waitFor(() => {
            expect(stub.clipboard.texts).toEqual(['y = x']);
            expect(first.textContent).toBe('已复制 TeX');
            expect(second.textContent).toBe('已复制 TeX');
        });
        // 状态类也要两个都有:只更新一半的话,另一处标题栏会显示旧文案.
        expect(first.classList.contains('is-copied')).toBe(true);
        expect(second.classList.contains('is-copied')).toBe(true);
        controller.dispose();
    });

    it('失败态同样写两个节点', async () => {
        const { stub, controller, first, second, root, formula } = setupPair();
        stub.clipboard.fail = true;

        root.dispatch('click', { target: formula });

        await vi.waitFor(() => {
            expect(first.textContent).toBe('复制失败');
            expect(second.textContent).toBe('复制失败');
        });
        expect(second.classList.contains('is-error')).toBe(true);
        controller.dispose();
    });

    it('dispose 把两个节点都复位', async () => {
        const { controller, first, second, root, formula } = setupPair();

        root.dispatch('click', { target: formula });
        await vi.waitFor(() => {
            expect(first.textContent).toBe('已复制 TeX');
        });

        controller.dispose();

        for (const node of [first, second]) {
            expect(node.textContent).toBe('点击公式复制 TeX');
            expect(node.classList.contains('is-copied')).toBe(false);
            expect(node.classList.contains('is-error')).toBe(false);
        }
    });
});
