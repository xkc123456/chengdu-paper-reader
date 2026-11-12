import type { AnalysisResult } from "@contracts/analysis";
import type { RecallAttempt, RecallQuestion } from "@contracts/study";
import { DOCX_MIME, buildDocx } from "./docx";

/**
 * exportKit.ts — 「落点」：让读完的成果离开这个网页。
 *
 * 四个目标：
 *   Obsidian（双链 + callout + mermaid）、Word（真 .docx，见 docx.ts）、
 *   表格软件（CSV，一条论断一行，方便做证据表）、原始 JSON。
 *
 * 除 docx 外全是纯字符串拼接，不引第三方依赖。
 */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 文件名用的 slug：中文保留，去掉文件系统敏感字符 */
export function slugify(text: string, maxLength = 40): string {
  const cleaned = text
    .replace(/[\\/:*?"<>|\r\n\t]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "paper").slice(0, maxLength);
}

/** Markdown 表格里的竖线必须转义，否则整行错位 */
function mdCell(text: string): string {
  return (text || "—").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function baseName(result: AnalysisResult): string {
  return `${slugify(result.title)}-精读`;
}

/** Obsidian：YAML frontmatter + callout + 双链导航 + mermaid 关系图 */
export function toObsidianMarkdown(
  result: AnalysisResult,
  extras?: { questions?: RecallQuestion[]; attempts?: RecallAttempt[]; sourceUrl?: string },
): string {
  const created = new Date().toISOString().slice(0, 10);
  const tags = ["精读", result.field].filter(Boolean).map((tag) => tag.replace(/\s/g, "-"));
  const attemptMap = new Map((extras?.attempts ?? []).map((attempt) => [attempt.questionId, attempt]));
  const lines: string[] = [];

  lines.push(
    "---",
    `title: "${result.title.replace(/"/g, '\\"')}"`,
    `field: "${result.field}"`,
    `difficulty: "${result.difficulty}"`,
    `reading_minutes: ${result.readingMinutes}`,
    `created: ${created}`,
    `tags: [${tags.join(", ")}]`,
    extras?.sourceUrl ? `source: "${extras.sourceUrl}"` : "",
    "---",
    "",
    `# ${result.title}`,
    "",
    `> [!abstract] 一句话`,
    `> ${result.oneSentence}`,
    "",
    "导航：[[#研究问题]] · [[#核心结论]] · [[#老师讲解]] · [[#主体关系]] · [[#分栏对照]] · [[#数据图表]] · [[#术语表]] · [[#阅读边界]] · [[#下一步]]",
    "",
    "## 研究问题",
    "",
    `> [!question] 作者想回答什么`,
    `> ${result.researchQuestion}`,
    "",
    "## 核心结论",
    "",
    `> [!success] 作者的回答`,
    `> ${result.coreClaim}`,
    "",
    "## 老师讲解",
    "",
  );

  result.lessons.forEach((lesson, index) => {
    lines.push(
      `### ${index + 1}. ${lesson.heading}`,
      "",
      lesson.explanation,
      "",
      `> [!tip] 换个日常说法`,
      `> ${lesson.analogy}`,
      "",
      `> [!quote] 原文依据`,
      `> ${lesson.evidence}`,
      "",
    );
  });

  lines.push("## 主体关系", "");
  if (result.relations.length) {
    lines.push("```mermaid", "graph LR");
    const ids = new Map<string, string>();
    result.entities.forEach((entity, index) => ids.set(entity.id, `e${index + 1}`));
    result.entities.forEach((entity) => {
      lines.push(`  ${ids.get(entity.id)}["${entity.name.replace(/"/g, "'")}"]`);
    });
    result.relations.forEach((relation) => {
      const from = ids.get(relation.source) ?? relation.source;
      const to = ids.get(relation.target) ?? relation.target;
      lines.push(`  ${from} -->|${relation.label.replace(/[|"]/g, "/")}| ${to}`);
    });
    lines.push("```", "");
  } else {
    lines.push("（本次解析没有识别出明确的主体关系）", "");
  }

  if (result.comparisons.length) {
    lines.push("## 分栏对照", "");
    result.comparisons.forEach((comparison) => {
      lines.push(`### ${comparison.title}`, "");
      lines.push(`| 比较维度 | ${comparison.columns.map(mdCell).join(" | ")} |`);
      lines.push(`| --- | ${comparison.columns.map(() => "---").join(" | ")} |`);
      comparison.rows.forEach((row) => {
        lines.push(`| ${mdCell(row.label)} | ${comparison.columns.map((_, index) => mdCell(row.cells[index] ?? "")).join(" | ")} |`);
      });
      lines.push("");
    });
  }

  if (result.charts.length) {
    lines.push("## 数据图表", "");
    result.charts.forEach((chart) => {
      lines.push(`### ${chart.title}`, "", `> [!note] 出处`, `> ${chart.note}`, "");
      lines.push(`| ${mdCell(chart.xLabel)} | ${chart.series.map((series) => mdCell(series.name)).join(" | ")} |`);
      lines.push(`| --- | ${chart.series.map(() => "---").join(" | ")} |`);
      chart.labels.forEach((label, index) => {
        lines.push(`| ${mdCell(label)} | ${chart.series.map((series) => series.data[index] ?? "").join(" | ")} |`);
      });
      lines.push("", `单位：${chart.yLabel}`, "");
    });
  }

  if (result.glossary.length) {
    lines.push("## 术语表", "");
    result.glossary.forEach((item) => {
      lines.push(`- **${item.term}**：${item.explanation}`);
    });
    lines.push("");
  }

  lines.push("## 阅读边界", "");
  lines.push("> [!warning] 别把这部分当结论用");
  result.limitations.forEach((item) => lines.push(`> - ${item}`));
  lines.push("");

  lines.push("## 下一步", "");
  result.nextSteps.forEach((item) => lines.push(`- [ ] ${item}`));
  lines.push("");

  if (extras?.questions?.length) {
    lines.push("## 复述检验", "");
    lines.push("> [!check] 用自己的话回答，答不上来就回到对应章节");
    extras.questions.forEach((question, index) => {
      const attempt = attemptMap.get(question.id);
      lines.push(
        "",
        `### ${index + 1}. ${question.prompt}`,
        "",
        `- 参考答案：${question.reference}`,
        attempt
          ? `- 我的作答（${Math.round(attempt.score * 100)} 分 · ${attempt.verdict}）：${attempt.answer || "（空）"}`
          : "- 我的作答：（未作答）",
      );
    });
    lines.push("");
  }

  return lines.join("\n");
}

function csvCell(text: string): string {
  const value = (text ?? "").replace(/\r?\n/g, " ");
  return /[",]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** 证据表：一条讲解/关系/术语一行，方便在 Excel 里按「有无原文依据」筛 */
export function toEvidenceCsv(result: AnalysisResult): string {
  const lines: string[] = ["类型,条目,内容,原文依据"];
  result.lessons.forEach((lesson) => {
    lines.push(["讲解", lesson.heading, lesson.explanation, lesson.evidence].map(csvCell).join(","));
    lines.push(["类比", lesson.heading, lesson.analogy, ""].map(csvCell).join(","));
  });
  result.relations.forEach((relation) => {
    const source = result.entities.find((entity) => entity.id === relation.source)?.name ?? relation.source;
    const target = result.entities.find((entity) => entity.id === relation.target)?.name ?? relation.target;
    lines.push(["关系", `${source} → ${target}`, relation.label, ""].map(csvCell).join(","));
  });
  result.glossary.forEach((item) => {
    lines.push(["术语", item.term, item.explanation, ""].map(csvCell).join(","));
  });
  result.limitations.forEach((item) => {
    lines.push(["边界", "", item, ""].map(csvCell).join(","));
  });
  return `\ufeff${lines.join("\r\n")}`;
}

/** 触发浏览器下载；字符串与字节流都吃，导出统一走这一个口 */
export function downloadFile(filename: string, content: string | Uint8Array, mime: string): void {
  const blob = new Blob([content as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ExportFormat = "obsidian" | "word" | "csv" | "json";

export function exportFileName(result: AnalysisResult, format: ExportFormat): string {
  const base = baseName(result);
  switch (format) {
    case "obsidian":
      return `${base}.md`;
    case "word":
      return `${base}.docx`;
    case "csv":
      return `${base}-证据表.csv`;
    default:
      return `${base}.json`;
  }
}

export function buildExport(
  format: ExportFormat,
  result: AnalysisResult,
  extras?: { questions?: RecallQuestion[]; attempts?: RecallAttempt[] },
): { content: string | Uint8Array; mime: string } {
  switch (format) {
    case "obsidian":
      return { content: toObsidianMarkdown(result, extras), mime: "text/markdown;charset=utf-8" };
    case "word":
      return { content: buildDocx(result), mime: DOCX_MIME };
    case "csv":
      return { content: toEvidenceCsv(result), mime: "text/csv;charset=utf-8" };
    default:
      return { content: JSON.stringify(result, null, 2), mime: "application/json;charset=utf-8" };
  }
}
