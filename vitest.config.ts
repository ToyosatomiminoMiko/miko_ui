import { defineConfig } from 'vitest/config';

/**
 * 库自己的 Vitest 配置:自包含,不继承任何外部配置.
 *
 * 库的测试只在 Node 环境里跑,不引任何应用级 setup -- 这份配置只需指定测试
 * 文件范围与运行环境,这也是 CI 里 `test` job 的依据.
 *
 * 别名一个都不配:库内一律包内相对路径.
 */
export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        environment: 'node',
    },
});
