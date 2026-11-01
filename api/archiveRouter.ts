import { z } from "zod";
import { archiveSaveInput } from "@contracts/archive";
import { createRouter, publicQuery } from "./middleware";
import { clientKey, take } from "./lib/ratelimit";
import { getArchive, isArchiveStore, listOwnArchives, listTakedownsForDevice, saveArchive, takedownArchive } from "./lib/archives";
import { isShareStore, removeShareByArchive } from "./lib/shares";
import { log } from "./lib/logger";

const MAX_PAYLOAD = 400 * 1024;

/**
 * 云存档接口。
 *
 * 只有在用户主动点「存到云端」时才会被调用；本地库（IndexedDB）仍然是默认路径。
 * 存进来的是「解析结果 +（可选）原文」，不含 Key、不含院校信息。
 */
export const archiveRouter = createRouter({
  save: publicQuery.input(archiveSaveInput).mutation(async ({ input, ctx }) => {
    const store = ctx.env?.ARCHIVE;
    if (!isArchiveStore(store)) return { ok: false as const, reason: "unavailable" as const };

    // 每人每小时 30 次：正常用户一天存不了几篇，脚本刷不动
    const gate = take(`archive:${clientKey(ctx.req.headers)}`, 30);
    if (!gate.ok) return { ok: false as const, reason: "rate-limited" as const, retryAfterSec: gate.retryAfterSec };

    const size = JSON.stringify(input.paper).length;
    if (size > MAX_PAYLOAD) return { ok: false as const, reason: "too-large" as const, size };

    const meta = await saveArchive(store, input.deviceId, input.paper);
    // 只记 id / 大小 / 是否带原文，不记标题与正文
    log.info("archive saved", { id: meta.id, size: meta.size, hasSource: meta.hasSource });
    return { ok: true as const, id: meta.id, at: meta.at };
  }),

  /** 打开自己存过的一篇（校验归属，避免拿到别人的 id 就能读） */
  get: publicQuery
    .input(z.object({ deviceId: z.string().min(8).max(64), id: z.string().min(6).max(64) }))
    .query(async ({ input, ctx }) => {
      const store = ctx.env?.ARCHIVE;
      if (!isArchiveStore(store)) return { ok: false as const, reason: "unavailable" as const };
      const record = await getArchive(store, input.id);
      if (!record || record.deviceId !== input.deviceId) return { ok: false as const, reason: "not-found" as const };
      return { ok: true as const, paper: record.paper };
    }),

  /** 自己这台设备存过什么（只有元信息，不含正文） */
  mine: publicQuery.input(z.object({ deviceId: z.string().min(8).max(64) })).query(async ({ input, ctx }) => {
    const store = ctx.env?.ARCHIVE;
    if (!isArchiveStore(store)) return { ok: false as const, reason: "unavailable" as const, items: [] };
    const items = await listOwnArchives(store, input.deviceId);
    return { ok: true as const, items };
  }),

  /** 这台设备被下架过什么（用户端提示，不含操作人/投诉人） */
  notices: publicQuery.input(z.object({ deviceId: z.string().min(8).max(64) })).query(async ({ input, ctx }) => {
    const store = ctx.env?.ARCHIVE;
    if (!isArchiveStore(store)) return { ok: false as const, items: [] };
    const items = await listTakedownsForDevice(store, input.deviceId);
    return { ok: true as const, items };
  }),

  /** 用户自己删掉一份存档（真删，不是标记） */
  remove: publicQuery
    .input(z.object({ deviceId: z.string().min(8).max(64), id: z.string().min(6).max(64) }))
    .mutation(async ({ input, ctx }) => {
      const store = ctx.env?.ARCHIVE;
      if (!isArchiveStore(store)) return { ok: false as const, reason: "unavailable" as const };
      const record = await getArchive(store, input.id);
      if (!record || record.deviceId !== input.deviceId) return { ok: false as const, reason: "not-found" as const };
      // 先撤公开链接再删存档：否则用户删了存档，旧分享地址仍然能读到内容
      const shareStore = ctx.env?.SHARE;
      const revoked = isShareStore(shareStore) ? await removeShareByArchive(shareStore, input.id) : null;
      await takedownArchive(store, input.id, "user deleted", {
        operator: "user",
        source: "self",
        shareRevoked: Boolean(revoked),
      });
      return { ok: true as const };
    }),
});
