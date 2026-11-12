import { describe, expect, it } from "vitest";
import { sampleAnalysis } from "./sample";
import { bigrams, buildRecallQuestions, gradeAnswer, keyPoints, normalize, pointCoverage, summarize, verdictOf } from "./recall";

describe("keyPoints", () => {
  it("切出 3–14 字的短语", () => {
    const points = keyPoints("本文考察数字化转型对企业创新的影响，并检验融资约束的中介作用");
    expect(points.length).toBeGreaterThan(0);
    for (const point of points) {
      expect(point.length).toBeGreaterThanOrEqual(3);
      expect(point.length).toBeLessThanOrEqual(14);
    }
  });

  it("没有可切片段时返回空数组，而不是硬凑", () => {
    expect(keyPoints("好的")).toEqual([]);
    expect(keyPoints("")).toEqual([]);
  });

  it("去重且保持原顺序", () => {
    const points = keyPoints("融资约束。融资约束。融资约束");
    expect(new Set(points.map(normalize)).size).toBe(points.length);
  });
});

describe("pointCoverage", () => {
  it("完全包含记 1", () => {
    expect(pointCoverage("数字化转型", "本文研究数字化转型的影响")).toBe(1);
  });

  it("答非所问记 0", () => {
    expect(pointCoverage("数字化转型", "今天天气不错")).toBe(0);
  });

  it("部分命中落在 0 与 1 之间", () => {
    const coverage = pointCoverage("数字化转型", "数字化");
    expect(coverage).toBeGreaterThan(0);
    expect(coverage).toBeLessThan(1);
  });

  it("空答案记 0", () => {
    expect(pointCoverage("数字化转型", "   ")).toBe(0);
  });
});

describe("bigrams / normalize", () => {
  it("去掉标点并转小写", () => {
    expect(normalize("A股，2020 年")).toBe("a股2020年");
  });

  it("单字返回自身，空串返回空数组", () => {
    expect(bigrams("的")).toEqual(["的"]);
    expect(bigrams("")).toEqual([]);
  });
});

describe("gradeAnswer", () => {
  const [question] = buildRecallQuestions(sampleAnalysis);

  it("照抄参考答案接近满分", () => {
    const attempt = gradeAnswer(question, question.reference);
    expect(attempt.score).toBeGreaterThan(0.9);
    expect(attempt.verdict).toBe("掌握");
    expect(attempt.missed).toHaveLength(0);
  });

  it("空答案 0 分且需要回原文", () => {
    const attempt = gradeAnswer(question, "");
    expect(attempt.score).toBe(0);
    expect(attempt.verdict).toBe("需要回原文");
  });

  it("答一半时分数落在中间区间", () => {
    const half = question.points[0]?.slice(0, 4) ?? "";
    const attempt = gradeAnswer(question, half);
    expect(attempt.score).toBeGreaterThan(0);
    expect(attempt.score).toBeLessThan(1);
  });

  it("记录题号与作答时间", () => {
    const attempt = gradeAnswer(question, "随便写点");
    expect(attempt.questionId).toBe(question.id);
    expect(attempt.at).toBeGreaterThan(0);
  });
});

describe("verdictOf", () => {
  it("按三档给结论", () => {
    expect(verdictOf(0.9)).toBe("掌握");
    expect(verdictOf(0.7)).toBe("掌握");
    expect(verdictOf(0.5)).toBe("基本掌握");
    expect(verdictOf(0.39)).toBe("需要回原文");
  });
});

describe("buildRecallQuestions", () => {
  const questions = buildRecallQuestions(sampleAnalysis);

  it("题量受控且第一题固定问研究问题", () => {
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.length).toBeLessThanOrEqual(8);
    expect(questions[0].kind).toBe("问题");
    expect(questions[0].id).toBe("q-question");
  });

  it("每题都带参考答案、原文锚点与提示", () => {
    for (const question of questions) {
      expect(question.reference.length).toBeGreaterThan(0);
      expect(question.anchor.quote.length).toBeGreaterThan(0);
      expect(question.hint.length).toBeGreaterThan(0);
    }
  });

  it("题号唯一", () => {
    expect(new Set(questions.map((question) => question.id)).size).toBe(questions.length);
  });
});

describe("summarize", () => {
  it("空记录返回零值", () => {
    expect(summarize([])).toEqual({ average: 0, mastered: 0, total: 0, weakest: [] });
  });

  it("统计平均分、掌握数与最弱题", () => {
    const [first, second] = buildRecallQuestions(sampleAnalysis);
    const attempts = [
      gradeAnswer(first, first.reference),
      gradeAnswer(second, ""),
    ];
    const summary = summarize(attempts);
    expect(summary.total).toBe(2);
    expect(summary.mastered).toBe(1);
    expect(summary.average).toBeGreaterThan(0.4);
    expect(summary.weakest).toEqual([second.id]);
  });
});
