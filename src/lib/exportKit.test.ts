import { describe, expect, it } from "vitest";
import type { AnalysisResult } from "@contracts/analysis";
import { sampleAnalysis } from "./sample";
import { buildExport, escapeHtml, exportFileName, slugify, toEvidenceCsv, toObsidianMarkdown } from "./exportKit";

function clone(): AnalysisResult {
  return JSON.parse(JSON.stringify(sampleAnalysis)) as AnalysisResult;
}

describe("slugify", () => {
  it("去掉文件系统敏感字符，保留中文", () => {
    expect(slugify("数字金融/融资约束: 一个检验?").startsWith("数字金融融资约束")).toBe(true);
  });

  it("空标题有兜底", () => {
    expect(slugify("   ")).toBe("paper");
  });
});

describe("toObsidianMarkdown", () => {
  const result = clone();
  const markdown = toObsidianMarkdown(result);

  it("以 YAML frontmatter 开头并带标题", () => {
    expect(markdown.startsWith("---\n")).toBe(true);
    expect(markdown).toContain(`title: "${result.title}"`);
    expect(markdown).toContain("# " + result.title);
  });

  it("包含核心小节与导航双链", () => {
    expect(markdown).toContain("## 研究问题");
    expect(markdown).toContain("## 核心结论");
    expect(markdown).toContain("[[#老师讲解]]");
  });

  it("有主体关系时输出 mermaid 图", () => {
    expect(result.relations.length).toBeGreaterThan(0);
    expect(markdown).toContain("```mermaid");
    expect(markdown).toContain("graph LR");
  });

  it("表格里的竖线被转义，不会破坏结构", () => {
    const withPipe = clone();
    withPipe.comparisons = [{
      title: "对照",
      columns: ["A", "B"],
      rows: [{ label: "含竖线|的标签", cells: ["x|y", "z"] }],
    }];
    const output = toObsidianMarkdown(withPipe);
    expect(output).toContain("含竖线\\|的标签");
    expect(output).toContain("x\\|y");
  });

  it("带复述记录时输出作答与得分", () => {
    const withQuiz = toObsidianMarkdown(result, {
      questions: [{ id: "q1", kind: "问题", prompt: "问什么", reference: "参考答案", points: ["答案"], hint: "提示", anchor: { quote: "原文" } }],
      attempts: [{ questionId: "q1", answer: "我的回答", score: 0.5, verdict: "基本掌握", hit: [], missed: [], at: 1 }],
    });
    expect(withQuiz).toContain("## 复述检验");
    expect(withQuiz).toContain("我的作答（50 分 · 基本掌握）");
  });
});

describe("toEvidenceCsv", () => {
  const result = clone();
  const csv = toEvidenceCsv(result);
  const lines = csv.replace(/^\ufeff/, "").split("\r\n");

  it("带 BOM 与表头（Excel 打开不乱码）", () => {
    expect(csv.startsWith("\ufeff")).toBe(true);
    expect(lines[0]).toBe("类型,条目,内容,原文依据");
  });

  it("行数 = 讲解×2 + 关系 + 术语 + 边界", () => {
    const expected = 1 + result.lessons.length * 2 + result.relations.length + result.glossary.length + result.limitations.length;
    expect(lines.length).toBe(expected);
  });

  it("含逗号的内容加引号", () => {
    const tricky = clone();
    tricky.glossary = [{ term: "术语,带逗号", explanation: '含"引号"' }];
    tricky.relations = [];
    tricky.limitations = [];
    const output = toEvidenceCsv(tricky);
    expect(output).toContain('"术语,带逗号"');
    expect(output).toContain('"含""引号"""');
  });
});

describe("exportFileName / buildExport", () => {
  const result = clone();

  it("按格式给出后缀", () => {
    expect(exportFileName(result, "obsidian").endsWith(".md")).toBe(true);
    expect(exportFileName(result, "word").endsWith(".docx")).toBe(true);
    expect(exportFileName(result, "csv").endsWith(".csv")).toBe(true);
    expect(exportFileName(result, "json").endsWith(".json")).toBe(true);
  });

  it("json 导出可被重新解析", () => {
    const { content } = buildExport("json", result);
    expect(JSON.parse(content as string).title).toBe(result.title);
  });

  it("word 导出是 docx 字节流而不是 HTML 字符串", () => {
    const { content, mime } = buildExport("word", result);
    expect(content).toBeInstanceOf(Uint8Array);
    const bytes = content as Uint8Array;
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(mime).toContain("openxmlformats");
  });

  it("每种格式都给出对应 MIME", () => {
    expect(buildExport("obsidian", result).mime).toContain("markdown");
    expect(buildExport("csv", result).mime).toContain("text/csv");
  });
});

describe("escapeHtml", () => {
  it("转义四个危险字符", () => {
    expect(escapeHtml('<a href="x">&\'')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;'");
  });
});
