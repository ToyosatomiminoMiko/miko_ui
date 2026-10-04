/**
 * 带键行列表引擎单测.
 *
 * 引擎是对象列表 / 求值列表 / 过程步骤 / 消息列表共用的那一份,所以它的三条不变量
 * 在这里直接钉住,而不是只靠各消费者的行为测试间接覆盖:
 * 1. 标识与内容键都没变 -> 整行复用(节点身份不变,build 不再跑);
 * 2. 内容键变了 / 首次出现 -> 重建,同名旧行在 build 返回后摘除;
 * 3. 消失的条目删行并回调 `onRemove`,留下的行按输入数组顺序落位.
 *
 * 另加两条容器契约:默认声明 `role="list"`,`listRole: false` 时不声明(消息区
 * 这种 `aria-live` 容器用得上,见 `RowListOptions`).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { installDomStub, type StubElement } from '../testing/domStub';
import { RowList, type RowListOptions } from './rowList';

interface Item {
    readonly id: string;
    readonly text: string;
}

interface Handles {
    readonly row: HTMLElement;
}

function setup(options: RowListOptions = {}) {
    const stub = installDomStub();
    const container = stub.document.createElement('div');
    stub.document.body.append(container);
    const list = new RowList<Item, Handles>(container as unknown as HTMLElement, options);
    return {
        container: container as unknown as StubElement,
        list,
        node: (): Handles => ({
            // 桩节点与真 DOM 同形,收窄成 HTMLElement 供引擎使用.
            row: stub.document.createElement('p') as unknown as HTMLElement,
        }),
        /** 每次 build 记一笔,用来断言"复用时不重建". */
        built: [] as string[],
    };
}

/** 建行时把文本写进节点,便于按内容断言. */
function buildRow(node: () => Handles, item: Item): Handles {
    const handles = node();
    handles.row.textContent = item.text;
    return handles;
}

describe('RowList 的容器契约', () => {
    it('默认给容器加 role=list(行即列表项)', () => {
        const { container } = setup();
        expect(container.getAttribute('role')).toBe('list');
    });

    it('listRole: false 时不加 role(消息区的条目不是 listitem)', () => {
        const { container } = setup({ listRole: false });
        expect(container.getAttribute('role')).toBeNull();
    });
});

describe('RowList 的复用与顺序', () => {
    let ctx: ReturnType<typeof setup>;

    beforeEach(() => {
        ctx = setup();
    });

    /** 跑一次 sync,并按对象 id 记录建行次数. */
    function sync(items: readonly Item[], onRemove?: (name: string) => void): void {
        ctx.list.sync(items, {
            name: (item) => item.id,
            key: (item) => `${item.id}|${item.text}`,
            build: (item) => {
                ctx.built.push(item.id);
                return buildRow(ctx.node, item);
            },
            onRemove,
        });
    }

    it('标识与内容键都没变时整行复用,不重新建行', () => {
        sync([{ id: 'a', text: '1' }]);
        const [first] = ctx.container.children;

        sync([{ id: 'a', text: '1' }]);

        expect(ctx.built).toEqual(['a']);
        expect(ctx.container.children).toHaveLength(1);
        expect(ctx.container.children[0]).toBe(first);
    });

    it('内容键变了就重建,并摘掉同名旧行', () => {
        sync([{ id: 'a', text: '1' }]);
        const [first] = ctx.container.children;

        sync([{ id: 'a', text: '2' }]);

        expect(ctx.built).toEqual(['a', 'a']);
        expect(ctx.container.children).toHaveLength(1);
        expect(ctx.container.children[0]).not.toBe(first);
        expect((ctx.container.children[0] as StubElement).textContent).toBe('2');
    });

    it('消失的条目删行并回调 onRemove,留下的行原地不动', () => {
        sync([{ id: 'a', text: '1' }, { id: 'b', text: '2' }]);
        const [first, second] = ctx.container.children;
        const removed: string[] = [];

        sync([{ id: 'a', text: '1' }], (name) => removed.push(name));

        expect(removed).toEqual(['b']);
        expect(ctx.container.children).toHaveLength(1);
        expect(ctx.container.children[0]).toBe(first);
        expect(ctx.container.children).not.toContain(second);
    });

    it('缓存命中的行也按输入数组顺序落位', () => {
        sync([{ id: 'a', text: '1' }, { id: 'b', text: '2' }]);
        const [first, second] = ctx.container.children;

        sync([{ id: 'b', text: '2' }, { id: 'a', text: '1' }]);

        expect(ctx.built).toEqual(['a', 'b']);
        expect(ctx.container.children[0]).toBe(second);
        expect(ctx.container.children[1]).toBe(first);
    });

    it('entry 拿得到当前行,clear 清空容器与缓存', () => {
        sync([{ id: 'a', text: '1' }]);

        expect(ctx.list.entry('a')?.handles.row).toBe(ctx.container.children[0]);

        ctx.list.clear();

        expect(ctx.container.children).toHaveLength(0);
        expect(ctx.list.entry('a')).toBeUndefined();

        // 清空后同名条目是"首次出现",必须重建(缓存不能留下已摘除的行).
        sync([{ id: 'a', text: '1' }]);
        expect(ctx.built).toEqual(['a', 'a']);
        expect(ctx.container.children).toHaveLength(1);
    });
});
