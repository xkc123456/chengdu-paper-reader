import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { log } from "./lib/logger";
import { clientKey, take } from "./lib/ratelimit";
import { LEGAL_VERSION } from "@contracts/legal";

/**
 * 同意记录：应对「用户到底同没同意过」这类争议的唯一证据。
 *
 * 存什么：访客自己生成的 visitorId、同意的文本版本、时间戳、截断的 UA。
 * 不存 IP、不存任何可识别身份的信息——同意记录只要能证明「这台设备在这个
 * 时间点同意了哪个版本」就够，多存反而是负担。
 *
 * 存储走 Workers KV 绑定 PROFILES（与院校上报共用一个命名空间，键前缀 c:）；
 * 没配置时退化成写日志，不丢请求。
 */
export const consentRouter = createRouter({
  record: publicQuery
    .input(
      z.object({
        visitorId: z.string().uuid(),
        version: z.string().max(16),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // 同一 IP 每小时最多 10 条：同意一次就够，刷接口没有意义
      const limit = take(`consent:${clientKey(ctx.req.headers)}`, 10);
      if (!limit.ok) return { ok: false as const, reason: "rate-limited" };

      const record = {
        visitorId: input.visitorId,
        version: input.version,
        at: new Date().toISOString(),
        ua: (ctx.req.headers.get("user-agent") ?? "").slice(0, 120),
      };

      const store = ctx.env?.PROFILES;
      if (store) {
        try {
          await store.put(`c:${record.at}:${input.visitorId}`, JSON.stringify(record));
          log.info("consent saved", { version: record.version });
          return { ok: true as const, stored: "kv" as const };
        } catch (error) {
          log.error("consent kv write failed", { error: error instanceof Error ? error.message : String(error) });
        }
      }
      log.info("consent received (no storage)", record);
      return { ok: true as const, stored: "log" as const };
    }),

  /** 撤回同意：删除该访客的档案数据，只留一条撤回记录 */
  revoke: publicQuery
    .input(z.object({ visitorId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const limit = take(`revoke:${clientKey(ctx.req.headers)}`, 10);
      if (!limit.ok) return { ok: false as const, reason: "rate-limited" };

      const store = ctx.env?.PROFILES;
      let removed = 0;
      if (store) {
        try {
          // 删掉这台设备的全部阅读档案（键前缀 a:<visitorId>:）
          let cursor: string | undefined;
          do {
            const page = await store.list({ prefix: `a:${input.visitorId}:`, cursor });
            for (const key of page.keys) {
              // ProfileStore 类型里没声明 delete；KV 原生有，这里按有处理
              await (store as unknown as { delete: (key: string) => Promise<void> }).delete(key.name);
              removed += 1;
            }
            cursor = page.list_complete ? undefined : page.cursor;
          } while (cursor);
          await store.put(
            `r:${new Date().toISOString()}:${input.visitorId}`,
            JSON.stringify({ visitorId: input.visitorId, version: LEGAL_VERSION, revokedAt: new Date().toISOString(), removedArchives: removed }),
          );
        } catch (error) {
          log.error("consent revoke failed", { error: error instanceof Error ? error.message : String(error) });
        }
      }
      log.info("consent revoked", { removedArchives: removed });
      return { ok: true as const, removedArchives: removed };
    }),
});
