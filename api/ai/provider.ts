import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { env } from "../lib/env";

/**
 * 模型接入：标准 OpenAI 兼容协议，默认指向 DeepSeek。
 *
 * 每次请求按「本次要用的 Key」现建一个 provider，而不是模块级单例 —— 公开站点上
 * 每个访客用的是自己的 Key，做成单例就会把多个人的凭证混在一起。
 *
 * supportsStructuredOutputs 置 false 是有意的：DeepSeek 等兼容端点只实现了
 * `response_format: json_object`，没有 OpenAI 那套 strict json_schema。置 false 后
 * AI SDK 走 JSON 模式，并把 Schema 的字段要求写进提示词，兼容性最好。
 */
export interface LlmCredential {
  apiKey: string;
  baseURL?: string;
  model?: string;
}

export function createModel({ apiKey, baseURL, model }: LlmCredential): LanguageModel {
  const provider = createOpenAICompatible({
    name: "byok",
    baseURL: baseURL || env.llmBaseUrl,
    apiKey,
    includeUsage: true,
    supportsStructuredOutputs: false,
  });
  return provider(model || env.llmModel);
}

/** 只留前 6 位做日志/报错展示，避免把整条 Key 写进任何输出 */
export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 10) return `${key.slice(0, 2)}***`;
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}
