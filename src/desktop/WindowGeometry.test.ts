/**
 * 窗口几何纯函数的边界穷举.
 *
 * 这里不碰 DOM:夹取,移动,吸附判定,以及五个窗口在两组目标视口下的
 * 默认几何都能在单测里钉死.真机上"CSS 有没有让窗口填满"是另一回事.
 */
import { describe, expect, it } from 'vitest';
import { TEST_DESKTOP_CONFIG } from '../../test/desktopFixture';
import {
    clampGeometry,
    fitGeometry,
    geometryStyle,
    magnetize,
    moveGeometry,
    resolveRelativeGeometry,
    resolveRelativeGeometries,
    resolveEdgeSnap,
    usableHeight,
    type Desktop,
    type AbsoluteGeometry,
    type Limits,
} from './WindowGeometry';
import type { RelativeGeometry } from './types';

const WINDOW = TEST_DESKTOP_CONFIG;

/** 桌面尺寸与两条余量都来自配置(顶部任务栏 dockReserve + 底边间隙 edgeGap). */
function desktopOf(w: number, h: number): Desktop {
    return { w, h, dockReserve: WINDOW.dockReserve, edgeGap: WINDOW.edgeGap };
}

/**
 * 把整张窗口清单的默认几何解出来.
 *
 * 走的是生产路径 `resolveRelativeGeometries`(`WindowManager.bind()` 用的同一个
 * 函数):依赖由它内部解,这里**不需要**先排好序.
 */
function resolveAll(desktop: Desktop): Map<string, AbsoluteGeometry> {
    return resolveRelativeGeometries(WINDOW.windows, desktop);
}

/** 与 {@link resolveAll} 同义,但把窗口清单**倒过来**喂进去. */
function resolveAllReversed(desktop: Desktop): Map<string, AbsoluteGeometry> {
    return resolveRelativeGeometries([...WINDOW.windows].reverse(), desktop);
}

function limitsFor(id: string, desktop: Desktop): Limits {
    const spec = WINDOW.windows.find((entry) => entry.id === id);
    if (!spec) throw new Error(`夹具里没有窗口 ${id}`);
    return {
        desktop,
        min: spec.minSize,
        edgeKeep: WINDOW.edgeKeep,
        headerMinVisible: WINDOW.headerMinVisible,
    };
}

const VIEWPORTS = [
    {
        label: '1280x800',
        desktop: desktopOf(1280, 800),
        expected: {
            source: { x: 16, y: 56, w: 420, h: 506 },
            view: { x: 16, y: 574, w: 420, h: 210 },
            params: { x: 844, y: 56, w: 420, h: 409 },
            process: { x: 844, y: 477, w: 420, h: 307 },
            objects: { x: 452, y: 524, w: 376, h: 260 },
        },
    },
    {
        label: '1920x1080',
        desktop: desktopOf(1920, 1080),
        expected: {
            source: { x: 16, y: 56, w: 420, h: 696 },
            view: { x: 16, y: 764, w: 420, h: 300 },
            params: { x: 1484, y: 56, w: 420, h: 563 },
            process: { x: 1484, y: 631, w: 420, h: 433 },
            objects: { x: 600, y: 804, w: 720, h: 260 },
        },
    },
] as const;

describe('resolveRelativeGeometry:五个窗口的默认几何', () => {
    for (const { label, desktop, expected } of VIEWPORTS) {
        it(`${label}:五个窗口逐项与方案里的期望值一致`, () => {
            const resolved = resolveAll(desktop);
            for (const [id, geometry] of Object.entries(expected)) {
                expect(resolved.get(id), id).toEqual(geometry);
            }
            // 这五个 id 是夹具清单的全部;换桌面尺寸不改变窗口个数.
            expect(resolved.size).toBe(5);
        });

        it(`${label}:y 从工作区上沿量起,且都在顶部任务栏之下`, () => {
            const resolved = resolveAll(desktop);
            const top = desktop.dockReserve;

            for (const [id, geometry] of resolved) {
                expect(geometry.y, `${id}.y`).toBeGreaterThanOrEqual(top);
            }
            // `at: 16` 是"任务栏下沿再往下 16px",不是桌顶 16px.
            expect(resolved.get('source')!.y).toBe(top + 16);
            expect(resolved.get('params')!.y).toBe(top + 16);
        });

        it(`${label}:下沿共用底边线 dH-edgeGap,其余窗口都留在它之上`, () => {
            const resolved = resolveAll(desktop);
            const bottom = desktop.h - WINDOW.edgeGap;

            // view / process / objects 三条边就是这条底线(左列下沿,右列下沿,中下).
            for (const id of ['view', 'process', 'objects'] as const) {
                expect(resolved.get(id)!.y + resolved.get(id)!.h, id).toBe(bottom);
            }
            // source / params 用 fraction 取高,底边在这条线之上--底边线留出的
            // edgeGap 不属于任何窗口.
            for (const [id, geometry] of resolved) {
                expect(geometry.y + geometry.h, id).toBeLessThanOrEqual(bottom);
            }
        });

        it(`${label}:不越界,且两列与中列不重叠`, () => {
            const resolved = resolveAll(desktop);
            // 中列宽度只由一条 clamp 公式定,夹到下限后可以压到左右两列上;
            // 这里只保证谁都不越出桌面.
            for (const [id, geometry] of resolved) {
                expect(geometry.x, `${id}.x`).toBeGreaterThanOrEqual(0);
                expect(geometry.y, `${id}.y`).toBeGreaterThanOrEqual(desktop.dockReserve);
                expect(geometry.x + geometry.w, `${id} 右边界`).toBeLessThanOrEqual(desktop.w);
                expect(geometry.y + geometry.h, `${id} 底边`).toBeLessThanOrEqual(desktop.h);
            }

            const objects = resolved.get('objects')!;
            for (const id of ['source', 'view'] as const) {
                const geometry = resolved.get(id)!;
                expect(geometry.x + geometry.w, `左列 ${id}`).toBeLessThanOrEqual(objects.x);
            }
            for (const id of ['params', 'process'] as const) {
                const geometry = resolved.get(id)!;
                expect(geometry.x, `右列 ${id}`).toBeGreaterThanOrEqual(objects.x + objects.w);
            }
        });

        it(`${label}:每一列内部上下留出 gap 且不重叠`, () => {
            const resolved = resolveAll(desktop);
            const source = resolved.get('source')!;
            const view = resolved.get('view')!;
            const params = resolved.get('params')!;
            const process = resolved.get('process')!;

            // 两条缝都来自各自 `after.gap`;夹取过的 `view` 仍落在 `source` 的正下方.
            expect(view.y - (source.y + source.h)).toBe(12);
            expect(process.y - (params.y + params.h)).toBe(12);
        });

        it(`${label}:默认几何都不小于各自的最小尺寸`, () => {
            // 这一条只保证两个设计视口;更小的桌面上 raw 结果可以低于 minSize,
            // 兜底在 `WindowManager.bind()` 的 `fitGeometry`(那里有对应回归).
            const resolved = resolveAll(desktop);
            for (const spec of WINDOW.windows) {
                const geometry = resolved.get(spec.id)!;
                expect(geometry.w, `${spec.id}.w`).toBeGreaterThanOrEqual(spec.minSize.w);
                expect(geometry.h, `${spec.id}.h`).toBeGreaterThanOrEqual(spec.minSize.h);
            }
        });
    }

    it('fraction 取的是可用高(dH-dockReserve-edgeGap),不是桌面高', () => {
        const desktop = desktopOf(1920, 1080);
        expect(usableHeight(desktop)).toBe(1024);

        const resolved = resolveAll(desktop);
        // 0.68 * 1024 = 696.32 -> 696;若误用桌面高会得到 734.
        expect(resolved.get('source')!.h).toBe(696);
        expect(resolved.get('params')!.h).toBe(563);
    });

    it('窄视口不再夹取中列宽度(允许重叠),但宽度仍不小于下限', () => {
        const desktop = desktopOf(900, 700);
        const resolved = resolveAll(desktop);
        // dW - 904 = -4 -> 夹到下限 360;这里只断言宽度下限,重叠与否不在断言内.
        expect(resolved.get('objects')!.w).toBe(360);
    });

    it('after 引用了未解析的窗口时抛一条能读懂的错', () => {
        const view = WINDOW.windows.find((spec) => spec.id === 'view')!;
        expect(() => resolveRelativeGeometry(view.defaultGeometry, desktopOf(1280, 800), new Map()))
            .toThrow(/after/);
    });
});

describe('resolveRelativeGeometries:相对声明 -> 绝对坐标(纯函数批量入口)', () => {
    const desktop = desktopOf(1280, 800);

    it('返回的每个窗口都是四个绝对值,没有锚点残留', () => {
        const resolved = resolveAll(desktop);
        expect(resolved.size).toBe(WINDOW.windows.length);
        for (const [id, geometry] of resolved) {
            for (const key of ['x', 'y', 'w', 'h'] as const) {
                expect(typeof geometry[key], `${id}.${key}`).toBe('number');
                expect(Number.isFinite(geometry[key]), `${id}.${key}`).toBe(true);
            }
        }
    });

    it('纯:同输入同输出,调两次逐字段相同', () => {
        const a = resolveAll(desktop);
        const b = resolveAll(desktop);
        for (const id of a.keys()) expect(b.get(id), id).toEqual(a.get(id));
    });

    it('**不依赖调用方排序**:清单倒过来喂,结果逐字段相同', () => {
        // 这条就是重构的收益:`after` 的先后以前是"数组顺序即依赖顺序"这条
        // 只写在注释里的契约,现在由函数内部解,倒序喂也解得对.
        const forward = resolveAll(desktop);
        const reversed = resolveAllReversed(desktop);
        for (const id of forward.keys()) {
            expect(reversed.get(id), id).toEqual(forward.get(id));
        }
    });

    it('after 指向不存在的窗口 -> 启动期抛错,而不是算出一个错坐标', () => {
        expect(() => resolveRelativeGeometries(
            [{ id: 'a', defaultGeometry: {
                x: { at: 0 }, y: { at: 0 }, w: { at: 10 }, h: { at: 10 },
                after: { id: '不存在', gap: 8 },
            } }],
            desktop,
        )).toThrow(/after/);
    });

    it('after 成环 -> 抛一条能读出是哪一圈的错', () => {
        expect(() => resolveRelativeGeometries(
            [
                { id: 'a', defaultGeometry: {
                    x: { at: 0 }, y: { at: 0 }, w: { at: 10 }, h: { at: 10 },
                    after: { id: 'b', gap: 8 },
                } },
                { id: 'b', defaultGeometry: {
                    x: { at: 0 }, y: { at: 0 }, w: { at: 10 }, h: { at: 10 },
                    after: { id: 'a', gap: 8 },
                } },
            ],
            desktop,
        )).toThrow(/成环/);
    });

    it('窗口 id 重复 -> 抛错(而不是后者静默盖掉前者)', () => {
        const spec = { x: { at: 0 }, y: { at: 0 }, w: { at: 10 }, h: { at: 10 } };
        expect(() => resolveRelativeGeometries(
            [{ id: 'dup', defaultGeometry: spec }, { id: 'dup', defaultGeometry: spec }],
            desktop,
        )).toThrow(/重复/);
    });
});

describe('resolveRelativeGeometry:split(把居中区域等分成并排的几块)', () => {
    const desktop = desktopOf(1280, 800);

    /**
     * 一个宽窗口拆成并排两块:典型的"原来一个 objects,现在实体 / 求值".
     *
     * `x` 是占位值(`'center'`):并排的一排里,宽度与 x 由同一份"第几块"信息一起
     * 算出,`resolveX` 走 `split` 分支时根本不读它.类型上仍然必填,免得"相对"
     * 退化成 `undefined` 分支(见 `RelativeGeometry` 的文件头).
     */
    const panel = (index: number): RelativeGeometry => ({
        x: 'center',
        y: { from: 'bottom', inset: 16 },
        w: { split: { count: 2, index, inset: 436 * 2, gap: 12 } },
        h: { at: 260 },
    });

    function resolvePanels(desk: Desktop = desktop): AbsoluteGeometry[] {
        return [0, 1].map((index) => resolveRelativeGeometry(panel(index), desk, new Map()));
    }

    it('两块等宽,x 相差一个"宽 + gap"', () => {
        const [a, b] = resolvePanels();
        // 1280 - 872 - 12 = 396,对半分各 198.
        expect(a.w).toBe(198);
        expect(b.w).toBe(198);
        expect(b.x).toBe(a.x + a.w + 12);
    });

    it('整排居中:x 关于桌面中心对称', () => {
        const [a, b] = resolvePanels();
        const leftGap = a.x;
        const rightGap = desktop.w - (b.x + b.w);
        expect(leftGap).toBe(rightGap);
    });

    it('`x` 省略合法,y 与 h 仍走自己的锚点(两块底边齐平)', () => {
        const [a, b] = resolvePanels();
        expect(b.y).toBe(a.y);
        expect(b.y + b.h).toBe(desktop.h - 16);
        expect(a.y + a.h).toBe(desktop.h - 16);
    });

    it('换一个桌面宽度仍然等宽且居中(inset 手算法在这里会错)', () => {
        const wide = desktopOf(1920, 1080);
        const [a, b] = resolvePanels(wide);
        expect(a.w).toBe(b.w);
        expect(a.w).toBe(Math.floor((1920 - 872 - 12) / 2));
        expect(a.x).toBe(1920 - (b.x + b.w));
    });

    it('count = 1 就是"居中区域里的一块"', () => {
        const single = resolveRelativeGeometry(
            // `x` 是占位值:`w` 用了 split 时不读它(见 RelativeGeometry 的文件头).
            { x: 'center', y: { at: 16 }, w: { split: { count: 1, index: 0, inset: 0, gap: 0 } }, h: { at: 100 } },
            desktop,
            new Map(),
        );
        expect(single.w).toBe(1280);
        expect(single.x).toBe(0);
    });

    it('index 越界 / count 非法时抛一条能读懂的错', () => {
        const bad = (split: { count: number; index: number; inset: number; gap: number }) =>
            resolveRelativeGeometry(
                { x: 'center', y: { at: 16 }, w: { split }, h: { at: 100 } },
                desktop,
                new Map(),
            );
        expect(() => bad({ count: 2, index: 2, inset: 0, gap: 0 })).toThrow(/index/);
        expect(() => bad({ count: 0, index: 0, inset: 0, gap: 0 })).toThrow(/count/);
    });
});

describe('resolveRelativeGeometry:纵向 after(旧语义不受影响)', () => {
    it('y 接在依赖窗口下方,且不去动 x', () => {
        const desktop = desktopOf(1280, 800);
        const base = resolveRelativeGeometry(
            { x: 'center', y: { at: 16 }, w: { at: 300 }, h: { at: 200 } },
            desktop,
            new Map(),
        );
        const below = resolveRelativeGeometry(
            { x: 'center', y: { at: 0 }, w: { at: 300 }, h: { at: 100 }, after: { id: 'base', gap: 12 } },
            desktop,
            new Map([['base', base]]),
        );
        // y 从工作区上沿量起:16 是相对工作区的偏移,所以要加上 dockReserve.
        expect(below.y).toBe(WINDOW.dockReserve + 16 + 200 + 12);
        expect(below.x).toBe(base.x);
    });
});

describe('clampGeometry', () => {
    const desktop = desktopOf(1000, 700);
    const limits = limitsFor('source', desktop);

    it('尺寸夹到 [min, max(min, desktop)]', () => {
        expect(clampGeometry({ x: 0, y: 0, w: 10, h: 10 }, limits))
            .toMatchObject({ w: 300, h: 220 });
        expect(clampGeometry({ x: 0, y: 0, w: 5000, h: 5000 }, limits))
            .toMatchObject({ w: 1000, h: 700 });
    });

    it('桌面比最小尺寸还小时允许窗口超出桌面(标题栏仍在桌内)', () => {
        const tiny = desktopOf(200, 100);
        const clamped = clampGeometry({ x: 9999, y: 9999, w: 10, h: 10 }, limitsFor('source', tiny));

        expect(clamped.w).toBe(300);
        expect(clamped.h).toBe(220);
        // x 的上界是 dW - edgeKeep;y 的上界是 dH - headerMinVisible.
        expect(clamped.x).toBe(200 - WINDOW.edgeKeep);
        expect(clamped.y).toBe(100 - WINDOW.headerMinVisible);
    });

    it('至少 EDGE_KEEP 宽留在桌内', () => {
        const left = clampGeometry({ x: -10_000, y: 0, w: 420, h: 300 }, limits);
        const right = clampGeometry({ x: 10_000, y: 0, w: 420, h: 300 }, limits);

        expect(left.x).toBe(-(420 - WINDOW.edgeKeep));
        expect(right.x).toBe(desktop.w - WINDOW.edgeKeep);
    });

    it('标题栏不会被拖进顶部任务栏,也不能被拖出桌底', () => {
        // 上界不是桌顶 0,而是工作区上沿 dockReserve.
        expect(clampGeometry({ x: 0, y: -50, w: 420, h: 300 }, limits).y).toBe(WINDOW.dockReserve);
        expect(clampGeometry({ x: 0, y: 10_000, w: 420, h: 300 }, limits).y)
            .toBe(desktop.h - WINDOW.headerMinVisible);
    });
});

describe('moveGeometry', () => {
    const desktop = desktopOf(1000, 700);
    const limits = limitsFor('source', desktop);

    it('增量语义:夹住之后回拖能立刻跟上', () => {
        const start: AbsoluteGeometry = { x: 100, y: 100, w: 420, h: 300 };

        const moved = moveGeometry(start, 40, 30, limits);
        expect(moved).toEqual({ x: 140, y: 130, w: 420, h: 300 });

        // 一路拖到左上角被夹住(上边顶到工作任务栏下沿),再往右下拖 10px 立刻
        // 反应(而不是等"总位移"回正).
        const pinned = moveGeometry(start, -10_000, -10_000, limits);
        expect(pinned.x).toBe(-(420 - WINDOW.edgeKeep));
        expect(pinned.y).toBe(WINDOW.dockReserve);
        expect(moveGeometry(pinned, 10, 10, limits)).toEqual({
            x: pinned.x + 10,
            y: WINDOW.dockReserve + 10,
            w: 420,
            h: 300,
        });
    });
});

describe('fitGeometry:resize 时把窗口整体收进工作区', () => {
    const desktop = desktopOf(1000, 700);
    const limits = limitsFor('source', desktop);

    it('挂出右边的窗口被整体推回桌内', () => {
        expect(fitGeometry({ x: 900, y: 100, w: 420, h: 300 }, limits))
            .toEqual({ x: 580, y: 100, w: 420, h: 300 });
    });

    it('比工作区还大的窗口收到工作区左上角(标题栏仍抓得到)', () => {
        const tiny = desktopOf(200, 100);
        const fitted = fitGeometry({ x: 500, y: 500, w: 420, h: 300 }, limitsFor('source', tiny));

        expect(fitted.x).toBe(0);
        // 上边收到工作区上沿,不是桌顶 0:否则标题栏会被顶部任务栏盖住.
        expect(fitted.y).toBe(WINDOW.dockReserve);
    });

    it('已经完整在桌内的窗口不动', () => {
        const inside = { x: 100, y: 100, w: 420, h: 300 };
        expect(fitGeometry(inside, limits)).toEqual(inside);
    });
});

describe('resolveEdgeSnap', () => {
    const desktop = desktopOf(1280, 800);
    const snap = WINDOW.snap;

    it('拖到顶部任务栏 -> 最大化(优先于左右)', () => {
        const result = resolveEdgeSnap({ x: 4, y: 4 }, desktop, snap);
        expect(result?.kind).toBe('maximize');
        // 铺满工作区:上边从任务栏下沿开始,不再有底部预留.
        expect(result?.target).toEqual({ x: 0, y: WINDOW.dockReserve, w: 1280, h: 760 });
    });

    it('左/右边缘 -> 半屏,高度与最大化一致', () => {
        const left = resolveEdgeSnap({ x: snap.edge, y: 300 }, desktop, snap);
        const right = resolveEdgeSnap({ x: 1280 - snap.edge, y: 300 }, desktop, snap);

        // 与最大化同几何:都铺满工作区,这样"怎么放都是同一个观感".
        expect(left).toEqual({
            target: { x: 0, y: WINDOW.dockReserve, w: 640, h: 760 },
            kind: 'left',
        });
        expect(right).toEqual({
            target: { x: 640, y: WINDOW.dockReserve, w: 640, h: 760 },
            kind: 'right',
        });
    });

    it('阈值开闭:刚好等于阈值吸附,超出一个像素不吸附', () => {
        expect(resolveEdgeSnap({ x: snap.edge, y: 500 }, desktop, snap)?.kind).toBe('left');
        expect(resolveEdgeSnap({ x: snap.edge + 1, y: 500 }, desktop, snap)).toBeNull();
        // 顶部的阈值是"任务栏下沿 + snap.edge":指针进到任务栏下沿附近即触发.
        const topEdge = WINDOW.dockReserve + snap.edge;
        expect(resolveEdgeSnap({ x: 500, y: topEdge }, desktop, snap)?.kind).toBe('maximize');
        expect(resolveEdgeSnap({ x: 500, y: topEdge + 1 }, desktop, snap)).toBeNull();
    });
});

describe('magnetize', () => {
    const magnet = WINDOW.snap.magnet;
    const other: AbsoluteGeometry = { x: 500, y: 300, w: 400, h: 200 };

    it('x 贴到其它窗口的左/右边,只改一个轴', () => {
        const nearLeft = magnetize({ x: 504, y: 100, w: 200, h: 100 }, [other], magnet);
        expect(nearLeft).toEqual({ x: 500, y: 100, w: 200, h: 100 });

        const nearRight = magnetize({ x: 896, y: 100, w: 200, h: 100 }, [other], magnet);
        expect(nearRight.x).toBe(900);
        expect(nearRight.y).toBe(100);
    });

    it('y 贴着其它窗口的上下边', () => {
        // x 距离远在阈值外,只有 y 被修正:另一个轴不受影响.
        expect(magnetize({ x: 0, y: 296, w: 200, h: 100 }, [other], magnet).y).toBe(300);
        expect(magnetize({ x: 0, y: 496, w: 200, h: 100 }, [other], magnet).y).toBe(500);
    });

    it('最近的一条胜出;超出阈值则原样返回', () => {
        const others: AbsoluteGeometry[] = [
            { x: 500, y: 0, w: 100, h: 100 },
            { x: 506, y: 0, w: 100, h: 100 },
        ];
        expect(magnetize({ x: 503, y: 0, w: 100, h: 100 }, others, magnet).x).toBe(500);
        expect(magnetize({ x: 400, y: 0, w: 100, h: 100 }, others, magnet).x).toBe(400);
    });
});

describe('geometryStyle', () => {
    const geometry: AbsoluteGeometry = { x: 16, y: 32, w: 420, h: 260 };

    it('四条属性是 px 字符串', () => {
        expect(geometryStyle(geometry)).toEqual({
            left: '16px',
            top: '32px',
            width: '420px',
            height: '260px',
        });
    });
});

describe('窗口配置自洽', () => {
    it('五个窗口的 id / 顺序 / 最小尺寸都合法', () => {
        expect(WINDOW.windows.map((spec) => spec.id))
            .toEqual(['source', 'view', 'params', 'process', 'objects']);

        const ids = WINDOW.windows.map((spec) => spec.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const spec of WINDOW.windows) {
            expect(spec.title.length, spec.id).toBeGreaterThan(0);
            expect(spec.dock.label.length, spec.id).toBeGreaterThan(0);
            expect(spec.minSize.w, spec.id).toBeGreaterThan(0);
            expect(spec.minSize.h, spec.id).toBeGreaterThan(0);
        }
    });

    it('所有 from:bottom 的 inset 都等于 edgeGap(底边线只有一条)', () => {
        let seen = 0;
        for (const spec of WINDOW.windows) {
            for (const axis of [spec.defaultGeometry.y, spec.defaultGeometry.h, spec.defaultGeometry.x]) {
                // `x` 可省(横向 after 时由被依赖窗口算出),滤掉 undefined.
                if (axis === undefined) continue;
                if (typeof axis !== 'string' && 'from' in axis && axis.from === 'bottom') {
                    expect(axis.inset, spec.id).toBe(WINDOW.edgeGap);
                    seen += 1;
                }
            }
        }
        // objects.y + view.h + process.h 三条,少一条说明配置被改散了.
        expect(seen).toBe(3);
    });

    it('标题栏按钮的 id 与顺序固定,标题栏至少可见高度不超过标题栏高度', () => {
        expect(WINDOW.actions.map((action) => action.id)).toEqual(['minimize', 'maximize']);
        for (const action of WINDOW.actions) {
            expect(action.text.length, action.id).toBeGreaterThan(0);
        }
        expect(WINDOW.headerMinVisible).toBeLessThanOrEqual(WINDOW.headerHeight);
    });

    it('层级:窗口层在视口之上,窗口层之间递增,Dock 最高', () => {
        expect(WINDOW.z.windowLayer).toBeGreaterThan(0);
        expect(WINDOW.z.first).toBeGreaterThan(WINDOW.z.windowLayer);
        // 吸附预览画在窗口层之下(它是"窗口会落到哪里"的底图,不是前景).
        expect(WINDOW.z.snapPreview).toBeGreaterThan(0);
        expect(WINDOW.z.snapPreview).toBeLessThan(WINDOW.z.windowLayer);
        expect(WINDOW.z.dock).toBeGreaterThan(WINDOW.z.first);
    });
});
