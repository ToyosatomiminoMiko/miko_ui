/**
 * 浮层的落点计算:给触发件的实测矩形,浮层尺寸与视口尺寸,算出它该贴在哪.
 *
 * ## 为什么需要这一层
 *
 * 浮层的锚点(`.menu-anchor`)是零盒子(`display: contents`,见 `styles/widgets.css`):
 * 它不参与布局,也就不可能给绝对定位的 `.menu-popover` 当包含块,`top: 100%` /
 * `left: 0` 那套"相对锚点算"的写法随之失效.位置只能改成"量出来再写",而"贴下方 /
 * 贴右沿 / 翻到触发件上方"这些取舍是**纯算术**,与 DOM 无关 -- 单独放这里就能不起
 * 浏览器地测(见同名 `overlayPlacement.test.ts`),`Popover` 只负责量尺寸与写样式.
 *
 * ## 坐标口径
 *
 * 输入 / 输出一律是**视口坐标**(与 `getBoundingClientRect()` 同口径).`Popover`
 * 拿到结果后要再减去浮层所在包含块的原点,才能写成相对包含块的 `left` / `top`.
 *
 * ## 两个坐标轴的规则不对称,这是有意的
 *
 * - 横轴先按触发件左沿对齐;右边放不下就改成"右沿对右沿"(浮层整体向左长) --
 *   菜单紧贴触发件比"夹在视口里但错开 200px"重要.
 * - 纵轴先贴触发件下沿;下方放不下且上方放得下就翻到上方;上下都放不下才夹回视口.
 *   此时浮层自己的 `max-height` / 滚动接手,这里不做截断.
 * - 翻转后仍然越界时夹进视口;浮层比视口还宽 / 高时左 / 上边优先,另一边溢出.
 */

/** 触发件矩形:`DOMRect` 的只读子集,测试不必造完整 DOMRect. */
export interface OverlayTriggerRect {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly width: number;
    readonly height: number;
}

/** 浮层 / 视口的尺寸. */
export interface OverlaySize {
    readonly width: number;
    readonly height: number;
}

export interface OverlayPlacementInput {
    /** 触发件在视口里的矩形. */
    readonly trigger: OverlayTriggerRect;
    /** 浮层自己的尺寸(要先显示出来才量得到;含 min-width 的影响). */
    readonly panel: OverlaySize;
    /** 视口尺寸(`innerWidth` / `innerHeight`). */
    readonly viewport: OverlaySize;
    /** 视口四边至少留出的空白(px):贴边时阴影 / 描边不会被切. */
    readonly margin: number;
}

export interface OverlayPlacement {
    /** 浮层左上角在视口里的目标坐标. */
    readonly left: number;
    readonly top: number;
}

export function placeOverlay(input: OverlayPlacementInput): OverlayPlacement {
    const { trigger, panel, viewport, margin } = input;

    // 横轴:左沿对齐 -> 右边放不下就右沿对齐 -> 仍越界就夹(浮层比视口还宽时左边优先).
    let left = trigger.left;
    if (left + panel.width > viewport.width - margin) left = trigger.right - panel.width;
    // 夹取区间在"浮层比视口还宽"时会倒挂,先取 min 再 max 让左边优先,结果仍然是
    // 一个确定值(不会 NaN / 倒挂).
    const maxLeft = Math.max(margin, viewport.width - panel.width - margin);
    left = Math.min(Math.max(left, margin), maxLeft);

    // 纵轴:贴下沿 -> 下方放不下且上方放得下就翻上去 -> 都放不下就夹.
    let top = trigger.bottom;
    if (top + panel.height > viewport.height - margin) {
        const above = trigger.top - panel.height;
        top = above >= margin ? above : Math.max(margin, viewport.height - panel.height - margin);
    }

    return { left, top };
}
