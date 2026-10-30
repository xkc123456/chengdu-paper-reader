/**
 * ai-client.ts — 模型调用错误的语义归类。
 *
 * 这里只做一件事：把各家 OpenAI 兼容端点抛出来的错误，翻译成调用方能直接分支的类型，
 * 调用方不必再解 HTTP 码。**本模块不重试**：计费型调用重试可能重复扣费
 * （5xx 或客户端超时都不能证明服务端没执行）。
 *
 * 旧版本还包含 `listModels()` 与平台网关的专有配置（KIMI_AGENTGW_*），那套东西只在
 * 原生成平台内可用，公开部署时是一个硬依赖，已移除：现在模型名由 LLM_MODEL 决定，
 * Key 由访客自己提供。
 */

/** 终态：额度耗尽 / 权益不可用。**不要重试** */
export class AiUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailable";
  }
}

/** 终态：内容/安全拒绝。提示用户改写输入 */
export class ContentRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentRejected";
  }
}

/** 终态：凭证无效/缺失 —— 配置问题，需要访客检查自己的 Key */
export class AiMisconfigured extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiMisconfigured";
  }
}

/** 终态：入参非法。开发期错误，应上报日志 */
export class AiInvalidRequest extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiInvalidRequest";
  }
}

/** 可重试：429 / 408 / 424 / 5xx。是否重试由调用方决定 */
export class AiTransient extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiTransient";
  }
}

interface ErrorBody {
  error?: { type?: string; message?: string; code?: string };
  message?: string;
}

/**
 * 把 HTTP 状态与 error.type 映射成带语义的类型。
 *
 * 注意：**非法枚举值网关不一定报错**（归一化后仍 200），所以枚举校验只能放在客户端。
 */
export function mapAiError(status: number, body: ErrorBody | undefined, raw: string): Error {
  const type = body?.error?.type ?? "";
  const detail = body?.error?.message ?? body?.message ?? raw.slice(0, 300);

  if (type === "access_terminated_error" || type === "insufficient_quota") {
    return new AiUnavailable("额度耗尽，请检查你自己的 API Key 余额");
  }
  if (type.includes("content") || type.includes("moderation")) {
    return new ContentRejected(detail || "内容被拒绝");
  }
  switch (status) {
    case 401:
      return new AiMisconfigured("API Key 无效或已过期，请重新填写");
    case 402:
      return new AiUnavailable("API Key 余额不足");
    case 400:
      return type === "payment_required"
        ? new AiUnavailable("API Key 余额不足")
        : new AiInvalidRequest(detail || "请求参数非法");
    case 403:
      return /quota|balance|insufficient/i.test(detail)
        ? new AiUnavailable("API Key 余额不足")
        : new ContentRejected(detail || "内容被拒绝");
    case 429:
      return new AiTransient("请求过于频繁，稍后重试");
    case 408:
    case 424:
      return new AiTransient(detail || "上游暂时不可用，稍后重试");
    default:
      if (status >= 500) return new AiTransient("服务繁忙，请稍后再试");
      return new AiInvalidRequest(detail || `请求失败（HTTP ${status}）`);
  }
}

/**
 * 把 AI SDK 抛出的错误归类成上面的类型。
 *
 * SDK 的错误里带着网关响应的状态与 body（不同版本字段名略有差异，这里都兜），
 * 拿不到结构化信息时按可重试处理 —— 网络层错误通常确实是瞬时的。
 */
export function classifyAiError(err: unknown): Error {
  if (
    err instanceof AiUnavailable ||
    err instanceof ContentRejected ||
    err instanceof AiMisconfigured ||
    err instanceof AiInvalidRequest ||
    err instanceof AiTransient
  ) {
    return err;
  }

  const anyErr = err as {
    status?: number;
    statusCode?: number;
    response?: { status?: number; body?: unknown };
    data?: unknown;
    error?: unknown;
    message?: string;
    responseBody?: unknown;
  };

  const status = anyErr?.status ?? anyErr?.statusCode ?? anyErr?.response?.status;
  let body: ErrorBody | undefined;
  // 提取优先级：结构化 data / response.body / error，最后兜 responseBody。
  // 兜底那一项是必要的：ai@6 的 APICallError 只在 body 能过 provider error
  // schema 时才带 `data`，否则只带裸 JSON 串。
  const rawBody =
    anyErr?.response?.body ?? anyErr?.data ?? anyErr?.error ?? anyErr?.responseBody;
  if (rawBody && typeof rawBody === "object") {
    body = rawBody as ErrorBody;
  } else if (typeof rawBody === "string") {
    try {
      body = JSON.parse(rawBody) as ErrorBody;
    } catch {
      body = undefined;
    }
  }

  if (typeof status === "number") {
    return mapAiError(status, body, typeof rawBody === "string" ? rawBody : "");
  }

  // 无结构化状态：HTTP 之外的错误（连接失败、超时、流中断）
  return new AiTransient(anyErr?.message || "AI 调用失败，请稍后重试");
}

/** 该错误是否值得重试（只有 AiTransient 是） */
export function isRetryableAiError(err: unknown): boolean {
  return err instanceof AiTransient;
}
