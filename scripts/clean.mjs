/**
 * 删除构建产物目录.
 *
 * 独立成一个脚本而不是在 npm script 里写 `rm -rf`:npm script 走的是 shell,
 * Windows 上没有 `rm`.这里用 Node 自己的 fs,跨平台一致.
 */
import { rm } from 'node:fs/promises';

await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
