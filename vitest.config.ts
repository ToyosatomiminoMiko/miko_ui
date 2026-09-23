import { defineConfig } from 'vitest/config';

/**
 * 库自己的 Vitest 配置:自包含,不继承任何外部配置.
 *
 * 应用级的 **wasm 初始化** setup 与 Rust/wasm 工具链只服务应用,库的测试不碰
 * 那些,所以这份配置只需要指定测试文件范围与运行环境 -- 库的 job 只用 Node
 * 就能跑绿,这也是 CI 里 `test` job 的依据.
 *
 * 别名一个都不配:库内一律包内相对路径.
 */
export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        environment: 'node',
    },
});
