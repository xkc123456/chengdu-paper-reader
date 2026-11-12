import fs from "node:fs";
import path from "node:path";
import type { ArchiveStore } from "./archives";

/**
 * localstore.ts — 没有 Cloudflare KV 时的本地替代。
 *
 * 只在 Node 入口（api/server.ts）里 import：Workers 侧用平台 KV，不需要也不该把
 * node:fs 带进那条依赖图。
 *
 * 形状与 KV 一致（get/put/delete/list，含 prefix + cursor），所以 archive/share 的
 * 业务代码一行都不用改。数据落在 .data/store/<name>.json（已在 .gitignore 里）。
 *
 * 取舍：写操作串行化并整体重写文件。存档是低频写（一次点击一次），
 * 整体重写在几十篇的量级下完全够用，换来的是「断电也不会写坏一半」的简单性。
 */
export function createLocalStore(dir: string, name: string): ArchiveStore {
  const file = path.join(dir, `${name}.json`);
  let cache: Record<string, string> | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  const load = (): Record<string, string> => {
    if (cache) return cache;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
      cache = parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
    } catch {
      cache = {};
    }
    return cache;
  };

  const persist = async (): Promise<void> => {
    await fs.promises.mkdir(dir, { recursive: true });
    const tmp = `${file}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(cache ?? {}), "utf8");
    await fs.promises.rename(tmp, file);
  };

  // 串行执行：并发 put/delete 不会互相覆盖
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task, task);
    queue = next.catch(() => undefined);
    return next;
  };

  return {
    async get(key) {
      return load()[key] ?? null;
    },

    put(key, value) {
      return serial(async () => {
        load()[key] = value;
        await persist();
      });
    },

    delete(key) {
      return serial(async () => {
        delete load()[key];
        await persist();
      });
    },

    async list(options) {
      const prefix = options?.prefix ?? "";
      const limit = options?.limit ?? 100;
      const start = options?.cursor ? Number.parseInt(options.cursor, 10) || 0 : 0;
      const keys = Object.keys(load())
        .filter((key) => key.startsWith(prefix))
        .sort();
      const page = keys.slice(start, start + limit);
      const done = start + limit >= keys.length;
      return {
        keys: page.map((key) => ({ name: key })),
        list_complete: done,
        cursor: done ? undefined : String(start + limit),
      };
    },
  };
}
