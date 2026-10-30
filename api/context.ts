import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";

/**
 * Workers 运行时注入的绑定。这里只声明用到的那部分，
 * 避免把 @cloudflare/workers-types 整个拉进来（会和 @types/node 打架）。
 */
export interface ProfileStore {
  put(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
  list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>;
}

export type WorkerBindings = {
  /** KV 命名空间；没配时为 undefined，上报会退化成写日志 */
  PROFILES?: ProfileStore;
};

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  env?: WorkerBindings;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
  env?: WorkerBindings,
): Promise<TrpcContext> {
  return { req: opts.req, resHeaders: opts.resHeaders, env };
}
