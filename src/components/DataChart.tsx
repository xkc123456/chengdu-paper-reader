import { useMemo, useState } from "react";
import { Table2 } from "lucide-react";
import type { AnalysisResult } from "@contracts/analysis";

type Chart = AnalysisResult["charts"][number];
const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

export default function DataChart({ chart }: { chart: Chart }) {
  const [showTable, setShowTable] = useState(false);
  const safeSeries = chart.series.map((series) => ({
    ...series,
    data: chart.labels.map((_, index) => series.data[index] ?? 0),
  }));
  const values = safeSeries.flatMap((series) => series.data);
  const geometry = useMemo(() => {
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const min = chart.type === "bar" ? Math.min(0, minValue) : minValue - (maxValue - minValue || 1) * 0.18;
    const max = maxValue + (maxValue - minValue || 1) * 0.12;
    return { min, max, range: max - min || 1 };
  }, [chart.type, values.join(",")]);
  const x = (index: number) => 76 + (index / Math.max(chart.labels.length - 1, 1)) * 626;
  const y = (value: number) => 258 - ((value - geometry.min) / geometry.range) * 208;
  const ticks = Array.from({ length: 5 }, (_, index) => geometry.min + (geometry.range / 4) * index).reverse();

  return (
    <figure className="chart-figure">
      <figcaption className="chart-heading">
        <div><span className="eyebrow">{chart.type === "line" ? "LINE CHART" : "BAR CHART"}</span><h3>{chart.title}</h3></div>
        <button className={`text-button ${showTable ? "active" : ""}`} onClick={() => setShowTable((value) => !value)} aria-pressed={showTable}>
          <Table2 size={15} />{showTable ? "收起数据" : "查看数据"}
        </button>
      </figcaption>
      <div className="chart-legend">
        {safeSeries.map((series, index) => <span key={series.name}><i style={{ background: COLORS[index % COLORS.length] }} />{series.name}</span>)}
      </div>
      <svg className="data-chart" viewBox="0 0 760 320" role="img" aria-label={`${chart.title}，${chart.yLabel}`}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1="76" x2="702" y1={y(tick)} y2={y(tick)} className="chart-grid" />
            <text x="64" y={y(tick) + 4} textAnchor="end" className="chart-tick">{Number(tick.toFixed(2))}</text>
          </g>
        ))}
        <text x="390" y="309" textAnchor="middle" className="chart-axis-label">{chart.xLabel}</text>
        <text x="16" y="154" textAnchor="middle" className="chart-axis-label" transform="rotate(-90 16 154)">{chart.yLabel}</text>
        {chart.type === "line" ? safeSeries.map((series, seriesIndex) => {
          const points = series.data.map((value, index) => `${x(index)},${y(value)}`).join(" ");
          return (
            <g key={series.name}>
              <polyline points={points} fill="none" stroke={COLORS[seriesIndex % COLORS.length]} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              {series.data.map((value, index) => (
                <circle key={index} cx={x(index)} cy={y(value)} r="4.5" fill="var(--panel)" stroke={COLORS[seriesIndex % COLORS.length]} strokeWidth="2.5">
                  <title>{`${chart.labels[index]} · ${series.name}：${value}`}</title>
                </circle>
              ))}
            </g>
          );
        }) : (() => {
          const groupWidth = 626 / chart.labels.length;
          const barWidth = Math.min(48, (groupWidth * 0.64) / safeSeries.length);
          return chart.labels.map((label, labelIndex) => {
            const center = 76 + groupWidth * labelIndex + groupWidth / 2;
            return safeSeries.map((series, seriesIndex) => {
              const value = series.data[labelIndex];
              const top = Math.min(y(0), y(value));
              const height = Math.abs(y(0) - y(value));
              const bx = center - (safeSeries.length * barWidth) / 2 + seriesIndex * barWidth;
              return <rect key={`${label}-${series.name}`} x={bx} y={top} width={Math.max(barWidth - 4, 6)} height={Math.max(height, 1)} rx="3" fill={COLORS[seriesIndex % COLORS.length]}><title>{`${label} · ${series.name}：${value}`}</title></rect>;
            });
          });
        })()}
        {chart.labels.map((label, index) => {
          const labelX = chart.type === "line" ? x(index) : 76 + (626 / chart.labels.length) * index + (626 / chart.labels.length) / 2;
          return <text key={`${label}-${index}`} x={labelX} y="282" textAnchor="middle" className="chart-tick">{label.length > 9 ? `${label.slice(0, 9)}…` : label}</text>;
        })}
      </svg>
      <p className="source-note">{chart.note}</p>
      {showTable && (
        <div className="chart-table-wrap">
          <table>
            <thead><tr><th>{chart.xLabel}</th>{safeSeries.map((series) => <th key={series.name} className="n">{series.name}</th>)}</tr></thead>
            <tbody>{chart.labels.map((label, index) => <tr key={label}><td>{label}</td>{safeSeries.map((series) => <td key={series.name} className="n">{series.data[index]}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </figure>
  );
}
