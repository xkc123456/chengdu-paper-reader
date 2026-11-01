import { ticketInput } from "@contracts/ticket";
import { createRouter, publicQuery } from "./middleware";
import { clientKey, take } from "./lib/ratelimit";
import { addTicket } from "./lib/tickets";
import { isArchiveStore } from "./lib/archives";
import { log } from "./lib/logger";

/**
 * 投诉 / 申诉：任何人（包括权利人）都能提交，不需要账号。
 * 每 IP 每小时 5 条，防止刷屏；内容只进后台，不会公开。
 */
export const ticketRouter = createRouter({
  submit: publicQuery.input(ticketInput).mutation(async ({ input, ctx }) => {
    const store = ctx.env?.ARCHIVE;
    if (!isArchiveStore(store)) return { ok: false as const, reason: "unavailable" as const };

    const gate = take(`ticket:${clientKey(ctx.req.headers)}`, 5);
    if (!gate.ok) return { ok: false as const, reason: "rate-limited" as const, retryAfterSec: gate.retryAfterSec };

    const record = await addTicket(store, input);
    // 只记 id 和类型，正文不进日志
    log.info("ticket submitted", { id: record.id, kind: record.kind });
    return { ok: true as const, id: record.id };
  }),
});
