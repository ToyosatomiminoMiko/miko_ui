/**
 * 窗口几何:锚点换算 / 夹取 / 吸附判定的**纯函数**.
 *
 * 本文件不引用任何 DOM(不 import `document`,`getComputedStyle`,也不认识
 * 元素):夹取边界,锚点默认值,吸附候选全部能在单测里穷举.
 * 真正把结果写进页面的是 `WindowManager` + `WindowFrame.writeGeometry`.
 *
 * **本文件就是那条"相对 -> 绝对"的纯函数边界**(类型见 `RelativeGeometry`):
 *
 * ```text
 *   RelativeGeometry(消费者写:锚点 + 可能依赖别的窗口/桌面尺寸)
 *        │
 *        │  resolveRelativeGeometries()   ← 批量:一次解整张清单,依赖也在里面解
 *        │  resolveRelativeGeometry()     ← 单条:只解一个窗口(上面那个的内部步骤)
 *        ▼
 *   AbsoluteGeometry(x / y / w / h,四个具体像素)  ← 窗口只吃这个,不认识锚点
 * ```
 *
 * 两段的分工:①把锚点换算成具体像素(含 `after` 的跨窗口依赖与 `split` 的并排
 * 排布);②夹取/移动/吸附这些**运行期**变换.窗口那一侧既不解析锚点,也不认识
 * `after` / `split`.
 *
 * 三条数值口径(唯一一份,别在别处再发明):
 * - 桌面被顶部 Dock(任务栏)切成两段:`[0, dockReserve)` 是任务栏,
 *   `dockReserve` 之下才是窗口的**工作区**.所以 y 轴的默认坐标原点在工作区
 *   上沿,`y: { at }` 由本文件统一加上 `dockReserve`,消费者不用自己加.
 * - `usableHeight = desktop.h - dockReserve - edgeGap`:工作区再减去底边间隙
 *   留出的高度,`fraction` 取的就是它.
 * - 夹取:`w/h ∈ [min, max(min, desktop)]`,`x ∈ [-(w - edgeKeep), dW - edgeKeep]`,
 *   `y ∈ [dockReserve, dH - headerMinVisible]`.标题栏是唯一的手动入口,既不能
 *   被拖进顶部任务栏,也不能被拖出桌底.
 *   `bind()` 的初始几何同样要过一遍 `fitGeometry`,否则"默认值"会成为唯一的例外.
 * - 最大化**没有几何函数**:进入这个态时行内四条属性被清掉,几何交给
 *   `styles/desktop.css` 的 `.is-maximized`(`inset`),所以这里也不存在
 *   "最大化矩形"的第二份实现.
 */
import type { AxisSpec, RelativeGeometry } from './types';

/** 桌面尺寸 + 顶部任务栏与底边间隙两条余量(见文件头). */
export interface Desktop {
    readonly w: number;
    readonly h: number;
    /**
     * 顶部 Dock(任务栏)的高度:工作区从 `h` 方向上的这个位置开始,
     * 最大化/吸附都铺在这条带之下.
     */
    readonly dockReserve: number;
    /** 窗口与桌面边缘的间隙:默认几何的底边线在这之上再让出一段. */
    readonly edgeGap: number;
}

/**
 * 窗口的普通态几何:**具体像素**,相对 `#app` 左上角.
 *
 * 与 {@link RelativeGeometry} 是一对反义名字:这里没有任何"以谁为参照"的余地,
 * 四个数就是最终写进行内样式的值.窗口那一侧只认这个类型.
 */
export interface AbsoluteGeometry {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
}

/** 某个窗口的最小尺寸. */
interface SizeConstraints {
    readonly w: number;
    readonly h: number;
}

/** 夹取所需的全部上下文. */
export interface Limits {
    readonly desktop: Desktop;
    readonly min: SizeConstraints;
    readonly edgeKeep: number;
    readonly headerMinVisible: number;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** 工作区上沿:y 轴默认坐标的原点(顶部任务栏下沿). */
function workAreaTop(desktop: Desktop): number {
    return desktop.dockReserve;
}

/** 桌面可用高:工作区再减去底边间隙(`fraction` 取的就是它). */
export function usableHeight(desktop: Desktop): number {
    return desktop.h - desktop.dockReserve - desktop.edgeGap;
}

/** 缺了 `after` 依赖时的统一报错:配置顺序错了要在启动期说清楚. */
function unresolvedDependency(id: string): Error {
    return new Error(`窗口默认几何依赖的 after 窗口未解析:${id}(检查 windows 清单的顺序)`);
}

/** 不支持的锚点组合:与其静默算错,不如在启动期抛一条能读懂的错. */
function unsupportedAxis(axis: AxisSpec, position: 'x' | 'y' | 'w' | 'h'): Error {
    return new Error(`桌面配置的 ${position} 用了不支持的锚点:${JSON.stringify(axis)}`);
}

function resolveWidth(axis: AxisSpec, desktop: Desktop): number {
    if (typeof axis === 'string') throw unsupportedAxis(axis, 'w');
    if ('at' in axis) return axis.at;
    if ('clamp' in axis) {
        return clamp(desktop.w - axis.inset, axis.clamp[0], axis.clamp[1]);
    }
    if ('split' in axis) {
        const { count, index, inset, gap } = axis.split;
        if (!Number.isInteger(count) || count < 1) {
            throw new Error(`split 的 count 必须是 >= 1 的整数,拿到的是:${count}`);
        }
        if (!Number.isInteger(index) || index < 0 || index >= count) {
            throw new Error(`split 的 index 必须在 [0, ${count - 1}] 内,拿到的是:${index}`);
        }
        // 可用宽 = 桌面宽 - 两端 inset;份数之间的 gap 也要从可用宽里扣掉,
        // 于是每份恰好等宽(总数不丢也不多).
        return Math.floor((desktop.w - inset - (count - 1) * gap) / count);
    }    throw unsupportedAxis(axis, 'w');
}

/** 不依赖 y 的高度分支(`at` / `fraction`);`from: 'bottom'` 由调用方后算. */
function resolveHeight(axis: AxisSpec, desktop: Desktop): number {
    if (typeof axis === 'string') throw unsupportedAxis(axis, 'h');
    if ('at' in axis) return axis.at;
    if ('fraction' in axis) return Math.round(axis.fraction * usableHeight(desktop));
    throw unsupportedAxis(axis, 'h');
}

/** `w: { split: ... }` 的载荷;`w` 用了它时 x 也由它算(见 `resolveX`). */
interface SplitAxis {
    readonly count: number;
    readonly index: number;
    readonly inset: number;
    readonly gap: number;
}

function splitOf(spec: AxisSpec): SplitAxis | null {
    return typeof spec !== 'string' && 'split' in spec ? spec.split : null;
}

/** 宽度已定之后的 x. */
function resolveX(axis: AxisSpec, spec: RelativeGeometry, desktop: Desktop, w: number): number {
    // 并排的一排:x 由"第几块"算出,不再读 x 锚点(声明里那个是占位值).
    // inset 是整排两端各留的边距,所以这一排占据的是 [inset, dW - inset] 这段
    // 宽度(row = dW - 2*inset);span 是各块连间隙的总宽,span 小于 row 时
    // (窄桌面 / 份数少)整排在这段里居中,左右各留多余的零头.
    const split = splitOf(spec.w);
    if (split) {
        const row = desktop.w - 2 * split.inset;
        const span = split.count * w + (split.count - 1) * split.gap;
        const origin = split.inset + Math.round((row - span) / 2);
        return origin + split.index * (w + split.gap);
    }
    if (axis === 'center') return clamp(Math.round((desktop.w - w) / 2), 0, desktop.w - w);
    if (typeof axis !== 'string' && 'at' in axis) return axis.at;
    if (typeof axis !== 'string' && 'from' in axis && axis.from === 'right') {
        return desktop.w - axis.inset - w;
    }
    throw unsupportedAxis(axis, 'x');
}

/**
 * 单个窗口的锚点 -> 绝对坐标(纯函数).
 *
 * 计算顺序固定为"宽 -> (不依赖 y 的高) -> y -> (依赖 y 的高) -> x":
 * `view` / `process` 的 y 来自 `after`,它们的 h 再从这个 y 解出;
 * 固定高的窗口(如中列那两块)的 y 反过来由 h 解出,`x` 最后算 -- 并排的
 * `split` 要用已经算好的宽度.
 *
 * `resolved` 只用来查 `after` 依赖的那一个窗口.它由
 * {@link resolveRelativeGeometries} 按依赖序喂进来,所以**不要**在别处手工拼这张
 * map -- 那是本文件内部的一步,漏了顺序就会走到 `unresolvedDependency`.
 */
function resolveRelativeGeometryEntry(
    spec: RelativeGeometry,
    desktop: Desktop,
    resolved: ReadonlyMap<string, AbsoluteGeometry>,
): AbsoluteGeometry {
    const w = resolveWidth(spec.w, desktop);

    const hBeforeY = typeof spec.h !== 'string' && 'from' in spec.h
        ? null
        : resolveHeight(spec.h, desktop);

    const y = resolveY(spec, desktop, resolved, hBeforeY);

    const h = hBeforeY ?? resolveBottomHeight(spec.h, desktop, y);

    const x = resolveX(spec.x, spec, desktop, w);
    return { x, y, w, h };
}

/**
 * 解析需要的最小输入:窗口 id + 它的相对几何声明.
 *
 * 刻意只要求这两个字段(不是整份 `WindowConfigEntry`):解析只跟"这些窗口都声明在
 * 哪"有关,标题 / 最小尺寸 / Dock 标签都不参与,调用方也就不必为了调它去凑齐一份
 * 完整窗口配置.
 */
export interface RelativeGeometryEntry {
    readonly id: string;
    readonly defaultGeometry: RelativeGeometry;
}

/**
 * **相对 -> 绝对**的唯一入口:把整张窗口几何声明换算成每个窗口的绝对坐标.
 *
 * 这是那条两阶段流水线的第一段(见 `RelativeGeometry` 的文件头):
 *
 * ```text
 *   RelativeGeometry[]  ──本函数(纯)──▶  Map<id, AbsoluteGeometry>  ──▶  createWindowFrame
 * ```
 *
 * 纯函数:同输入同输出,不读 DOM,不碰时间与全局状态.窗口那一侧只吃返回值里的
 * 四个绝对值,锚点不会漏进窗口.
 *
 * **依赖在函数内部解**:`after` 指向的窗口先解析(DFS),所以调用方**不需要**把
 * 数组按依赖序排好 -- 顺序不再是一条只写在注释里的隐式契约.成环或指向不存在的
 * 窗口都会在这里抛一条能读懂的错,而不是算出一个错坐标.
 */
export function resolveRelativeGeometries(
    windows: readonly RelativeGeometryEntry[],
    desktop: Desktop,
): Map<string, AbsoluteGeometry> {
    const byId = new Map<string, RelativeGeometryEntry>();
    for (const entry of windows) {
        if (byId.has(entry.id)) {
            throw new Error(`窗口几何声明的 id 重复:${entry.id}`);
        }
        byId.set(entry.id, entry);
    }

    const resolved = new Map<string, AbsoluteGeometry>();
    /** 当前 DFS 路径,只为成环时报出"是哪一圈". */
    const path: string[] = [];

    const visit = (id: string): AbsoluteGeometry => {
        const done = resolved.get(id);
        if (done) return done;

        const entry = byId.get(id);
        if (!entry) throw unresolvedDependency(id);

        const cycleAt = path.indexOf(id);
        if (cycleAt !== -1) {
            throw new Error(
                `窗口默认几何的 after 成环:${[...path.slice(cycleAt), id].join(' -> ')}`,
            );
        }

        path.push(id);
        // 先解依赖:这一步取代了"数组顺序即依赖顺序"那条隐式契约.
        const afterId = entry.defaultGeometry.after?.id;
        if (afterId !== undefined) visit(afterId);
        path.pop();

        const geometry = resolveRelativeGeometryEntry(entry.defaultGeometry, desktop, resolved);
        resolved.set(id, geometry);
        return geometry;
    };

    for (const entry of windows) visit(entry.id);
    return resolved;
}

/**
 * 解**一个**窗口:相对声明 -> 绝对像素(纯函数,{@link resolveRelativeGeometries}
 * 内部的单步).
 *
 * 单独导出是因为它是最小原语:大量测试只想验证"一个锚点算出什么",不必凑一张
 * 完整窗口清单.
 *
 * 注意它要求调用方**自己按依赖序**喂 `resolved`(给 `after` 查依赖用),而顺序
 * 不是签名的一部分.组装真实桌面请用 {@link resolveRelativeGeometries}:依赖由它
 * 内部解,不需要外部维护这张半成品 map.
 */
export function resolveRelativeGeometry(
    spec: RelativeGeometry,
    desktop: Desktop,
    resolved: ReadonlyMap<string, AbsoluteGeometry>,
): AbsoluteGeometry {
    return resolveRelativeGeometryEntry(spec, desktop, resolved);
}

/**
 * y 的三种解析方式;`after` 与 `from: 'bottom'` 之外都从工作区上沿量起.
 *
 * 只有 `after` 与 `from: 'bottom'` 不在这里加 `workAreaTop`:前者接在已经算好的
 * 窗口下方(那份几何里已经含过一次偏移),后者锚的是桌面底边.
 */
function resolveY(
    spec: RelativeGeometry,
    desktop: Desktop,
    resolved: ReadonlyMap<string, AbsoluteGeometry>,
    knownH: number | null,
): number {
    if (spec.after) {
        const base = resolved.get(spec.after.id);
        if (!base) throw unresolvedDependency(spec.after.id);
        return base.y + base.h + spec.after.gap;
    }
    const top = workAreaTop(desktop);
    const axis = spec.y;
    if (axis === 'center') {
        if (knownH === null) throw unsupportedAxis(axis, 'y');
        return clamp(
            top + Math.round((desktop.h - top - knownH) / 2),
            top,
            Math.max(top, desktop.h - knownH),
        );
    }
    if (typeof axis !== 'string' && 'at' in axis) return top + axis.at;
    if (typeof axis !== 'string' && 'from' in axis && axis.from === 'bottom') {
        if (knownH === null) throw unsupportedAxis(axis, 'y');
        return desktop.h - axis.inset - knownH;
    }
    throw unsupportedAxis(axis, 'y');
}

/** `h: { from: 'bottom' }` 的唯一语义:底边落在距桌面该侧 `inset` 处. */
function resolveBottomHeight(axis: AxisSpec, desktop: Desktop, y: number): number {
    if (typeof axis !== 'string' && 'from' in axis && axis.from === 'bottom') {
        return desktop.h - axis.inset - y;
    }
    throw unsupportedAxis(axis, 'h');
}

/**
 * 夹取(唯一一份公式).
 *
 * `max(min, desktop)` 那个兜底是为了小视口:桌面比最小尺寸还小时,宁可让窗口
 * 超出桌面,也不要算出 `min > max` 的区间(`clamp` 会返回 `min`,窗口比桌面大,
 * 但标题栏仍在桌内,能抓回来).
 *
 * `y` 的下界是工作区上沿(`dockReserve`),不是桌顶:窗口被拖向顶部时停在顶部
 * 任务栏下沿,标题栏不会被那条通栏带盖住.
 */
export function clampGeometry(g: AbsoluteGeometry, limits: Limits): AbsoluteGeometry {
    const maxW = Math.max(limits.min.w, limits.desktop.w);
    const maxH = Math.max(limits.min.h, limits.desktop.h);
    const top = workAreaTop(limits.desktop);
    const w = clamp(g.w, limits.min.w, maxW);
    const h = clamp(g.h, limits.min.h, maxH);
    const x = clamp(g.x, -(w - limits.edgeKeep), limits.desktop.w - limits.edgeKeep);
    const y = clamp(g.y, top, Math.max(top, limits.desktop.h - limits.headerMinVisible));
    return { x, y, w, h };
}

/** 移动:k -> k+1 的唯一入口.delta 是原始像素增量,累加后统一夹一次. */
export function moveGeometry(g: AbsoluteGeometry, dx: number, dy: number, limits: Limits): AbsoluteGeometry {
    return clampGeometry({ x: g.x + dx, y: g.y + dy, w: g.w, h: g.h }, limits);
}

/**
 * resize 时把窗口**整体**收进工作区.
 *
 * 与 `clampGeometry` 的分工:拖动的夹取刻意允许窗口挂出桌面边缘(否则"把窗口
 * 推到边上"就做不到了,见上面的 `x` 上下限),而视口变小属于外部变化,应该把
 * 用户摆好的窗口整体收回来,不留越界.窗口比工作区还大时收到工作区左上角
 * (标题栏仍然抓得到).
 */
export function fitGeometry(g: AbsoluteGeometry, limits: Limits): AbsoluteGeometry {
    const clamped = clampGeometry(g, limits);
    const top = workAreaTop(limits.desktop);
    return {
        ...clamped,
        x: clamp(clamped.x, 0, Math.max(0, limits.desktop.w - clamped.w)),
        y: clamp(clamped.y, top, Math.max(top, limits.desktop.h - clamped.h)),
    };
}

/** 边缘吸附的三种落点(与 `resolveEdgeSnap` 的返回同域). */
export type SnapKind = 'left' | 'right' | 'maximize';

/**
 * 边缘吸附的判据(三者互斥,按此顺序判);`null` = 不吸附.
 *
 * 判据只用到指针与桌面:被拖窗口自身的几何与"吸不吸附"无关(窗口间磁吸另有
 * `magnetize`),所以这里不接收它--不为"将来可能用得上"多留一个参数.
 *
 * 顶部判据的口径是"指针进到任务栏下沿附近":窗口被夹在工作区上沿时,指针还在
 * 任务栏上(甚至更上面),拿 `snap.edge` 直接比 `0` 就永远触发不了最大化.
 */
export function resolveEdgeSnap(
    pointer: { readonly x: number; readonly y: number },
    desktop: Desktop,
    snap: { readonly edge: number },
): { readonly target: AbsoluteGeometry; readonly kind: SnapKind } | null {
    // 半屏与最大化两者几何一致(都铺满工作区),这样"怎么放都是同一个观感".
    const top = workAreaTop(desktop);
    const height = desktop.h - top;
    if (pointer.y <= top + snap.edge) {
        return { target: { x: 0, y: top, w: desktop.w, h: height }, kind: 'maximize' };
    }
    if (pointer.x <= snap.edge) {
        const w = Math.round(desktop.w / 2);
        return { target: { x: 0, y: top, w, h: height }, kind: 'left' };
    }
    if (pointer.x >= desktop.w - snap.edge) {
        const w = Math.round(desktop.w / 2);
        return { target: { x: desktop.w - w, y: top, w, h: height }, kind: 'right' };
    }
    return null;
}

/**
 * 磁吸:把被拖窗口的左上边贴到其它可见窗口的对应边上.
 *
 * x / y 两个轴各自判:每个轴在所有候选边里取距离最近的那条,只要修正量不超过
 * `magnet` 就贴过去(两个轴都可能贴,互不影响).`magnet` 内没有候选就原样返回.
 * 修正量只是"这一次移动"的临时结果(由调用方按帧算),**不要**写回
 * `entry.geometry`,否则窗口会被永久吸住.
 */
export function magnetize(g: AbsoluteGeometry, others: readonly AbsoluteGeometry[], magnet: number): AbsoluteGeometry {
    let x = g.x;
    let y = g.y;
    let bestX = magnet + 1;
    let bestY = magnet + 1;

    for (const other of others) {
        for (const candidate of [other.x, other.x + other.w]) {
            const distance = Math.abs(candidate - g.x);
            if (distance <= magnet && distance < bestX) {
                bestX = distance;
                x = candidate;
            }
        }
        for (const candidate of [other.y, other.y + other.h]) {
            const distance = Math.abs(candidate - g.y);
            if (distance <= magnet && distance < bestY) {
                bestY = distance;
                y = candidate;
            }
        }
    }
    return { x, y, w: g.w, h: g.h };
}

/**
 * 几何的四条行内属性:窗口几何**唯一允许的写入形状**.
 *
 * `WindowFrame.writeGeometry` 逐条 `style.setProperty` 落地,不拼 `cssText`:
 * `cssText` 赋值会清空整个行内声明块,把 `focus()` 写的 `z-index` 一起清掉,
 * 被拖的窗口会当场掉到其它窗口后面.
 */
export function geometryStyle(g: AbsoluteGeometry): Readonly<Record<'left' | 'top' | 'width' | 'height', string>> {
    return {
        left: `${g.x}px`,
        top: `${g.y}px`,
        width: `${g.w}px`,
        height: `${g.h}px`,
    };
}
