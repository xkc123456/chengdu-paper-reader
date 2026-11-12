import type { WorkerBindings } from "../context";

/**
 * Node 侧的默认绑定。
 *
 * Workers 由平台注入 KV（c.env.ARCHIVE），Node 下 c.env 是空的——于是本地跑起来时
 * 「存到云端」「文献地图」全都是 unavailable，功能看起来像没做。
 *
 * 这里放一个进程级默认值：api/server.ts（仅 Node 入口）启动时把本地文件存储塞进来，
 * boot.ts 组装上下文时先铺默认值、再用平台绑定覆盖。
 * 之所以单独一个文件而不是直接写在 boot.ts：node:fs 不能进 Workers 的依赖图。
 */
let defaults: WorkerBindings = {};

export function setDefaultBindings(bindings: WorkerBindings): void {
  defaults = { ...defaults, ...bindings };
}

export function getDefaultBindings(): WorkerBindings {
  return defaults;
}
