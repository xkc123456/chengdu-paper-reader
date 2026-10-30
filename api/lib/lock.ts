// 站点暂停开关：存在 KV 的 cfg:lock 里，后台一键切换。
//
// 为什么放 KV：Workers 是无状态的，多实例同时在线，必须有一个共享的开关；
// KV 的读延迟在秒级、全球最终一致，对这个场景（人工切换、几分钟内生效）完全够用。

export interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface LockState {
  locked: boolean;
  message: string;
  /** 切换时间，便于排查"是谁什么时候关的" */
  at?: string;
}

const KEY = "cfg:lock";
export const DEFAULT_LOCK_MESSAGE = "站点正在维护，暂停使用，请稍后再来。";

export async function readLock(store?: KvLike): Promise<LockState> {
  if (!store) return { locked: false, message: "" };
  try {
    const raw = await store.get(KEY);
    if (!raw) return { locked: false, message: "" };
    const parsed = JSON.parse(raw) as Partial<LockState>;
    return {
      locked: parsed.locked === true,
      message: typeof parsed.message === "string" ? parsed.message : "",
      at: parsed.at,
    };
  } catch {
    // KV 读失败时按「未锁」处理：宁可让人用，也不要因为读不到配置把站点锁死
    return { locked: false, message: "" };
  }
}

export async function writeLock(store: KvLike, state: LockState): Promise<void> {
  await store.put(KEY, JSON.stringify(state));
}
