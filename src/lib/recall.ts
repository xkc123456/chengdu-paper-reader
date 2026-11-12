import type { AnalysisResult } from "@contracts/analysis";
import type { RecallAttempt, RecallQuestion, RecallVerdict } from "@contracts/study";

/**
 * recall.ts — 把「读过了」变成「讲得出来」。
 *
 * 设计取舍：题目**不调用模型**，全部从已有的解析结果反推。
 * 理由有二：
 *   1. 复述题考的是读者，不是模型；再调一次模型去出题，既费钱又引入新的幻觉。
 *   2. 由解析结果生成的题，天然带「参考答案」和「原文定位」，评分可以完全本地化、
 *      可复现、可测试 —— 这正是「工具」和「聊天」的区别。
 */

const MAX_QUESTIONS = 8;
const SPLIT_PUNCT = /[，。；：、（）()《》“”"'‘’!?！？\s]+/g;
/** 切短语时先断这些虚词，剩下的多半是名词性成分 */
const CONNECTORS = /[对与和的及在为是被把将中]/g;

/** 去标点、去空白，保留中英文数字，用于比对 */
export function normalize(text: string): string {
  return text.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, "").toLowerCase();
}

export function bigrams(text: string): string[] {
  const t = normalize(text);
  if (t.length <= 2) return t ? [t] : [];
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i += 1) out.push(t.slice(i, i + 2));
  return out;
}

/**
 * 从一句话里切出 2–3 个可作为「评分要点」的短语。
 *
 * 不做真正的分词（不引第三方依赖）：先按标点切，再按虚词切一层，
 * 只保留 3–14 字的片段，按出现顺序去重。切不出来就返回空数组，
 * 调用方退化成「整句比覆盖率」，不会因此崩掉。
 */
export function keyPoints(text: string, limit = 3): string[] {
  const segments = text
    .split(SPLIT_PUNCT)
    .flatMap((segment) => [segment, ...segment.split(CONNECTORS)])
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= 3 && segment.length <= 14);

  const seen = new Set<string>();
  const points: string[] = [];
  for (const segment of segments) {
    const key = normalize(segment);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    points.push(segment);
    if (points.length >= limit) break;
  }
  return points;
}

/** 一个要点被答出来的比例：完全包含记 1，否则按字符二元组覆盖率记 0–1 */
export function pointCoverage(point: string, answer: string): number {
  const a = normalize(answer);
  if (!a) return 0;
  const p = normalize(point);
  if (!p) return 0;
  if (a.includes(p)) return 1;
  const grams = bigrams(point);
  if (!grams.length) return 0;
  let hit = 0;
  for (const gram of grams) if (a.includes(gram)) hit += 1;
  return hit / grams.length;
}

export function verdictOf(score: number): RecallVerdict {
  if (score >= 0.7) return "掌握";
  if (score >= 0.4) return "基本掌握";
  return "需要回原文";
}

/** 出题：研究问题 → 核心结论 → 讲解要点 → 机制 → 术语，最多 8 题 */
export function buildRecallQuestions(result: AnalysisResult): RecallQuestion[] {
  const questions: RecallQuestion[] = [];
  const push = (question: RecallQuestion) => {
    if (questions.length < MAX_QUESTIONS) questions.push(question);
  };

  const firstExcerpt = result.sections.find((section) => section.excerpt.trim())?.excerpt ?? "";

  push({
    id: "q-question",
    kind: "问题",
    prompt: "这篇论文要解决的核心问题是什么？用一句话复述，不要照抄标题。",
    reference: result.researchQuestion,
    points: keyPoints(result.researchQuestion),
    hint: "回到摘要第一段，看作者为什么说这件事值得研究。",
    anchor: { quote: firstExcerpt, heading: result.sections[0]?.heading },
  });

  push({
    id: "q-claim",
    kind: "结论",
    prompt: "作者给出的核心结论是什么？说清楚「谁、在什么条件下、发生了什么」。",
    reference: result.coreClaim,
    points: keyPoints(result.coreClaim),
    hint: `这篇论文的一句话总结是：${result.oneSentence}`,
    anchor: { quote: result.sections.find((s) => /结论|结果|讨论/.test(s.heading))?.excerpt ?? firstExcerpt },
  });

  result.lessons.slice(0, 3).forEach((lesson, index) => {
    push({
      id: `q-lesson-${index}`,
      kind: "讲解",
      prompt: `用自己的话说清楚这一节：${lesson.heading}`,
      reference: lesson.explanation,
      points: keyPoints(lesson.explanation),
      hint: `想不起来时，先想这个类比：${lesson.analogy}`,
      anchor: { quote: lesson.evidence, heading: lesson.heading },
    });
  });

  if (result.relations.length) {
    const relation = result.relations[0];
    const source = result.entities.find((entity) => entity.id === relation.source)?.name ?? relation.source;
    const target = result.entities.find((entity) => entity.id === relation.target)?.name ?? relation.target;
    push({
      id: "q-relation",
      kind: "机制",
      prompt: `${source} 是通过什么影响 ${target} 的？请说出中间机制。`,
      reference: `${source} —[${relation.label}]→ ${target}`,
      points: keyPoints(relation.label, 2).concat(target.length >= 2 ? [target] : []),
      hint: "先看主体关系图里这条边的标签，再回忆它出现在原文哪一节。",
      anchor: {
        quote: result.sections.find((s) => s.summary.includes(target))?.excerpt ?? firstExcerpt,
      },
    });
  }

  result.glossary.slice(0, 2).forEach((item, index) => {
    push({
      id: `q-term-${index}`,
      kind: "术语",
      prompt: `论文里的「${item.term}」指什么？用你自己的话解释，别背定义。`,
      reference: item.explanation,
      points: keyPoints(item.explanation),
      hint: "想一想：如果用一个日常场景打比方，它对应什么？",
      anchor: { quote: firstExcerpt },
    });
  });

  return questions;
}

/**
 * 评分：逐要点算覆盖率取均值。
 * 没有要点时（句子太短或太长切不出来）退化成整句覆盖率，保证永远有分可打。
 */
export function gradeAnswer(question: RecallQuestion, answer: string): RecallAttempt {
  const clean = answer.trim();
  const points = question.points.length ? question.points : [question.reference];
  const coverages = points.map((point) => pointCoverage(point, clean));
  const score = coverages.length ? coverages.reduce((sum, value) => sum + value, 0) / coverages.length : 0;
  const rounded = Math.round(Math.min(1, Math.max(0, score)) * 1000) / 1000;

  const hit: string[] = [];
  const missed: string[] = [];
  points.forEach((point, index) => {
    if (coverages[index] >= 0.5) hit.push(point);
    else missed.push(point);
  });

  return {
    questionId: question.id,
    answer: clean,
    score: rounded,
    verdict: verdictOf(rounded),
    hit,
    missed,
    at: Date.now(),
  };
}

/** 汇总：总分、掌握率、需要复练的题号 */
export function summarize(attempts: RecallAttempt[]): {
  average: number;
  mastered: number;
  total: number;
  weakest: string[];
} {
  if (!attempts.length) return { average: 0, mastered: 0, total: 0, weakest: [] };
  const average = attempts.reduce((sum, item) => sum + item.score, 0) / attempts.length;
  return {
    average: Math.round(average * 1000) / 1000,
    mastered: attempts.filter((item) => item.verdict === "掌握").length,
    total: attempts.length,
    weakest: attempts.filter((item) => item.verdict !== "掌握").map((item) => item.questionId),
  };
}
