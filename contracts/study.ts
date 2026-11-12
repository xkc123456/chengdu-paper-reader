/**
 * study.ts — 「复述检验」与「文献地图」的共享类型。
 *
 * 这两个功能都只跑在浏览器里（不存在服务端状态）：
 * 复述题由解析结果确定性生成，作答记录存 localStorage；
 * 文献地图由本机已存档的若干篇解析结果拼出来。
 * 所以这里只有类型，没有 zod —— 没有需要跨网络校验的载荷。
 */

/** 复述题：从已生成的解析结果里反推出来的「能不能讲出来」检查点 */
export interface RecallQuestion {
  id: string;
  /** 题型只影响标签与措辞，不影响评分逻辑 */
  kind: "问题" | "结论" | "讲解" | "机制" | "术语";
  prompt: string;
  /** 参考答案：由解析结果原样摘出，不额外生成，避免二次幻觉 */
  reference: string;
  /** 评分要点：从参考答案里切出来的短语，逐条算覆盖率 */
  points: string[];
  /** 想不起来时的提示（类比、所在章节），不直接给答案 */
  hint: string;
  /** 回原文定位：原文短句 + 所属章节 */
  anchor: { quote: string; heading?: string };
}

export type RecallVerdict = "掌握" | "基本掌握" | "需要回原文";

export interface RecallAttempt {
  questionId: string;
  answer: string;
  /** 0–1，保留三位小数 */
  score: number;
  verdict: RecallVerdict;
  hit: string[];
  missed: string[];
  at: number;
}

/** 一次「学完一篇」的存档，按论文稳定键落 localStorage */
export interface RecallRecord {
  paperKey: string;
  attempts: RecallAttempt[];
  updatedAt: number;
}

/** 文献地图里的一行 = 一篇已存档论文 */
export interface MapRow {
  id: string;
  title: string;
  field: string;
  question: string;
  claim: string;
  method: string;
  data: string;
  limitations: string[];
  keywords: string[];
}

/** 主题簇：被两篇及以上同时提到的关键词 */
export interface ThemeCluster {
  keyword: string;
  titles: string[];
}
