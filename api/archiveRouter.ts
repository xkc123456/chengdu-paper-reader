import { z } from "zod";
import { analysisSchema } from "@contracts/analysis";
import { createRouter, publicQuery } from "./middleware";
import { log } from "./lib/logger";
import { clientKey, take } from "./lib/ratelimit";

/**
 * 阅读档案：经用户同意后，把论文原文和拆解结果存下来供回看（隐私政策第一节第 2 条）。
 *
 * 没有账号体系，所以用浏览器生成的 visitorId 作键：同一台设备能看到、能删自己的
 * 档案；换设备互不可见，也不需要登录。键形如 a:<visitorId>:<毫秒时间戳>。
 *
 * 有意的取舍：
 * - 每设备最多 20 篇，超过要手动删——公开站点的 KV 不是免费网盘；
 * - 写入按 IP 限流，防脚本灌库；
 * - 没配 KV（本地开发）时明确返回 unsupported，前端提示「当前环境未开启档案」，
 *   而不是悄悄丢掉用户以为存下来的东西。
 */
const MAX_ARCHIVES = 20;

const archiveValue = z.object({
  title: z.string().max(120),
  field: z.string().max(24),
  savedAt: z.string(),
  text: z.string().max(60000),
  result: analysisSchema,
});
type ArchiveValue = z.infer<typeof archiveValue>;

export const archiveRouter = createRouter({
  save: publicQuery
    .input(
      z.object({
        visitorId: z.string().uuid(),
        title: z.string().min(1).max(120),
        field: z.string().max(24),
        text: z.string().min(80).max(60000),
        result: analysisSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const store = ctx.env?.PROFILES;
      if (!store) return { ok: false as const, reason: "unsupported" as const };

      const limit = take(`archive:${clientKey(ctx.req.headers)}`, 30);
      if (!limit.ok) return { ok: false as const, reason: "rate-limited" as const };

      try {
        const existing = await store.list({ prefix: `a:${input.visitorId}:`, limit: MAX_ARCHIVES + 1 });
        if (existing.keys.length >= MAX_ARCHIVES) {
          return { ok: false as const, reason: "full" as const };
        }
        const value: ArchiveValue = {
          title: input.title,
          field: input.field,
          savedAt: new Date().toISOString(),
          text: input.text,
          result: input.result,
        };
        const id = `${Date.now()}`;
        await store.put(`a:${input.visitorId}:${id}`, JSON.stringify(value));
        return { ok: true as const, id };
      } catch (error) {
        log.error("archive save failed", { error: error instanceof Error ? error.message : String(error) });
        return { ok: false as const, reason: "error" as const };
      }
    }),

  list: publicQuery
    .input(z.object({ visitorId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const store = ctx.env?.PROFILES;
      if (!store) return { ok: false as const, reason: "unsupported" as const, items: [] as { id: string; title: string; field: string; savedAt: string }[] };

      const limit = take(`archive-list:${clientKey(ctx.req.headers)}`, 60);
      if (!limit.ok) return { ok: false as const, reason: "rate-limited" as const, items: [] as { id: string; title: string; field: string; savedAt: string }[] };

      try {
        const page = await store.list({ prefix: `a:${input.visitorId}:`, limit: MAX_ARCHIVES });
        const items = await Promise.all(
          page.keys.map(async (key) => {
            const raw = await store.get(key.name);
            if (!raw) return null;
            try {
              const value = JSON.parse(raw) as ArchiveValue;
              return {
                id: key.name.slice(`a:${input.visitorId}:`.length),
                title: value.title,
                field: value.field,
                savedAt: value.savedAt,
              };
            } catch {
              return null;
            }
          }),
        );
        return {
          ok: true as const,
          items: items
            .filter((item): item is NonNullable<typeof item> => item !== null)
            .sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
        };
      } catch (error) {
        log.error("archive list failed", { error: error instanceof Error ? error.message : String(error) });
        return { ok: false as const, reason: "error" as const, items: [] as { id: string; title: string; field: string; savedAt: string }[] };
      }
    }),

  get: publicQuery
    .input(z.object({ visitorId: z.string().uuid(), id: z.string().regex(/^\d{1,20}$/) }))
    .query(async ({ input, ctx }) => {
      const store = ctx.env?.PROFILES;
      if (!store) return { ok: false as const, reason: "unsupported" as const };
      const limit = take(`archive-get:${clientKey(ctx.req.headers)}`, 60);
      if (!limit.ok) return { ok: false as const, reason: "rate-limited" as const };
      try {
        const raw = await store.get(`a:${input.visitorId}:${input.id}`);
        if (!raw) return { ok: false as const, reason: "missing" as const };
        return { ok: true as const, item: JSON.parse(raw) as ArchiveValue };
      } catch (error) {
        log.error("archive get failed", { error: error instanceof Error ? error.message : String(error) });
        return { ok: false as const, reason: "error" as const };
      }
    }),

  remove: publicQuery
    .input(z.object({ visitorId: z.string().uuid(), id: z.string().regex(/^\d{1,20}$/) }))
    .mutation(async ({ input, ctx }) => {
      const store = ctx.env?.PROFILES;
      if (!store) return { ok: false as const, reason: "unsupported" as const };
      const limit = take(`archive-del:${clientKey(ctx.req.headers)}`, 60);
      if (!limit.ok) return { ok: false as const, reason: "rate-limited" as const };
      try {
        await (store as unknown as { delete: (key: string) => Promise<void> }).delete(`a:${input.visitorId}:${input.id}`);
        return { ok: true as const };
      } catch (error) {
        log.error("archive delete failed", { error: error instanceof Error ? error.message : String(error) });
        return { ok: false as const, reason: "error" as const };
      }
    }),
});
