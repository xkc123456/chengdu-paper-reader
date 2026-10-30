import { z } from "zod";

export const analysisSchema = z.object({
  title: z.string(),
  field: z.enum(["经管", "法律", "人工智能与电子信息", "其他"]),
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
