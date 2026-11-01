import { shareCreateInput, shareGetInput, shareRemoveInput } from "@contracts/share";
import { createRouter, publicQuery } from "./middleware";
import { clientKey, take } from "./lib/ratelimit";
import { createShare, getShare, isShareStore, randomToken, removeShare, sha256Hex, shareIdForArchive } from "./lib/shares";
import { getArchive, isArchiveStore } from "./lib/archives";
import { log } from "./lib/logger";

const MAX_PAYLOAD = 400 * 1024;

/**
 * 分享接口：把「已存到云端」的一篇变成只读链接。
 * 分享必须先有云存档 —— 这样站长下架存档时能级联删掉链接，闭环才成立。
 */
export const shareRouter = createRouter({
  create: publicQuery.input(shareCreateInput).mutation(async ({ input, ctx }) => {
    const shareStore = ctx.env?.SHARE;
    const archiveStore = ctx.env?.ARCHIVE;
    if (!isShareStore(shareStore) || !isArchiveStore(archiveStore)) {
      return { ok: false as const, reason: "unavailable" as const };
    }

    const gate = take(`share:${clientKey(ctx.req.headers)}`, 10);
    if (!gate.ok) return { ok: false as const, reason: "rate-limited" as const, retryAfterSec: gate.retryAfterSec };

    // 只能分享自己的存档
    const archive = await getArchive(archiveStore, input.archiveId);
    if (!archive || archive.deviceId !== input.deviceId) {
      return { ok: false as const, reason: "not-found" as const };
    }

    if (JSON.stringify(input.result).length > MAX_PAYLOAD) {
      return { ok: false as const, reason: "too-large" as const };
    }

    const token = randomToken(32);
    // 一篇存档只保留一个公开链接：重新生成即替换旧的。
    // 旧版只覆盖 x:<archiveId> 索引、不删旧 s:<id>，于是下架时级联不到旧链接，
    // 用户以为"链接已失效"，实际旧地址仍能读到完整解析结果。
    const previous = await shareIdForArchive(shareStore, input.archiveId);
    if (previous) await removeShare(shareStore, previous);

    const { record, id } = await createShare(shareStore, {
      archiveId: input.archiveId,
      title: input.title,
      field: input.field,
      result: input.result,
      expiresInDays: input.expiresInDays,
      token,
    });

    const origin = new URL(ctx.req.url).origin;
    log.info("share created", { id, archiveId: input.archiveId, hasExpiry: Boolean(record.expiresAt) });
    return {
      ok: true as const,
      id,
      url: `${origin}/s/${id}`,
      deleteToken: token,
      expiresAt: record.expiresAt,
    };
  }),

  get: publicQuery.input(shareGetInput).query(async ({ input, ctx }) => {
    const store = ctx.env?.SHARE;
    if (!isShareStore(store)) return { ok: false as const, reason: "unavailable" as const };
    const record = await getShare(store, input.id);
    if (!record) return { ok: false as const, reason: "not-found" as const };
    return {
      ok: true as const,
      title: record.title,
      field: record.field,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      result: record.result,
    };
  }),

  remove: publicQuery.input(shareRemoveInput).mutation(async ({ input, ctx }) => {
    const store = ctx.env?.SHARE;
    if (!isShareStore(store)) return { ok: false as const, reason: "unavailable" as const };
    const record = await getShare(store, input.id);
    if (!record) return { ok: false as const, reason: "not-found" as const };
    const hash = await sha256Hex(input.token);
    if (hash !== record.tokenHash) return { ok: false as const, reason: "forbidden" as const };
    await removeShare(store, input.id);
    log.info("share removed", { id: input.id });
    return { ok: true as const };
  }),
});
