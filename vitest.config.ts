import { defineConfig } from 'vitest/config';

/**
 * 库自己的 Vitest 配置:自包含,不继承任何外部配置.
 *
 * 库的测试只在 Node 环境里跑,不引任何应用级 setup -- 这份配置只需指定测试
 * 文件范围与运行环境,这也是 CI 里 `test` job 的依据.
 *
 * 测试文件有两处,都是库自己的:
 *   - `src/**` 下的 `*.test.ts`   组件/模块测试,挨着被测代码;
 *   - `test/**` 下的 `*.test.ts`  跨模块的契约测试(如"库产出的类名都有默认样式"),
 *                                 与 `test/` 下的夹具(`domStub` / `desktopFixture`)同处.
 *
 * 别名一个都不配:库内一律包内相对路径.
 */
export default defineConfig({
    test: {
        include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
        environment: 'node',
    },
});
