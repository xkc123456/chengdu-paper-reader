import { generateObject } from "ai";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { analysisSchema } from "@contracts/analysis";
import { createRouter, publicQuery } from "./middleware";
import { kimiGw } from "./ai/provider";
import { log } from "./lib/logger";
import {
  AiInvalidRequest,
  AiMisconfigured,
  AiUnavailable,
  ContentRejected,
  classifyAiError,
  listModels,
} from "./ai/ai-client";

const SYSTEM_PROMPT = `你是一位擅长带本科生读论文的老师。你的任务不是堆术语，而是帮助读者建立准确、清楚、可复述的理解。
请根据用户提供的论文文字输出结构化精读结果，遵守：
1. 使用通俗、细致、循循善诱的中文；先讲直觉，再讲术语，证据一栏指出原文依据。类比只能帮助理解，不能替代论文结论。
2. 优先适配经管论文，其次法律，再次人工智能与电子信息（软件方向）。按学科调整：经管重点拆研究问题、变量、机制、数据与结论；法律重点拆主体、权利义务、构成要件、例外与适用环节；软件重点拆问题、架构、数据流、算法与实验。
3. 主体与关系必须来自原文；推断出来的关系在 label 中明确写“可能/推断”。实体 id 使用 e1、e2……，关系引用必须存在。
4. comparisons 用于不同环境、组别、制度、模型、实验环节或研究阶段的分栏对照；没有可比较内容就返回空数组。
5. charts 只能使用原文明确给出的数字，严禁为了有图而编造数据。每个 series.data 必须与 labels 等长；没有足够数字就返回空数组。note 说明数据来自原文何处以及单位。
6. sections.excerpt 使用原文短句作为定位线索，不要大段复制。limitations 区分论文自身局限与输入不完整造成的限制。
7. 输入可能是 OCR 结果，先容忍轻微错字；若内容明显不足，仍尽力输出，并在 limitations 说明，不要虚构。`;

export const paperRouter = createRouter({
  analyze: publicQuery
    .input(z.object({
      text: z.string().min(80, "请至少输入 80 个字符，才能进行有效拆解").max(60000, "单篇最多处理 60,000 个字符"),
      focus: z.enum(["自动", "经管", "法律", "人工智能与电子信息"]).default("自动"),
    }))
    .mutation(async ({ input }) => {
      try {
        const { defaultModelId } = await listModels();
        const result = await generateObject({
          model: kimiGw(defaultModelId),
          schema: analysisSchema,
          system: SYSTEM_PROMPT,
          prompt: `学科侧重：${input.focus}\n\n以下是论文正文或 OCR 识别文字：\n---\n${input.text}\n---`,
          providerOptions: { "kimi-gw": { max_completion_tokens: 9000 } },
        });
        return result.object;
      } catch (error) {
        log.error("paper AI analysis failed", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        const mapped = classifyAiError(error);
        if (mapped instanceof AiUnavailable) {
          throw new TRPCError({ code: "FORBIDDEN", message: "AI 额度已耗尽，请站点管理员充值后再试。已识别的原文不会丢失。" });
        }
        if (mapped instanceof AiMisconfigured) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "AI 服务尚未完成配置，请重新打开或发布站点后再试。" });
        }
        if (mapped instanceof ContentRejected) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "这段内容暂时无法处理，请检查文字或尝试分段导入。" });
        }
        if (mapped instanceof AiInvalidRequest) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "论文内容或请求参数不符合要求，请缩短文本后重试。" });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI 服务暂时繁忙。为避免重复消耗额度，请稍后手动重试。" });
      }
    }),
});
