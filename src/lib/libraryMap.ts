import type { AnalysisResult } from "@contracts/analysis";
import type { MapRow, ThemeCluster } from "@contracts/study";
import { escapeHtml } from "./exportKit";

/**
 * libraryMap.ts — 把「一篇一篇地读」变成「一片地看」。
 *
 * 输入是本机存档里的若干篇解析结果，输出是一张横向矩阵：
 * 每行一篇，列固定为 问题 / 结论 / 方法 / 数据 / 边界 / 关键词。
 * 再按「被两篇以上共同提到的关键词」聚成主题簇 —— 这一层不需要向量，
 * 用关键词共现就够用，而且结果可解释、可复现（不会因为换模型而变）。
 */

export interface MapSource {
  id: string;
  title: string;
  field: string;
  result: AnalysisResult;
}

const METHOD_HINT = /方法|研究设计|模型|实验|识别|策略|架构|算法|数据流/;
const DATA_HINT = /数据|样本|资料|材料|调查|访谈|案例/;

function sectionSummary(result: AnalysisResult, pattern: RegExp): string {
  const hit = result.sections.find((section) => pattern.test(section.heading));
  return hit?.summary?.trim() ?? "";
}

export function buildMapRows(sources: MapSource[]): MapRow[] {
  return sources.map((source) => ({
    id: source.id,
    title: source.title || source.result.title,
    field: source.field || source.result.field,
    question: source.result.researchQuestion,
    claim: source.result.coreClaim,
    method: sectionSummary(source.result, METHOD_HINT),
    data: sectionSummary(source.result, DATA_HINT),
    limitations: source.result.limitations,
    keywords: source.result.keywords,
  }));
}

/** 关键词共现：只保留被 ≥2 篇同时提到的词，按篇数降序 */
export function themeClusters(rows: MapRow[]): ThemeCluster[] {
  const map = new Map<string, Set<string>>();
  rows.forEach((row) => {
    row.keywords.forEach((raw) => {
      const keyword = raw.trim();
      if (!keyword) return;
      const bucket = map.get(keyword) ?? new Set<string>();
      bucket.add(row.title);
      map.set(keyword, bucket);
    });
  });
  return [...map.entries()]
    .filter(([, titles]) => titles.size >= 2)
    .map(([keyword, titles]) => ({ keyword, titles: [...titles] }))
    .sort((a, b) => b.titles.length - a.titles.length || a.keyword.localeCompare(b.keyword, "zh"));
}

/** 只被一篇提到的关键词：给「还缺哪一块」做提示，不入簇 */
export function singletonKeywords(rows: MapRow[]): string[] {
  const counts = new Map<string, number>();
  rows.forEach((row) => row.keywords.forEach((keyword) => counts.set(keyword, (counts.get(keyword) ?? 0) + 1)));
  return [...counts.entries()].filter(([, count]) => count === 1).map(([keyword]) => keyword).slice(0, 24);
}

function mdCell(text: string): string {
  return (text || "—").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function toMapMarkdown(rows: MapRow[], clusters: ThemeCluster[]): string {
  const lines: string[] = [];
  lines.push(
    "---",
    `title: "文献地图"`,
    `papers: ${rows.length}`,
    `created: ${new Date().toISOString().slice(0, 10)}`,
    "---",
    "",
    "# 文献地图",
    "",
    "## 横向矩阵",
    "",
    `| 论文 | 领域 | 研究问题 | 核心结论 | 方法 | 数据 | 边界 |`,
    `| --- | --- | --- | --- | --- | --- | --- |`,
  );
  rows.forEach((row) => {
    lines.push(
      `| [[${row.title}]] | ${mdCell(row.field)} | ${mdCell(row.question)} | ${mdCell(row.claim)} | ${mdCell(row.method)} | ${mdCell(row.data)} | ${mdCell(row.limitations[0] ?? "")} |`,
    );
  });
  lines.push("", "## 主题簇", "");
  if (!clusters.length) {
    lines.push("（这批论文之间还没有共同关键词，先多存几篇再看）");
  } else {
    clusters.forEach((cluster) => {
      lines.push(`### ${cluster.keyword}（${cluster.titles.length} 篇）`);
      cluster.titles.forEach((title) => lines.push(`- [[${title}]]`));
      lines.push("");
    });
  }
  return lines.join("\n");
}

export function toMapCsv(rows: MapRow[]): string {
  const cell = (text: string) => {
    const value = (text ?? "").replace(/\r?\n/g, " ");
    return /[",]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  };
  const lines = ["论文,领域,研究问题,核心结论,方法,数据,关键词,边界"];
  rows.forEach((row) => {
    lines.push(
      [row.title, row.field, row.question, row.claim, row.method, row.data, row.keywords.join(" / "), row.limitations.join(" / ")]
        .map(cell)
        .join(","),
    );
  });
  return `\ufeff${lines.join("\r\n")}`;
}

/** 独立 HTML：可以直接发给同学，也可以浏览器打印成一份「文献综述底稿」 */
export function toMapHtml(rows: MapRow[], clusters: ThemeCluster[]): string {
  const esc = escapeHtml;
  const cell = (text: string) => esc(text || "—");

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>文献地图（${rows.length} 篇）</title>
<style>
  body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; color: #121926; margin: 32px auto; max-width: 1180px; line-height: 1.65; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  .sub { color: #7c8798; font-size: 13px; margin-bottom: 22px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { border: 1px solid #dce2eb; padding: 8px 10px; vertical-align: top; text-align: left; }
  th { background: #eef2f7; }
  td.title { font-weight: 600; min-width: 160px; }
  h2 { font-size: 17px; margin: 28px 0 10px; border-left: 3px solid #0064e6; padding-left: 8px; }
  .cluster { border: 1px solid #e3e8ef; border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; }
  .cluster b { color: #0064e6; }
  .cluster span { color: #7c8798; font-size: 12px; }
  @media print { body { margin: 0; } th { background: #eee !important; } }
</style></head><body>
<h1>文献地图</h1>
<div class="sub">${rows.length} 篇 · 生成于 ${new Date().toLocaleString("zh-CN")} · 数据来自你在澄读的存档</div>
<table>
  <thead><tr><th>论文</th><th>领域</th><th>研究问题</th><th>核心结论</th><th>方法</th><th>数据</th><th>边界</th></tr></thead>
  <tbody>
  ${rows
    .map(
      (row) => `<tr><td class="title">${cell(row.title)}</td><td>${cell(row.field)}</td><td>${cell(row.question)}</td><td>${cell(row.claim)}</td><td>${cell(row.method)}</td><td>${cell(row.data)}</td><td>${cell(row.limitations[0] ?? "")}</td></tr>`,
    )
    .join("\n  ")}
  </tbody>
</table>
<h2>主题簇（被两篇及以上共同提到的关键词）</h2>
${clusters.length
    ? clusters
        .map(
          (cluster) => `<div class="cluster"><b>${esc(cluster.keyword)}</b> <span>${cluster.titles.length} 篇</span><div>${cluster.titles.map(esc).join(" · ")}</div></div>`,
        )
        .join("\n")
    : "<p>还没有共同关键词。多存几篇，或检查解析结果里的 keywords 是否为空。</p>"}
</body></html>`;
}
