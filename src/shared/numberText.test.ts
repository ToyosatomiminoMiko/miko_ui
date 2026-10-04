import { describe, expect, it } from 'vitest';
import {
    assertEditSafe,
    assertLossless,
    formatNumber,
    formatVector,
    isNumberInputText,
    numberText,
    numberVectorText,
    NUMBER_TEXT_DISPLAY,
    NUMBER_TEXT_EDIT,
    parseNumber,
} from './numberText';

describe('formatNumber', () => {
    it('常规量级用定点并去掉尾零', () => {
        expect(formatNumber(1.5)).toBe('1.5');
        expect(formatNumber(4)).toBe('4');
        expect(formatNumber(0)).toBe('0');
        expect(formatNumber(123456.789)).toBe('123456.789');
    });

    it('负零输出为 "0"', () => {
        expect(formatNumber(-0)).toBe('0');
    });

    it('1e-4 与 1e6 是开区间边界,恰好落在边界上仍走定点', () => {
        expect(formatNumber(1e-4)).toBe('0.0001');
        expect(formatNumber(999999)).toBe('999999');
        expect(formatNumber(1e6)).toBe('1.000000e+6');
    });

    it('超出量级回退科学计数法', () => {
        expect(formatNumber(2.775558e-17)).toBe('2.775558e-17');
        expect(formatNumber(-1.25e7)).toBe('-1.250000e+7');
    });

    it('非有限值原样返回字符串', () => {
        expect(formatNumber(Number.NaN)).toBe('NaN');
        expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('Infinity');
    });
});

describe('formatVector', () => {
    it('按逗号加空格连接', () => {
        expect(formatVector([1, 2.5, -0])).toBe('[1, 2.5, 0]');
    });

    it('空数组给空方括号', () => {
        expect(formatVector([])).toBe('[]');
    });
});

/**
 * 旧的纯函数与预置必须是**同一份实现**:两套规则并存正是这次统一要消灭的东西,
 * 所以这里逐值比一遍,而不是各测各的期望值.
 */
describe('formatNumber / formatVector 就是显示档', () => {
    const PROBES = [0, -0, 1, -1, 1.5, 0.1 + 0.2, 1 / 3, 123456.789, 1e-4, 1e-5, 1e6, 1e21, -1e21];

    it('formatNumber 逐值等于 NUMBER_TEXT_DISPLAY.toText', () => {
        for (const value of PROBES) {
            expect(formatNumber(value), String(value)).toBe(NUMBER_TEXT_DISPLAY.toText(value));
        }
    });

    it('formatVector 逐值等于 numberVectorText() 的默认档', () => {
        const text = numberVectorText();
        expect(formatVector([])).toBe(text.toText([]));
        expect(formatVector([1, 2.5, -0])).toBe(text.toText([1, 2.5, -0]));
    });
});

describe('numberText:档位', () => {
    const PROBE = 0.1 + 0.2;

    it('digits 覆盖位数,trimZeros 决定是否补尾零', () => {
        expect(numberText({ digits: 2 }).toText(PROBE)).toBe('0.3');
        expect(numberText({ digits: 2, trimZeros: false }).toText(PROBE)).toBe('0.30');
        expect(numberText({ digits: 4 }).toText(1)).toBe('1');
        expect(numberText({ digits: 4, trimZeros: false }).toText(1)).toBe('1.0000');
        // 消费者侧的真实档位:String(Number(value.toFixed(4))) 等价于 digits 4 + 去尾零
        expect(numberText({ digits: 4 }).toText(1.25)).toBe('1.25');
        expect(numberText({ digits: 4 }).toText(3)).toBe('3');
    });

    it('exponentialAt 默认与 formatNumber 同值,[low, high) 是半开区间', () => {
        expect(numberText().toText(1e-4)).toBe('0.0001');
        expect(numberText().toText(1e-5)).toBe('1.000000e-5');
        expect(numberText().toText(999999)).toBe('999999');
        expect(numberText().toText(1e6)).toBe('1.000000e+6');
    });

    it('exponentialAt 与 exponentialDigits 可覆盖', () => {
        const wide = numberText({ exponentialAt: { low: 1e-6, high: 1e15 }, exponentialDigits: 2 });
        expect(wide.toText(1e6)).toBe('1000000');
        expect(wide.toText(1e-5)).toBe('0.00001');
        expect(wide.toText(1e16)).toBe('1.00e+16');
    });

    it('suffix 拼在末尾,fromText 认得带后缀与不带后缀两种写法', () => {
        const degree = numberText({ suffix: '°' });
        expect(degree.toText(0.6)).toBe('0.6°');
        expect(degree.toText(-0.25)).toBe('-0.25°');
        expect(degree.fromText('0.6°')).toBe(0.6);
        expect(degree.fromText('0.6')).toBe(0.6);
        expect(degree.fromText('°')).toBeNull();
    });

    it('digits / exponentialDigits 越界或非整数直接抛,不落到 toFixed 的 RangeError 上', () => {
        expect(() => numberText({ digits: -1 })).toThrow(TypeError);
        expect(() => numberText({ digits: 1.5 })).toThrow(TypeError);
        expect(() => numberText({ digits: 101 })).toThrow(TypeError);
        expect(() => numberText({ exponentialDigits: -1 })).toThrow(TypeError);
    });

    it('exponentialAt 不是合法的半开区间就抛', () => {
        expect(() => numberText({ exponentialAt: { low: 1, high: 1 } })).toThrow(TypeError);
        expect(() => numberText({ exponentialAt: { low: -1, high: 1 } })).toThrow(TypeError);
    });
});

/**
 * LaTeX 语法的期望值**照抄消费者侧的既有断言**:`miko_graphcalc` 的
 * `src/math/paramValue.test.ts` 钉的就是这些字符串.统一的意义在于让那份
 * "与库的 formatNumber 同一档位"的抄写可以删掉,而输出一位不差.
 */
describe("numberText:语法 'latex'", () => {
    const latex = numberText({ syntax: 'latex' });

    it('常规量级走定点去尾零', () => {
        expect(latex.toText(0)).toBe('0');
        expect(latex.toText(2)).toBe('2');
        expect(latex.toText(1.5)).toBe('1.5');
        expect(latex.toText(-0.25)).toBe('-0.25');
        expect(latex.toText(0.0001)).toBe('0.0001');
    });

    it('超出量级换成 \\times10^{n},指数丢掉正号与前导零', () => {
        expect(latex.toText(2.775558e-17)).toBe('2.775558\\times10^{-17}');
        expect(latex.toText(-2.775558e-17)).toBe('-2.775558\\times10^{-17}');
        expect(latex.toText(1.25e20)).toBe('1.25\\times10^{20}');
        expect(latex.toText(1e6)).toBe('1\\times10^{6}');
        expect(latex.toText(-1.25e7)).toBe('-1.25\\times10^{7}');
    });

    it('非有限值与纯文本档一致(交给 KaTeX 的 throwOnError=false 兜住)', () => {
        expect(latex.toText(Number.NaN)).toBe('NaN');
        expect(latex.toText(Number.POSITIVE_INFINITY)).toBe('Infinity');
    });
});

describe("numberText:语法 'edit'", () => {
    it('默认**不整舍入**:最短往返表示,fromText(toText(v)) 回到同一个数', () => {
        const edit = numberText({ syntax: 'edit' });
        expect(edit.toText(0.1 + 0.2)).toBe('0.30000000000000004');
        expect(edit.toText(1e21)).toBe('1e+21');
        expect(edit.toText(1 / 3)).toBe('0.3333333333333333');
        expect(edit.fromText(edit.toText(1 / 3))).toBe(1 / 3);
    });

    it('非有限值给空串,而不是浏览器会消毒掉的 "NaN" / "Infinity"', () => {
        const edit = numberText({ syntax: 'edit' });
        expect(edit.toText(Number.NaN)).toBe('');
        expect(edit.toText(Number.POSITIVE_INFINITY)).toBe('');
        expect(edit.fromText('')).toBeNull();
    });

    it('给了 digits 才走定点,尾零与否由 trimZeros 定', () => {
        // 站点 "页面透明度" 的档位:toFixed(2) 保尾零 -> "0.90"
        const opacity = numberText({ syntax: 'edit', digits: 2, trimZeros: false });
        expect(opacity.toText(0.9)).toBe('0.90');
        expect(opacity.toText(0.8999999999999999)).toBe('0.90');
        expect(opacity.fromText('0.90')).toBe(0.9);
        expect(numberText({ syntax: 'edit', digits: 2 }).toText(0.9)).toBe('0.9');
    });

    it('定点档把"舍入到零的负数"归到零:不吐 -0 / -0.0000', () => {
        // 默认指数门槛下 digits:2 仍走定点:|-0.001| 落在 [1e-4, 1e6) 里,而
        // toFixed(2) 给 "-0.00".负号只是舍入产物,数值上就是零.
        expect(numberText({ syntax: 'edit', digits: 2 }).toText(-0.001)).toBe('0');
        expect(numberText({ syntax: 'edit', digits: 2, trimZeros: false }).toText(-0.001)).toBe('0.00');
    });

    it('"定点 n 位去零"要逐字符等于 String(Number(v.toFixed(n)))', () => {
        // 消费者侧 ViewPanel 的旧口径就是 String(Number(v.toFixed(4))).库要复刻它
        // 必须显式关掉指数回退(默认档在 [1e-4, 1e6) 之外会切成 e 记法),再配合上面的
        // "舍入到零去符号" -- 两件事缺一条都会差字符.
        const point = numberText({
            syntax: 'edit',
            digits: 4,
            exponentialAt: { low: 0, high: Infinity },
        });
        const cases = [
            0, -0, 0.2, 1.5, 1 / 3, 0.1 + 0.2, 0.00004, -0.00004, 5e-5,
            1e-5, 1e-7, 123456.789, 1e7, 1e21, -1e21, Number.MAX_SAFE_INTEGER,
        ];
        for (const value of cases) {
            expect(point.toText(value)).toBe(String(Number(value.toFixed(4))));
        }
        expect(assertEditSafe(point)).toBe(true);
        // 非有限值:库给空串;旧写法给 "NaN"/"Infinity",而浏览器对它们做的就是
        // 消毒成空串 -- 同效,而且库这条路不必依赖浏览器的消毒.
        expect(point.toText(Number.NaN)).toBe('');
    });

    it('带 suffix 的编辑档直接抛(number 输入框会把它消毒成空串)', () => {
        expect(() => numberText({ syntax: 'edit', suffix: '%' })).toThrow(TypeError);
        // 显示档带后缀是正当用法
        expect(numberText({ syntax: 'plain', suffix: '%' }).toText(90)).toBe('90%');
    });
});

describe('NUMBER_TEXT_EDIT / NUMBER_TEXT_DISPLAY 两个预置', () => {
    it('编辑档无损且在探针上都是合法 number 输入框文本', () => {
        expect(assertLossless(NUMBER_TEXT_EDIT)).toBe(true);
        expect(assertEditSafe(NUMBER_TEXT_EDIT)).toBe(true);
    });

    it('显示档不是编辑档:NaN 的 "NaN" 不是合法 number 输入框文本', () => {
        expect(assertEditSafe(NUMBER_TEXT_DISPLAY)).toBe(false);
    });

    it('编辑档与显示档是同一个工厂的两个预置,不是两套实现', () => {
        expect(NUMBER_TEXT_EDIT.toText(2.5)).toBe(numberText({ syntax: 'edit' }).toText(2.5));
        expect(NUMBER_TEXT_DISPLAY.toText(2.5)).toBe(numberText().toText(2.5));
    });

    it('assertLossless 抓得住"定点位数少于值精度"的编辑档(用户一编辑就量化)', () => {
        const lossy = numberText({ syntax: 'edit', digits: 2, trimZeros: false });
        expect(assertEditSafe(lossy)).toBe(true);
        expect(assertLossless(lossy)).toBe(false);
    });
});

describe('isNumberInputText', () => {
    it('空串算合法(它是"这个框里没有值",不是坏文本)', () => {
        expect(isNumberInputText('')).toBe(true);
    });

    it('合法浮点语法:含负号,省略整数/小数部分,指数', () => {
        for (const text of ['0', '-0', '1', '-1', '1.', '.5', '-.5', '1e5', '1E-5', '1.25e+20']) {
            expect(isNumberInputText(text), text).toBe(true);
        }
    });

    it('会被浏览器静默清空的写法一律不合法', () => {
        for (const text of ['NaN', 'Infinity', '-Infinity', '90%', '1,234', ' 1', '1 ', '+1', '1 2', '0x10', 'abc']) {
            expect(isNumberInputText(text), text).toBe(false);
        }
    });
});

describe('parseNumber', () => {
    it('trim 后整体解析;空串与中途态为 null', () => {
        expect(parseNumber('2.5')).toBe(2.5);
        expect(parseNumber(' 3 ')).toBe(3);
        expect(parseNumber('-1e3')).toBe(-1000);
        expect(parseNumber('')).toBeNull();
        expect(parseNumber('   ')).toBeNull();
        expect(parseNumber('-')).toBeNull();
        expect(parseNumber('1e')).toBeNull();
        expect(parseNumber('.')).toBeNull();
        expect(parseNumber('abc')).toBeNull();
        expect(parseNumber('Infinity')).toBeNull();
        expect(parseNumber('NaN')).toBeNull();
    });

    it('是 NUMBER_TEXT_EDIT 的解析方向(不是第二套实现)', () => {
        for (const text of ['2.5', '', 'abc', '1e']) {
            expect(NUMBER_TEXT_EDIT.fromText(text), text).toBe(parseNumber(text));
        }
    });
});

describe('numberVectorText', () => {
    it('默认括号与分隔符', () => {
        const text = numberVectorText();
        expect(text.toText([1, 2.5, -0])).toBe('[1, 2.5, 0]');
        expect(text.toText([])).toBe('[]');
    });

    it('括号与分隔符可配,fromText 认得自己产出的形状', () => {
        const text = numberVectorText({ digits: 2, bracket: ['(', ')'], separator: '; ' });
        const rendered = text.toText([0.1 + 0.2, 4]);
        expect(rendered).toBe('(0.3; 4)');
        expect(text.fromText(rendered)).toEqual([0.3, 4]);
        expect(text.fromText('()')).toEqual([]);
    });

    it('形状不对或元素解析不出就是 null', () => {
        const text = numberVectorText();
        expect(text.fromText('1, 2')).toBeNull();
        expect(text.fromText('[1, x]')).toBeNull();
        expect(text.fromText('[]')).toEqual([]);
    });

    it('元素口径沿用同一套档位(含 suffix 与 latex 这类语法)', () => {
        expect(numberVectorText({ suffix: '°' }).toText([1, 2])).toBe('[1°, 2°]');
        expect(numberVectorText({ syntax: 'latex' }).toText([1e6])).toBe('[1\\times10^{6}]');
    });
});
