import type { ArchiveMeta, ArchiveRecord, ArchivedPaper, TakedownRecord } from "@contracts/archive";

/** 复用 context.ts 里的 KV 形状（get / put / list），这里只补一个 delete */
export interface ArchiveStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>;
}

const KEY = {
  full: (id: string) => `a:${id}`,
  meta: (id: string) => `m:${id}`,
  takedown: (at: string, id: string) => `t:${at}:${id}`,
};

export function isArchiveStore(value: unknown): value is ArchiveStore {
  const store = value as Partial<ArchiveStore> | undefined;
  return Boolean(store && typeof store.get === "function" && typeof store.put === "function" && typeof store.delete === "function");
}

export async function saveArchive(
  store: ArchiveStore,
  deviceId: string,
  paper: ArchivedPaper,
): Promise<ArchiveMeta> {
  const payload = JSON.stringify({ ...paper, deviceId });
  const meta: ArchiveMeta = {
    id: paper.id,
    title: paper.title,
    field: paper.field,
    at: new Date(paper.createdAt || Date.now()).toISOString(),
    deviceId,
    size: payload.length,
    hasSource: Boolean(paper.sourceText),
  };
  // 两次写：a: 全文（只在「查看」时读），m: 元信息（列表只扫这个）
  await store.put(KEY.full(paper.id), payload);
  await store.put(KEY.meta(paper.id), JSON.stringify(meta));
  return meta;
}

export async function listArchives(store: ArchiveStore, limit = 200): Promise<ArchiveMeta[]> {
  const rows: ArchiveMeta[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 5 && rows.length < limit; page += 1) {
    const listed = await store.list({ prefix: "m:", limit: 100, cursor });
    const values = await Promise.all(
      listed.keys.map(async (key) => {
        const raw = await store.get(key.name);
        if (!raw) return null;
        try {
          return JSON.parse(raw) as ArchiveMeta;
        } catch {
          return null;
        }
      }),
    );
    rows.push(...(values.filter(Boolean) as ArchiveMeta[]));
    if (listed.list_complete) break;
    cursor = listed.cursor;
  }
  return rows.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}

export async function getArchive(store: ArchiveStore, id: string): Promise<ArchiveRecord | null> {
  const raw = await store.get(KEY.full(id));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ArchivedPaper & { deviceId?: string };
    const meta = await getMeta(store, id);
    return {
      id: parsed.id,
      title: parsed.title,
      field: parsed.field,
      at: meta?.at ?? new Date(parsed.createdAt).toISOString(),
      deviceId: parsed.deviceId ?? "",
      size: raw.length,
      hasSource: Boolean(parsed.sourceText),
      paper: parsed,
    };
  } catch {
    return null;
  }
}

async function getMeta(store: ArchiveStore, id: string): Promise<ArchiveMeta | null> {
  const raw = await store.get(KEY.meta(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ArchiveMeta;
  } catch {
    return null;
  }
}

/** 一键下架：删全文 + 删元信息 + 留一条下架日志（日志本身不含正文） */
export async function takedownArchive(
  store: ArchiveStore,
  id: string,
  reason: string,
): Promise<{ ok: boolean; title: string }> {
  const meta = await getMeta(store, id);
  const title = meta?.title ?? "";
  await store.delete(KEY.full(id));
  await store.delete(KEY.meta(id));
  const record: TakedownRecord = { at: new Date().toISOString(), id, title, reason };
  await store.put(KEY.takedown(record.at, id), JSON.stringify(record));
  return { ok: true, title };
}

export async function listTakedowns(store: ArchiveStore, limit = 50): Promise<TakedownRecord[]> {
  const rows: TakedownRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 2 && rows.length < limit; page += 1) {
    const listed = await store.list({ prefix: "t:", limit: 100, cursor });
    const values = await Promise.all(
      listed.keys.map(async (key) => {
        const raw = await store.get(key.name);
        if (!raw) return null;
        try {
          return JSON.parse(raw) as TakedownRecord;
        } catch {
          return null;
        }
      }),
    );
    rows.push(...(values.filter(Boolean) as TakedownRecord[]));
    if (listed.list_complete) break;
    cursor = listed.cursor;
  }
  return rows.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}

/** 某台设备自己的存档（用户端「我的云端存档」用） */
export async function listOwnArchives(store: ArchiveStore, deviceId: string): Promise<ArchiveMeta[]> {
  const all = await listArchives(store, 500);
  return all.filter((item) => item.deviceId === deviceId);
}
