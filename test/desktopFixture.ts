/**
 * 桌面窗口测试夹具.
 *
 * 为什么库要自带一份而不 import 应用的 `config/uiConfig`(docs/ui-library-
 * extraction-plan.md D10):库的测试不该依赖某个**消费者**的配置 -- 那等于
 * 把库的测试绑死在应用的数据上("库能不能独立跑绿"就无从判断).这份夹具的
 * 形状与真实消费者相同(5 个窗口、`after` 依赖、三种锚点、夹取常量齐全),
 * 用来把几何/状态机/z-order 这些库行为测满.
 *
 * 它**不是**应用配置的副本:应用改自己的窗口布局不必改这里,这里改夹具也不会
 * 影响应用.真实应用配置的自洽性由应用侧测试守(`src/app/appViews.test.ts`
 * 与 `src/config/*`).
 */
import type { DesktopConfig, WindowGeometrySpec } from '../src/desktop/types';

/** 夹具里的窗口 id;与库的 `WindowId`(不透明 string)不同,这里收窄成字面量. */
export type FixtureWindowId = 'source' | 'view' | 'params' | 'process' | 'objects';

/**
 * 夹具里的一个窗口:字段与 `WindowConfigEntry` 一致,只把 `id` 收窄成字面量.
 *
 * 不复用 `WindowConfigEntry` 再收窄(interface 继承不能把 `string` 变窄),
 * 而是照抄字段;两边是否仍然兼容由下面的 `DesktopConfig` 注解保证.
 */
export interface FixtureWindowEntry {
    readonly id: FixtureWindowId;
    readonly title: string;
    readonly dock: { readonly label: string };
    readonly defaultGeometry: WindowGeometrySpec;
    readonly minSize: { readonly w: number; readonly h: number };
}

/** 夹具窗口清单;可赋给库的 `DesktopConfig`. */
export interface FixtureDesktopConfig extends Omit<DesktopConfig, 'windows'> {
    readonly windows: readonly FixtureWindowEntry[];
}

/** 测试用桌面配置. */
export const TEST_DESKTOP_CONFIG: FixtureDesktopConfig = {
    windows: [
        {
            id: 'source',
            title: 'source code',
            dock: { label: '源码' },
            defaultGeometry: {
                x: { at: 16 },
                y: { at: 16 },
                w: { at: 420 },
                h: { fraction: 0.68, of: 'usableHeight' },
            },
            minSize: { w: 300, h: 220 },
        },
        {
            id: 'view',
            title: '视图',
            dock: { label: '视图' },
            defaultGeometry: {
                x: { at: 16 },
                y: { at: 0 },
                w: { at: 420 },
                h: { from: 'bottom', inset: 16 },
                after: { id: 'source', gap: 12 },
            },
            minSize: { w: 280, h: 180 },
        },
        {
            id: 'params',
            title: '参数',
            dock: { label: '参数' },
            defaultGeometry: {
                x: { from: 'right', inset: 16 },
                y: { at: 16 },
                w: { at: 420 },
                h: { fraction: 0.55, of: 'usableHeight' },
            },
            minSize: { w: 280, h: 200 },
        },
        {
            id: 'process',
            title: '过程',
            dock: { label: '过程' },
            defaultGeometry: {
                x: { from: 'right', inset: 16 },
                y: { at: 0 },
                w: { at: 420 },
                h: { from: 'bottom', inset: 16 },
                after: { id: 'params', gap: 12 },
            },
            minSize: { w: 280, h: 180 },
        },
        {
            id: 'objects',
            title: '对象',
            dock: { label: '对象' },
            defaultGeometry: {
                x: 'center',
                y: { from: 'bottom', inset: 16 },
                w: { clamp: [360, 720], inset: 2 * 436 + 32 },
                h: { at: 260 },
            },
            minSize: { w: 360, h: 160 },
        },
    ],
    actions: [
        { id: 'minimize', label: '最小化', glyph: 'min' },
        { id: 'maximize', label: '最大化', glyph: 'max' },
    ],
    edgeKeep: 80,
    edgeGap: 16,
    headerMinVisible: 36,
    dockReserve: 40,
    headerHeight: 36,
    z: { windowLayer: 100, first: 110, snapPreview: 50, dock: 200 },
    snap: { edge: 16, magnet: 8 },
};
