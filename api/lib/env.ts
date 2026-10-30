import path from "path";

// 所有配置都是可选的：一个变量都不配，站点也能起来并展示内置示例。
// 只有「真正发起 AI 解析」时才会因为缺 Key 而报错，且报错信息直接告诉访客该做什么。
//
// 旧版本在 production 下强制要求 APP_ID / APP_SECRET / DATABASE_URL —— 这三个变量由
// 生成平台注入，本项目一行都没用到，结果是部署到任何托管平台都启动即崩。

function text(name: string): string {
  return (process.env[name] ?? "").trim();
}

function int(name: string, fallback: number): number {
  const parsed = Number.parseInt(text(name), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** 站长额度策略：closed = 只认访客自带的 Key；open = 访客没带 Key 时借用站长自己的 */
export type OwnerKeyPolicy = "closed" | "open";

function ownerKeyPolicy(): OwnerKeyPolicy {
  return text("OWNER_KEY_POLICY") === "open" ? "open" : "closed";
}

/** Cloudflare Workers 没有文件系统：用 WebSocketPair 作为运行时标记，把文件日志旁路掉 */
const isCloudflareWorkers =
  typeof (globalThis as { WebSocketPair?: unknown }).WebSocketPair !== "undefined";

function defaultLogDir(): string {
  if (isCloudflareWorkers) return "";
  try {
    return path.join(process.cwd(), ".data", "logs");
  } catch {
    return "";
  }
}

export const env = {
  isProduction: process.env.NODE_ENV === "production",
  isCloudflareWorkers,
  port: int("PORT", 3000),
  /** 站长自己的模型 Key；仅当 ownerKeyPolicy=open 时才会被访客请求借用 */
  ownerApiKey: text("DEEPSEEK_API_KEY"),
  ownerKeyPolicy: ownerKeyPolicy(),
  /** 访客自带 Key 时使用的接入点，默认 DeepSeek（OpenAI 兼容协议） */
  llmBaseUrl: text("LLM_BASE_URL") || "https://api.deepseek.com/v1",
  llmModel: text("LLM_MODEL") || "deepseek-chat",
  /** 每个 IP 每小时的解析次数上限：即使有人刷，消耗的也是他自己那份 Key */
  rateLimitPerHour: int("RATE_LIMIT_PER_HOUR", 30),
  logDir: text("LOG_DIR") || defaultLogDir(),
};
