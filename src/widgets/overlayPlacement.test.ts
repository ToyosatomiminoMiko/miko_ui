import { describe, expect, it } from 'vitest';

import { placeOverlay, type OverlayPlacementInput } from './overlayPlacement';

/** 触发件矩形:`left / top / width / height` 展开,`right / bottom` 由它们推出. */
function trigger(left: number, top: number, width: number, height: number) {
    return { left, top, right: left + width, bottom: top + height, width, height };
}

const VIEWPORT = { width: 1200, height: 800 };
const MARGIN = 8;

function place(input: Partial<OverlayPlacementInput> & Pick<OverlayPlacementInput, 'trigger' | 'panel'>) {
    return placeOverlay({ viewport: VIEWPORT, margin: MARGIN, ...input });
}

describe('placeOverlay', () => {
    it('默认贴在触发件左下:左沿对齐 + 下沿对齐', () => {
        expect(place({ trigger: trigger(200, 100, 60, 24), panel: { width: 220, height: 180 } }))
            .toEqual({ left: 200, top: 124 });
    });

    it('右边放不下时改成右沿对右沿(浮层整体向左长)', () => {
        // 触发件右沿 1100,浮层 220 宽:左沿对齐会到 1320 > 1200 - 8,必须翻.
        expect(place({ trigger: trigger(1040, 100, 60, 24), panel: { width: 220, height: 180 } }))
            .toEqual({ left: 880, top: 124 });
    });

    it('翻到右边仍越界(浮层比视口还宽)时把左边夹在视口内', () => {
        expect(place({ trigger: trigger(100, 100, 60, 24), panel: { width: 1300, height: 180 } }))
            .toEqual({ left: MARGIN, top: 124 });
    });

    it('下方放不下且上方放得下时翻到触发件上方', () => {
        // 下沿 764 + 180 越界;上方 740 - 180 = 560 ≥ 8,翻上去.
        expect(place({ trigger: trigger(200, 740, 60, 24), panel: { width: 220, height: 180 } }))
            .toEqual({ left: 200, top: 560 });
    });

    it('上下都放不下(浮层比视口还高)时夹在上边', () => {
        expect(place({ trigger: trigger(200, 400, 60, 24), panel: { width: 220, height: 900 } }))
            .toEqual({ left: 200, top: MARGIN });
    });

    it('触发件贴视口左沿时左沿夹到视口留白(阴影不会被切)', () => {
        expect(place({ trigger: trigger(0, 100, 60, 24), panel: { width: 220, height: 180 } }))
            .toEqual({ left: MARGIN, top: 124 });
    });

    it('视口变化后同一份输入只改宽度 / 高度:落点跟着重算(幂等,无隐藏状态)', () => {
        const input = { trigger: trigger(1040, 100, 60, 24), panel: { width: 220, height: 180 } };
        const narrow = placeOverlay({ viewport: { width: 900, height: 800 }, margin: MARGIN, ...input });
        const wide = placeOverlay({ viewport: { width: 1400, height: 800 }, margin: MARGIN, ...input });
        // 窄视口:右边放不下 -> 右沿对齐又被左边界夹回.
        expect(narrow).toEqual({ left: 672, top: 124 });
        // 宽视口:左边放得下 -> 回到左沿对齐.
        expect(wide).toEqual({ left: 1040, top: 124 });
        // 同一份输入调两次结果一致:函数不读任何模块级状态.
        expect(placeOverlay({ viewport: { width: 1400, height: 800 }, margin: MARGIN, ...input })).toEqual(wide);
    });
});
