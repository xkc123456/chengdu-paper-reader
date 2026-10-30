// 单进程内存限流。
//
// 目的只有一个：在公开网址上，让「一个人反复点解析」不至于把服务器和下游模型
// 打满（模型额度本身由访客自己的 Key 承担，见 api/paperRouter.ts）。
// 多实例部署时每个实例各自计数，因此这是「防止误触和脚本刷」的粗粒度闸门，
// 不是精确配额系统；真要严格配额得换 Redis，这里刻意不引入外部依赖。

const WINDOW_MS = 60 * 60 * 1000;
const MAX_TRACKED_KEYS = 5000;

const hits = new Map<string, number[]>();
let lastSweep = 0;

function sweep(now: number): void {
  if (now - lastSweep < WINDOW_MS) return;
  lastSweep = now;
  for (const [key, timestamps] of hits) {
    const fresh = timestamps.filter((stamp) => now - stamp < WINDOW_MS);
    if (fresh.length) hits.set(key, fresh);
    else hits.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function take(key: string, limit: number, now = Date.now()): RateLimitResult {
  if (limit <= 0) return { ok: true, remaining: Number.POSITIVE_INFINITY, retryAfterSec: 0 };
  sweep(now);

  const recent = (hits.get(key) ?? []).filter((stamp) => now - stamp < WINDOW_MS);
  if (recent.length >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((WINDOW_MS - (now - recent[0])) / 1000));
    hits.set(key, recent);
    return { ok: false, remaining: 0, retryAfterSec };
  }

  recent.push(now);
  // Map 只保留最近活跃的一批 key，避免被伪造 IP 撑爆内存
  if (hits.size > MAX_TRACKED_KEYS && !hits.has(key)) hits.delete(hits.keys().next().value as string);
  hits.set(key, recent);
  return { ok: true, remaining: limit - recent.length, retryAfterSec: 0 };
}

/** 从反代头里取真实客户端 IP；取不到就归到同一个桶里 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? headers.get("cf-connecting-ip") ?? "unknown";
}
