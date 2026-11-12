import { describe, expect, it } from "vitest";
import type { AnalysisResult } from "@contracts/analysis";
import { buildMapRows, singletonKeywords, themeClusters, toMapCsv, toMapHtml, toMapMarkdown, type MapSource } from "./libraryMap";

function paper(title: string, keywords: string[], overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    title,
    field: "经济学",
    oneSentence: `${title}的一句话总结`,
    researchQuestion: `${title}要回答的问题`,
    coreClaim: `${title}的核心结论`,
    readingMinutes: 12,
    difficulty: "适中",
    keywords,
    lessons: [],
    sections: [
      { heading: "研究方法", summary: "用双重差分识别因果效应", excerpt: "本文采用双重差分法" },
      { heading: "数据与样本", summary: "2015—2020 年 A 股上市公司", excerpt: "样本来自 CSMAR" },
    ],
    entities: [],
    relations: [],
    comparisons: [],
    charts: [],
    glossary: [],
    limitations: ["样本期限较短"],
    nextSteps: [],
    ...overrides,
  };
}

function source(id: string, title: string, keywords: string[], overrides: Partial<AnalysisResult> = {}): MapSource {
  const result = paper(title, keywords, overrides);
  return { id, title, field: result.field, result };
}

const sources = [
  source("p1", "论文A", ["数字金融", "融资约束", "中小企业"]),
  source("p2", "论文B", ["数字金融", "融资约束", "区域差异"]),
  source("p3", "论文C", ["绿色信贷", "融资约束", "环境规制"]),
];

describe("buildMapRows", () => {
  const rows = buildMapRows(sources);

  it("一行一篇，保留标题与领域", () => {
    expect(rows).toHaveLength(3);
    expect(rows[0].title).toBe("论文A");
    expect(rows[0].field).toBe("经济学");
  });

  it("从章节标题里取方法与数据", () => {
    expect(rows[0].method).toBe("用双重差分识别因果效应");
    expect(rows[0].data).toBe("2015—2020 年 A 股上市公司");
  });

  it("没有对应章节时留空而不是编造", () => {
    const barren = buildMapRows([source("p4", "论文D", ["x"], { sections: [] })]);
    expect(barren[0].method).toBe("");
    expect(barren[0].data).toBe("");
  });
});

describe("themeClusters", () => {
  const rows = buildMapRows(sources);
  const clusters = themeClusters(rows);

  it("只收被两篇及以上提到的关键词", () => {
    const keywords = clusters.map((cluster) => cluster.keyword);
    expect(keywords).toContain("数字金融");
    expect(keywords).toContain("融资约束");
    expect(keywords).not.toContain("中小企业");
  });

  it("按篇数降序，融资约束覆盖三篇", () => {
    expect(clusters[0].keyword).toBe("融资约束");
    expect(clusters[0].titles).toHaveLength(3);
  });

  it("单篇的关键词单独返回", () => {
    const singles = singletonKeywords(rows);
    expect(singles).toContain("中小企业");
    expect(singles).not.toContain("融资约束");
  });
});

describe("导出", () => {
  const rows = buildMapRows(sources);
  const clusters = themeClusters(rows);

  it("Markdown 带横向矩阵与双链", () => {
    const markdown = toMapMarkdown(rows, clusters);
    expect(markdown.startsWith("---")).toBe(true);
    expect(markdown).toContain("| 论文 |");
    expect(markdown).toContain("[[论文A]]");
    expect(markdown).toContain("## 主题簇");
  });

  it("没有共同关键词时给出提示而不是空表", () => {
    const lone = buildMapRows([source("p9", "论文E", ["独特词"])]);
    const markdown = toMapMarkdown(lone, themeClusters(lone));
    expect(markdown).toContain("还没有共同关键词");
  });

  it("CSV 表头与行数正确", () => {
    const csv = toMapCsv(rows).replace(/^\ufeff/, "");
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("论文,领域,研究问题,核心结论,方法,数据,关键词,边界");
    expect(lines).toHaveLength(4);
  });

  it("HTML 转义标题，避免注入", () => {
    const risky = buildMapRows([source("p5", "<b>坏标题</b>", ["x"])]);
    const html = toMapHtml(risky, []);
    expect(html).not.toContain("<b>坏标题</b>");
    expect(html).toContain("&lt;b&gt;");
  });
});
