/**
 * 带键 DOM 行列表:按"标识 + 内容键"缓存行元素的通用机制.
 *
 * 三条与类型无关的不变量只有这一处实现:
 * 1. `name` 命中且内容键(`key`)相同 -> 整行复用:行内已建内容不重建,用户展开态
 *    不丢,文本选择不丢;
 * 2. 首次出现或内容键变了 -> 交给 `build` 重建,同名旧行在 `build` 返回后摘除;
 * 3. 消失的条目连行一起删除,其余行按输入数组顺序摆放(见 `appendInOrder`).
 *
 * 为什么只有这一份:增删/排序/缓存循环若分散在多处,任何顺序或缓存策略调整都要
 * 跟着改一遍,分叉处就是行为不一致的来源.类型差异(行内结构,异步回填等)留在
 * 各自的 `build`(通常是行对象的构造函数)里.
 */

/**
 * 行句柄的下限:任何行至少有一个根元素.
 *
 * 句柄通常就是**行对象本身**(实现这个接口的类):列表引擎只认这个 `row`,
 * 行内结构与增量更新都由对象自己的方法承担,不需要另建一份与行为分离的数据袋.
 */
export interface KeyedRowHandles {
    readonly row: HTMLElement;
}

export interface KeyedRowHooks<TItem, THandles extends KeyedRowHandles> {
    /** 条目标识;DOM 行缓存与调用方数值缓存的键. */
    name(item: TItem): string;
    /**
     * 会被渲染的内容指纹;变了就重建 DOM 行.
     *
     * 约定:键必须跟着**实际渲染出来的内容**走,不要罗列数据对象的全部字段--
     * 漏字段会导致"数据变了细节不刷新",把只影响视觉表现的字段算进来又会让
     * 纯视觉变化收起用户展开的细节.
     */
    key(item: TItem): string;
    /**
     * 构建整行(通常是 `new 行对象(...)`),`previous` 是同名旧行对象(没有
     * 同名行时为 null),旧行在 `build` 返回后才摘除,便于新行从旧行搬运状态;
     * `key` 是本次同步算出的内容键(调用方据此判断缓存数值是否还有效).
     */
    build(item: TItem, previous: THandles | null, key: string): THandles;
    /** `sync` 里条目从列表消失时回调(`clear()` 不回调);调用方据此清自己的数值缓存. */
    onRemove?(name: string): void;
}

interface KeyedRowEntry<THandles> {
    handles: THandles;
    key: string;
}

export class KeyedRowList<TItem, THandles extends KeyedRowHandles> {
    private readonly rows = new Map<string, KeyedRowEntry<THandles>>();

    constructor(private readonly container: HTMLElement) {
        // 容器在 DOM 里只是普通 <div>;显式给列表语义,读屏才会报"列表/列表项",
        // 而不是把每条读成孤立的一段.
        container.setAttribute('role', 'list');
    }

    /** 按 hooks 增量刷新:删消失的,复用键相同的,重建键变了的. */
    sync(items: readonly TItem[], hooks: KeyedRowHooks<TItem, THandles>): void {
        const nextNames = new Set(items.map((item) => hooks.name(item)));

        for (const [name, entry] of this.rows) {
            if (nextNames.has(name)) continue;
            entry.handles.row.remove();
            this.rows.delete(name);
            hooks.onRemove?.(name);
        }

        const ordered: HTMLElement[] = [];
        for (const item of items) {
            const name = hooks.name(item);
            const key = hooks.key(item);
            const existing = this.rows.get(name);

            if (existing && existing.key === key) {
                ordered.push(existing.handles.row);
                continue;
            }

            const handles = hooks.build(item, existing?.handles ?? null, key);
            if (existing) existing.handles.row.remove();
            this.rows.set(name, { handles, key });
            ordered.push(handles.row);
        }

        appendInOrder(this.container, ordered);
    }

    /**
     * 取当前同名条目的缓存项:`handles` 通常是行对象本身,异步回填直接调它的
     * 方法,不必另存一份句柄表.
     */
    entry(name: string): KeyedRowEntry<THandles> | undefined {
        return this.rows.get(name);
    }

    /** 清空容器与全部行缓存. */
    clear(): void {
        this.container.replaceChildren();
        this.rows.clear();
    }
}

/**
 * 按目标顺序摆放列表行.
 *
 * 缓存命中时行**留在原地**,所以数组顺序变了(输入数组新增/调序,或只有部分条目
 * 因为内容变化被重建)DOM 顺序不会自己跟上,替换过的行还会被 append 到末尾造成
 * 跳位.这里只在顺序确实不一致时才按顺序 append 一遍(对已有子节点来说 append 是
 * "搬移"),顺序一致时一次 DOM 都不动.
 */
function appendInOrder(
    container: HTMLElement,
    rows: readonly HTMLElement[],
): void {
    const current = container.children;
    let same = current.length === rows.length;
    if (same) {
        for (let index = 0; index < rows.length; index += 1) {
            if (current[index] !== rows[index]) {
                same = false;
                break;
            }
        }
    }
    if (same) return;
    for (const row of rows) container.append(row);
}
