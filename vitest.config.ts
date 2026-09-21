import { defineConfig } from 'vitest/config';

/**
 * 库自己的 Vitest 配置.
 *
 * 为什么单独一份(而不是继承仓库根目录的):根配置里挂了一个 **wasm 初始化**
 * setup(`src/testing/setupWasm.ts`),那是给应用的解析器/Rust 集成测试用的.
 * 库的测试一个字节都不碰 `@/generated`(附录 C5),所以库的 job 不需要
 * Rust/wasm 工具链 —— 这份配置就是"库能独立跑绿"的那条口径,也是 CI 里
 * `ui` job 的依据.
 *
 * 别名一个都不配:库内一律包内相对路径(计划 §7.2/R4),所以这里只需要
 * 指定测试文件范围.
 */
export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        environment: 'node',
    },
});
