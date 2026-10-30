import { NoObjectGeneratedError, generateObject } from "ai";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { analysisSchema } from "@contracts/analysis";
import { createRouter, publicQuery } from "./middleware";
import { createModel, maskKey } from "./ai/provider";
import { AiInvalidRequest, AiMisconfigured, AiUnavailable, ContentRejected, classifyAiError } from "./ai/ai-client";
import { env } from "./lib/env";
import { clientKey, take } from "./lib/ratelimit";
import { log } from "./lib/logger";

const SYSTEM_PROMPT = `你是一位擅长带本科生读论文的老师。你的任务不是堆术语，而是帮助读者建立准确、清楚、可复述的理解。
请根据用户提供的论文文字输出结构化精读结果，遵守：
1. 使用通俗、细致、循循善诱的中文；先讲直觉，再讲术语，证据一栏指出原文依据。类比只能帮助理解，不能替代论文结论。
2. 先自己判断这篇论文属于什么学科、什么文体，再按该学科本身的阅读惯例拆解，不要套用固定模板：实证类论文重点拆研究问题、变量与度量、识别策略、数据与结论；规范类论文重点拆主体、权利义务、构成要件、例外与适用环节；系统与工程类论文重点拆问题、架构、数据流、算法与实验。学科判断只写进 field 字段（一句短名，不超过 6 个字，例如“经济学”“法学”“计算机”“医学”），不要在别处反复强调学科。
3. 主体与关系必须来自原文；推断出来的关系在 label 中明确写“可能/推断”。实体 id 使用 e1、e2……，关系引用必须存在。
4. comparisons 用于不同环境、组别、制度、模型、实验环节或研究阶段的分栏对照；没有可比较内容就返回空数组。
5. charts 只能使用原文明确给出的数字，严禁为了有图而编造数据。每个 series.data 必须与 labels 等长；没有足够数字就返回空数组。note 说明数据来自原文何处以及单位。
6. sections.excerpt 使用原文短句作为定位线索，不要大段复制。limitations 区分论文自身局限与输入不完整造成的限制。
7. 输入可能是 OCR 结果，先容忍轻微错字；若内容明显不足，仍尽力输出，并在 limitations 说明，不要虚构。`;

const KEY_PATTERN = /^[A-Za-z0-9\-_.:]{16,256}$/;

/**
 * 决定这次请求用谁的 Key。
 *
 * 默认（OWNER_KEY_POLICY=closed）只认访客自带的 Key：公开站点上一旦默认使用站长
 * 的 Key，任何人都能拿你的余额跑自己的论文，而且刷起来没有上限。
 * 站长自己开发调试时，把 OWNER_KEY_POLICY 设为 open 并配好 DEEPSEEK_API_KEY 即可。
 */
function resolveApiKey(visitorKey: string | undefined): { apiKey: string; source: "visitor" | "owner" } {
  const key = (visitorKey ?? "").trim();
  if (key) {
    if (!KEY_PATTERN.test(key)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "API Key 格式看起来不对：应为 20 位以上、不含空格的字母数字串，请检查是否复制完整。",
      });
    }
    return { apiKey: key, source: "visitor" };
  }
  if (env.ownerApiKey && env.ownerKeyPolicy === "open") {
    return { apiKey: env.ownerApiKey, source: "owner" };
  }
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message:
      "请先填入你自己的 API Key。本站不替访客承担模型调用费用——在 DeepSeek 控制台创建 Key 后粘贴到“我的 API Key”即可，费用按你自己账户的实际用量结算。",
  });
}

export const paperRouter = createRouter({
  analyze: publicQuery
    .input(
      z.object({
        text: z
          .string()
          .min(80, "请至少输入 80 个字符，才能进行有效拆解")
          .max(60000, "单篇最多处理 60,000 个字符"),
        apiKey: z.string().max(256).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const limit = take(clientKey(ctx.req.headers), env.rateLimitPerHour);
      if (!limit.ok) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `解析请求过于频繁，请在 ${Math.ceil(limit.retryAfterSec / 60)} 分钟后再试。`,
        });
      }

      const { apiKey, source } = resolveApiKey(input.apiKey);
      const model = createModel({ apiKey });

      try {
        const result = await generateObject({
          model,
          schema: analysisSchema,
          system: SYSTEM_PROMPT,
          prompt: `以下是论文正文或 OCR 识别文字：\n---\n${input.text}\n---`,
          maxOutputTokens: 9000,
          abortSignal: AbortSignal.timeout(180_000),
        });
        log.info("paper analysis ok", { source, key: maskKey(apiKey), chars: input.text.length });
        return result.object;
      } catch (error) {
        log.error("paper AI analysis failed", {
          source,
          key: maskKey(apiKey),
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });

        // 结构化输出失败不是网络问题：模型答了，但答的不是合法 JSON / 不满足 Schema。
        // 旧版本把它归成「服务繁忙」，用户只会看到一句 500 且不知道为什么。
        if (NoObjectGeneratedError.isInstance(error)) {
          const finish = error.finishReason;
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              finish === "length"
                ? "论文太长，模型没能在一次回答里写完结构。请分段导入，或先只解析摘要与核心章节。"
                : "模型这次没有返回可解析的结构。请重试一次；若反复失败，可缩短文本或换用更擅长长文本的模型。",
          });
        }

        const mapped = classifyAiError(error);
        if (mapped instanceof AiUnavailable) {
          throw new TRPCError({
            code: "PAYMENT_REQUIRED",
            message: "你的 API Key 额度不足或权益不可用，请充值后重试。已识别的原文不会丢失。",
          });
        }
        if (mapped instanceof AiMisconfigured) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "API Key 无效或已过期，请重新填写。",
          });
        }
        if (mapped instanceof ContentRejected) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "这段内容被模型拒绝了，请检查文字或尝试分段导入。",
          });
        }
        if (mapped instanceof AiInvalidRequest) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "论文内容或请求参数不符合要求，请缩短文本后重试。",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "模型服务暂时繁忙。为避免重复扣费，本站不会自动重试，请稍后手动重试。",
        });
      }
    }),
});
