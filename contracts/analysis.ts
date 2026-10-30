import { z } from "zod";

export const analysisSchema = z.object({
  title: z.string(),
  // 学科只作为「模型自己判断出的短标签」展示，不再限定成固定几门学科：
  // 页面要适配任何专业的论文，而不是把某几个专业名写进产品设定里。
  field: z.string().min(1).max(12),
  oneSentence: z.string(),
  researchQuestion: z.string(),
  coreClaim: z.string(),
  readingMinutes: z.number().int().min(1).max(120),
  difficulty: z.enum(["入门", "适中", "进阶"]),
  keywords: z.array(z.string()).max(8),
  lessons: z.array(z.object({
    heading: z.string(),
    explanation: z.string(),
    analogy: z.string(),
    evidence: z.string(),
  })).max(7),
  sections: z.array(z.object({
    heading: z.string(),
    summary: z.string(),
    excerpt: z.string(),
  })).max(12),
  entities: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    description: z.string(),
  })).max(12),
  relations: z.array(z.object({
    source: z.string(),
    target: z.string(),
    label: z.string(),
  })).max(18),
  comparisons: z.array(z.object({
    title: z.string(),
    columns: z.array(z.string()).min(2).max(4),
    rows: z.array(z.object({ label: z.string(), cells: z.array(z.string()).min(2).max(4) })).max(8),
  })).max(3),
  charts: z.array(z.object({
    id: z.string(),
    title: z.string(),
    type: z.enum(["line", "bar"]),
    xLabel: z.string(),
    yLabel: z.string(),
    labels: z.array(z.string()).min(2).max(16),
    series: z.array(z.object({ name: z.string(), data: z.array(z.number()).min(2).max(16) })).min(1).max(4),
    note: z.string(),
  })).max(4),
  glossary: z.array(z.object({ term: z.string(), explanation: z.string() })).max(10),
  limitations: z.array(z.string()).max(5),
  nextSteps: z.array(z.string()).max(5),
});

export type AnalysisResult = z.infer<typeof analysisSchema>;
