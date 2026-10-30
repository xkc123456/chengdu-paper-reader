import type { AnalysisResult } from "@contracts/analysis";

export default function ComparisonBoard({ comparisons }: { comparisons: AnalysisResult["comparisons"] }) {
  if (!comparisons.length) {
    return <div className="empty-state">原文没有明确的环境、组别或环节对照。若论文包含实验组、制度场景或模型阶段，可补充相应章节后重新解析。</div>;
  }
  return (
    <div className="comparison-list">
      {comparisons.map((comparison) => (
        <section className="comparison-block" key={comparison.title}>
          <div className="section-minihead"><h3>{comparison.title}</h3><span>{comparison.rows.length} 个比较维度</span></div>
          <div className="comparison-grid" style={{ "--compare-count": comparison.columns.length } as React.CSSProperties}>
            <div className="comparison-row comparison-header">
              <div>比较维度</div>{comparison.columns.map((column) => <div key={column}>{column}</div>)}
            </div>
            {comparison.rows.map((row) => (
              <div className="comparison-row" key={row.label}>
                <div className="comparison-label">{row.label}</div>
                {comparison.columns.map((column, index) => (
                  <div key={column} data-label={column}>{row.cells[index] ?? "—"}</div>
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
