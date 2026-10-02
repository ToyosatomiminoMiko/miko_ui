/**
 * 桌面窗口测试夹具:形状与真实消费者相同(5 个窗口,两处 `after` 依赖,五种锚点
 * 写法),用来测几何 / 状态机 / z-order.
 *
 * 不 import 消费者配置:库的测试要能独立跑绿.标量(动作 / 夹取余量 / z / 吸附 /
 * 外壳尺寸)spread 库的 `DEFAULT_DESKTOP_CONFIG`,夹具只负责窗口清单.
 */
import { DEFAULT_DESKTOP_CONFIG, type DesktopConfig, type RelativeGeometry } from '../src/desktop/types';

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
    readonly defaultGeometry: RelativeGeometry;
    readonly minSize: { readonly w: number; readonly h: number };
}

/** 夹具窗口清单;可赋给库的 `DesktopConfig`. */
export interface FixtureDesktopConfig extends Omit<DesktopConfig, 'windows'> {
    readonly windows: readonly FixtureWindowEntry[];
}

/** 测试用桌面配置:标量取库的默认值,只有窗口清单是夹具自己的. */
export const TEST_DESKTOP_CONFIG: FixtureDesktopConfig = {
    ...DEFAULT_DESKTOP_CONFIG,
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
};
