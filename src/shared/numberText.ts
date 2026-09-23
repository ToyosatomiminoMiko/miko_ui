/**
 * 数值/向量的纯文本格式化.
 *
 * 产出的是**纯文本**:能直接展示,也能拼进别的字符串,不依赖排版渲染器.
 * 因此科学计数法刻意写成 `e+n`(`1.000000e+6`),而不是 `\times10^{n}` 这类
 * 需要 LaTeX/KaTeX 才能排出来的写法.
 */

/** 数值 -> 紧凑纯文本:非有限值原样返回,其余定点优先(去尾零),超出量级回退科学计数法. */
export function formatNumber(value: number): string {
    if (!Number.isFinite(value)) return String(value);
    const magnitude = Math.abs(value);
    if ((magnitude >= 1e-4 && magnitude < 1e6) || value === 0) {
        return value
            .toFixed(6)
            .replace(/\.?0+$/, '');
    }
    return value.toExponential(6);
}

/** 数值数组 -> `[1, 2, 3]`. */
export function formatVector(value: readonly number[]): string {
    return `[${value.map((item) => formatNumber(item)).join(', ')}]`;
}
