import type { TicketInput, TicketRecord } from "@contracts/ticket";
import type { ArchiveStore } from "./archives";

/**
 * 投诉 / 申诉工单，存在 ARCHIVE 这个 KV 里（前缀 k:），不额外开命名空间。
 * 键：k:<ISO 时间>:<随机 id>，值：TicketRecord。
 */
const PREFIX = "k:";

function randomId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function addTicket(store: ArchiveStore, input: TicketInput): Promise<TicketRecord> {
  const id = randomId();
  const at = new Date().toISOString();
  const record: TicketRecord = { ...input, id, at, status: "open" };
  await store.put(`${PREFIX}${at}:${id}`, JSON.stringify(record));
  return record;
}

async function readAll(store: ArchiveStore, limit = 100): Promise<TicketRecord[]> {
  const rows: TicketRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 3 && rows.length < limit; page += 1) {
    const listed = await store.list({ prefix: PREFIX, limit: 100, cursor });
    const values = await Promise.all(
      listed.keys.map(async (key) => {
        const raw = await store.get(key.name);
        if (!raw) return null;
        try {
          return JSON.parse(raw) as TicketRecord;
        } catch {
          return null;
        }
      }),
    );
    rows.push(...(values.filter(Boolean) as TicketRecord[]));
    if (listed.list_complete) break;
    cursor = listed.cursor;
  }
  return rows.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}

export async function listTickets(store: ArchiveStore, limit = 100): Promise<TicketRecord[]> {
  return readAll(store, limit);
}

export async function markTicketDone(store: ArchiveStore, id: string): Promise<boolean> {
  const rows = await readAll(store, 500);
  const found = rows.find((row) => row.id === id);
  if (!found) return false;
  await store.put(`${PREFIX}${found.at}:${found.id}`, JSON.stringify({ ...found, status: "done" }));
  return true;
}
