import type { AnalysisResult } from "@contracts/analysis";
import type { ArchiveStore } from "./archives";

/**
 * 分享：把一份「已存档」的解析结果变成只读链接。
 *
 * 键：
 *   s:<id>        分享记录（含解析结果与删除凭证的 hash）
 *   x:<archiveId> 反向索引：存档 → 分享 id，下架时用它级联删分享
 */
export interface ShareStore extends ArchiveStore {}

export interface ShareRecord {
  v: 1;
  id: string;
  archiveId: string;
  title: string;
  field: string;
  createdAt: number;
  expiresAt: number | null;
  tokenHash: string;
  result: AnalysisResult;
}

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function randomId(length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function randomToken(length = 32): string {
  return randomId(length);
}

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const key = {
  share: (id: string) => `s:${id}`,
  byArchive: (archiveId: string) => `x:${archiveId}`,
};

export function isShareStore(value: unknown): value is ShareStore {
  const store = value as Partial<ShareStore> | undefined;
  return Boolean(store && typeof store.get === "function" && typeof store.put === "function" && typeof store.delete === "function");
}

export async function createShare(
  store: ShareStore,
  input: {
    archiveId: string;
    title: string;
    field: string;
    result: AnalysisResult;
    expiresInDays: 7 | 30 | null;
    token: string;
  },
): Promise<{ record: ShareRecord; id: string }> {
  // 极低概率碰撞：命中就换一个
  let id = randomId(10);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!(await store.get(key.share(id)))) break;
    id = randomId(10);
  }
  const createdAt = Date.now();
  const record: ShareRecord = {
    v: 1,
    id,
    archiveId: input.archiveId,
    title: input.title,
    field: input.field,
    createdAt,
    expiresAt: input.expiresInDays ? createdAt + input.expiresInDays * 86_400_000 : null,
    tokenHash: await sha256Hex(input.token),
    result: input.result,
  };
  await store.put(key.share(id), JSON.stringify(record));
  await store.put(key.byArchive(input.archiveId), id);
  return { record, id };
}

export async function getShare(store: ShareStore, id: string): Promise<ShareRecord | null> {
  const raw = await store.get(key.share(id));
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as ShareRecord;
    if (record.expiresAt && Date.now() > record.expiresAt) {
      await removeShare(store, id); // 惰性清理
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

export async function removeShare(store: ShareStore, id: string): Promise<void> {
  const record = await getShareRaw(store, id);
  await store.delete(key.share(id));
  if (record?.archiveId) await store.delete(key.byArchive(record.archiveId));
}

async function getShareRaw(store: ShareStore, id: string): Promise<ShareRecord | null> {
  const raw = await store.get(key.share(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ShareRecord;
  } catch {
    return null;
  }
}

/** 下架云存档时级联：把对应的公开链接一起删掉 */
export async function removeShareByArchive(store: ShareStore, archiveId: string): Promise<string | null> {
  const id = await store.get(key.byArchive(archiveId));
  if (!id) return null;
  await removeShare(store, id);
  return id;
}

/** 存档详情里显示「这篇有没有公开链接」 */
export async function shareIdForArchive(store: ShareStore, archiveId: string): Promise<string | null> {
  return store.get(key.byArchive(archiveId));
}
