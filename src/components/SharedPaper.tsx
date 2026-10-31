import { useEffect } from "react";
import { trpc } from "../providers/trpc";
import RelationshipGraph from "./RelationshipGraph";
import ComparisonBoard from "./ComparisonBoard";
import DataChart from "./DataChart";

const shell: React.CSSProperties = { maxWidth: 980, margin: "0 auto", padding: "40px 20px 80px", lineHeight: 1.75 };
const h2: React.CSSProperties = { fontSize: 20, margin: "28px 0 10px" };
const card: React.CSSProperties = { border: "1px solid #e3e8ef", borderRadius: 12, padding: 18, marginBottom: 14, background: "#fff" };

export default function SharedPaper({ id }: { id: string }) {
  const query = trpc.share.get.useQuery({ id });

  // 分享页不该被搜索引擎收录
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex,nofollow";
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, []);

  if (query.isLoading) {
    return <div style={shell}><p style={{ color: "#7c8798" }}>正在打开分享…</p></div>;
  }
  if (!query.data?.ok) {
    return (
      <div style={shell}>
        <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>链接不存在或已失效</h1>
        <p style={{ color: "#556174" }}>分享可能已过期、已被作者删除，或已被下架。</p>
        <a href="/" style={{ color: "#0064e6" }}>← 回到澄读</a>
      </div>
    );
  }

  const { result, title, field, createdAt, expiresAt } = query.data;
  const chart = result.charts[0];

  return (
    <div style={shell}>
      <p style={{ margin: "0 0 6px", fontSize: 12, letterSpacing: 1, color: "#7c8798" }}>澄读 · 只读分享</p>
      <h1 style={{ fontSize: 26, margin: "0 0 4px", lineHeight: 1.35 }}>{title}</h1>
      <p style={{ margin: "0 0 18px", color: "#556174", fontSize: 13 }}>
        {field || "未标注"} · 生成于 {new Date(createdAt).toLocaleDateString("zh-CN")}
        {expiresAt ? ` · ${new Date(expiresAt).toLocaleDateString("zh-CN")} 失效` : " · 长期有效"}
      </p>

      <div style={{ ...card, background: "#f7f9fc" }}>{result.oneSentence}</div>

      <h2 style={h2}>老师讲解</h2>
      {result.lessons.map((lesson, index) => (
        <div key={`${lesson.heading}-${index}`} style={card}>
          <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>{index + 1}. {lesson.heading}</h3>
          <p style={{ margin: "0 0 8px" }}>{lesson.explanation}</p>
          <p style={{ margin: "0 0 6px", color: "#556174" }}>换个说法：{lesson.analogy}</p>
          <p style={{ margin: 0, fontSize: 13, color: "#7c8798" }}>原文依据：{lesson.evidence}</p>
        </div>
      ))}

      {result.entities.length > 0 && (
        <>
          <h2 style={h2}>主体关系</h2>
          <div style={card}><RelationshipGraph entities={result.entities} relations={result.relations} /></div>
        </>
      )}

      {result.comparisons.length > 0 && (
        <>
          <h2 style={h2}>分栏对照</h2>
          <div style={card}><ComparisonBoard comparisons={result.comparisons} /></div>
        </>
      )}

      {chart && (
        <>
          <h2 style={h2}>数据图表 · {chart.title}</h2>
          <div style={card}><DataChart chart={chart} /></div>
        </>
      )}

      <h2 style={h2}>术语表</h2>
      <div style={card}>
        {result.glossary.map((item) => (
          <p key={item.term} style={{ margin: "0 0 8px" }}><strong>{item.term}</strong>：{item.explanation}</p>
        ))}
      </div>

      <p style={{ marginTop: 26, fontSize: 12, color: "#7c8798", borderTop: "1px solid #e3e8ef", paddingTop: 14 }}>
        以上解读内容由 AI 生成，仅供学习参考，请以论文原文为准。 · <a href="/" style={{ color: "#0064e6" }}>用澄读读自己的论文</a>
      </p>
    </div>
  );
}
