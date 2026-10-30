import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { log } from "./lib/logger";
import { clientKey, take } from "./lib/ratelimit";

/**
 * 使用者信息上报。
 *
 * 刻意只收「院校 + 学院 + 专业 + 学历层次」这类群体属性：够用来判断哪个学校哪个
 * 专业在用，又不至于把一个人认出来（不收姓名、手机号、邮箱、精确 IP 不落库）。
 *
 * 存储走 Workers KV 绑定 PROFILES；没配绑定时退化成写日志，不会丢请求、也不报错，
 * 站长至少能用 `wrangler tail` 看到。
 */

const DEGREES = ["高中及以下", "专科", "本科", "硕士研究生", "博士研究生及以上"] as const;

const profileSchema = z.object({
  region: z.string().min(1).max(32),
  city: z.string().max(32).default(""),
  school: z.string().min(1).max(64),
  college: z.string().max(64).default(""),
  major: z.string().min(1).max(64),
  degree: z.enum(DEGREES),
});

export const profileRouter = createRouter({
  submit: publicQuery.input(profileSchema).mutation(async ({ input, ctx }) => {
    // 同一个 IP 每小时最多 20 条：正常人填一次就够，脚本刷不出量
    const limit = take(`profile:${clientKey(ctx.req.headers)}`, 20);
    if (!limit.ok) return { ok: false as const, reason: "rate-limited" };

    const record = {
      ...input,
      at: new Date().toISOString(),
      // UA 只留前 120 字，用于区分手机/桌面，不构成身份识别
      ua: (ctx.req.headers.get("user-agent") ?? "").slice(0, 120),
    };

    const store = ctx.env?.PROFILES;
    if (store) {
      try {
        await store.put(`p:${record.at}:${crypto.randomUUID()}`, JSON.stringify(record));
        log.info("profile saved", { school: record.school, degree: record.degree, region: record.region });
        return { ok: true as const, stored: "kv" as const };
      } catch (error) {
        log.error("profile kv write failed", { error: error instanceof Error ? error.message : String(error) });
      }
    }

    // 没有 KV 绑定（或写入失败）：至少让记录进日志
    log.info("profile received (no storage)", record);
    return { ok: true as const, stored: "log" as const };
  }),
});
