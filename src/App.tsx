import { useMemo, useState } from "react";
import {
  ArrowDown, ArrowRight, BookOpen, ChartNoAxesCombined, Check, ChevronRight,
  Columns3, Download, FileText, GraduationCap, Lightbulb, Network, Search,
} from "lucide-react";
import type { AnalysisResult } from "@contracts/analysis";
import { trpc } from "./providers/trpc";
import { sampleAnalysis, sampleText } from "./lib/sample";
import { loadKey, saveKey } from "./lib/key";
import { loadProfile, saveProfile, type Profile } from "./lib/profile";
import ProfileGate from "./components/ProfileGate";
import { ThemeToggle } from "./lib/theme";
import ImportPanel from "./components/ImportPanel";
import RelationshipGraph from "./components/RelationshipGraph";
import DataChart from "./components/DataChart";
import ComparisonBoard from "./components/ComparisonBoard";

type Tab = "guide" | "relations" | "compare" | "charts" | "source";

const TABS: { id: Tab; label: string; icon: typeof BookOpen }[] = [
  { id: "guide", label: "老师讲解", icon: GraduationCap },
  { id: "relations", label: "主体关系", icon: Network },
  { id: "compare", label: "分栏对照", icon: Columns3 },
  { id: "charts", label: "数据图表", icon: ChartNoAxesCombined },
  { id: "source", label: "原文定位", icon: FileText },
];

function BrandMark() {
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 7.5c4.5-.6 8.1.3 11 2.8v15c-2.9-2.5-6.5-3.4-11-2.8zM27 7.5c-4.5-.6-8.1.3-11 2.8v15c2.9-2.5 6.5-3.4 11-2.8z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M16 10.3v15" stroke="currentColor" strokeWidth="1.8"/></svg>;
}

function downloadNotes(result: AnalysisResult) {
  const lines = [
    `# ${result.title}｜精读笔记`, "", `> ${result.oneSentence}`, "",
    `## 研究问题`, result.researchQuestion, "", `## 核心结论`, result.coreClaim, "",
    `## 老师讲解`,
    ...result.lessons.flatMap((lesson, index) => [
      `### ${index + 1}. ${lesson.heading}`, lesson.explanation, "", `**类比：** ${lesson.analogy}`, "", `**原文依据：** ${lesson.evidence}`, "",
    ]),
    `## 主体关系`,
    ...result.relations.map((relation) => {
      const source = result.entities.find((entity) => entity.id === relation.source)?.name ?? relation.source;
      const target = result.entities.find((entity) => entity.id === relation.target)?.name ?? relation.target;
      return `- ${source} —[${relation.label}]→ ${target}`;
    }), "",
    `## 术语表`, ...result.glossary.map((item) => `- **${item.term}：** ${item.explanation}`), "",
    `## 阅读边界`, ...result.limitations.map((item) => `- ${item}`), "",
    `## 下一步`, ...result.nextSteps.map((item) => `- ${item}`),
  ];
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "paper-reading-notes.md";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [text, setTextState] = useState(sampleText);
  const [result, setResult] = useState<AnalysisResult>(sampleAnalysis);
  const [tab, setTab] = useState<Tab>("guide");
  const [apiKey, setApiKeyState] = useState(loadKey);
  const [activeSection, setActiveSection] = useState(0);
  const [selectedChart, setSelectedChart] = useState(0);
  const [query, setQuery] = useState("");
  const [isSample, setIsSample] = useState(true);
  const [dirty, setDirty] = useState(false);
  // 院校信息：首次进入必须填写，填完存本机并上报一份，右上角可修改
  const [profile, setProfile] = useState<Profile | null>(loadProfile);
  const [gateOpen, setGateOpen] = useState(() => !loadProfile());
  const submitProfile = trpc.profile.submit.useMutation();

  const analyze = trpc.paper.analyze.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setIsSample(false);
      setDirty(false);
      setTab("guide");
      setActiveSection(0);
      setSelectedChart(0);
      window.setTimeout(() => document.getElementById("workbench")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    },
  });

  const setText = (value: string) => { setTextState(value); setDirty(true); };
  // Key 跟着浏览器走：只在本机保存，服务端不持久化（见 src/lib/key.ts）
  const setApiKey = (value: string) => { setApiKeyState(value); saveKey(value); };
  const loadSample = () => {
    setTextState(sampleText);
    setResult(sampleAnalysis);
    setIsSample(true);
    setDirty(false);
    setTab("guide");
    analyze.reset();
  };
  const sourceParagraphs = useMemo(() => text.split(/\n+/).map((item) => item.trim()).filter((item) => item.length > 0), [text]);
  const filteredParagraphs = sourceParagraphs.filter((paragraph) => !query || paragraph.toLowerCase().includes(query.toLowerCase()));

  const goToSection = (index: number) => {
    setActiveSection(index);
    setTab("source");
    window.setTimeout(() => document.getElementById(`source-section-${index}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  };

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="澄读首页"><BrandMark /><span>澄读</span><small>PAPER, MADE CLEAR</small></a>
        <nav aria-label="主导航">
          <a href="#workbench">精读工作台</a><a href="#method">如何读</a><a href="#boundaries">使用边界</a>
        </nav>
        <div className="header-actions">
          {profile && (
            <button className="profile-chip" onClick={() => setGateOpen(true)} title="修改我的院校与专业">
              {profile.school}{profile.major ? ` · ${profile.major}` : ""}
            </button>
          )}
          <ThemeToggle /><a className="header-cta" href="#import">导入论文<ArrowDown size={15} /></a>
        </div>
      </header>

      <main>
        <section className="hero" id="top">
          <div className="hero-copy">
            <div className="hero-kicker"><span>本科生论文精读工作台</span><i />任何学科，任何论文</div>
            <h1>把论文读成<br />一堂<em>听得懂</em>的课。</h1>
            <p className="hero-lead">不止总结摘要。澄读把研究问题、作用机制、主体关系和证据逐层拆开，再用老师能讲明白、你能复述的话讲给你听。</p>
            <div className="hero-proof">
              <div><b>01</b><span>先抓问题<small>这篇论文究竟想解决什么</small></span></div>
              <div><b>02</b><span>再看机制<small>结论是怎样一步步推出来的</small></span></div>
              <div><b>03</b><span>最后核对<small>哪些是原文证据，哪些只是推断</small></span></div>
            </div>
            <a href="#workbench" className="text-link">先看看一篇示例如何被拆解<ArrowRight size={16} /></a>
          </div>
          <ImportPanel
            text={text}
            setText={setText}
            onAnalyze={() => analyze.mutate({ text: text.trim(), apiKey: apiKey || undefined })}
            pending={analyze.isPending}
            error={analyze.error?.message ?? ""}
            apiKey={apiKey}
            setApiKey={setApiKey}
          />
        </section>

        <section className="capability-strip" aria-label="支持能力">
          <span><Check size={15} />PDF / Word / 截图识别</span>
          <span><Check size={15} />通俗讲解与原文依据</span>
          <span><Check size={15} />主体关系与分栏比较</span>
          <span><Check size={15} />折线图 / 柱状图 / 数据表</span>
        </section>

        <section className="workbench-section" id="workbench">
          <div className="workbench-heading">
            <div>
              <span className="eyebrow">YOUR READING DESK · 02</span>
              <h2>一篇论文，五种看法</h2>
            </div>
            <div className="workbench-actions">
              {isSample && <span className="sample-badge">教学示例</span>}
              {dirty && <span className="dirty-badge">原文已修改，待重新解析</span>}
              <button className="secondary-button" onClick={loadSample}>重置示例</button>
              <button className="secondary-button" onClick={() => downloadNotes(result)}><Download size={16} />导出笔记</button>
            </div>
          </div>

          <article className="paper-meta">
            <div><span className="field-label">{result.field}</span><h2>{result.title}</h2><p>{result.oneSentence}</p></div>
            <dl><div><dt>建议精读</dt><dd>{result.readingMinutes} 分钟</dd></div><div><dt>理解难度</dt><dd>{result.difficulty}</dd></div></dl>
          </article>

          <div className="workbench-tabs" role="tablist" aria-label="论文拆解视图">
            {TABS.map((item) => {
              const Icon = item.icon;
              const count = item.id === "relations" ? result.entities.length : item.id === "compare" ? result.comparisons.length : item.id === "charts" ? result.charts.length : null;
              return <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}><Icon size={17} />{item.label}{count !== null && <span>{count}</span>}</button>;
            })}
          </div>

          <div className="workbench-grid">
            <aside className="paper-outline" aria-label="论文结构">
              <div className="outline-title"><span>论文结构</span><small>{result.sections.length} 个部分</small></div>
              <div className="outline-list">
                {result.sections.map((section, index) => <button key={`${section.heading}-${index}`} className={activeSection === index ? "active" : ""} onClick={() => goToSection(index)}><span>{String(index + 1).padStart(2, "0")}</span><b>{section.heading}</b><ChevronRight size={14} /></button>)}
              </div>
              <div className="keyword-block"><span className="eyebrow">KEYWORDS</span><div>{result.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div></div>
            </aside>

            <div className="analysis-canvas">
              {tab === "guide" && (
                <div className="guide-view">
                  <header className="view-heading"><span className="eyebrow">TEACH, DON'T JUST SUMMARIZE</span><h2>先把直觉讲通，再把术语讲准</h2><p>每一节都分成“怎么理解、怎样类比、原文凭什么这样说”。</p></header>
                  <div className="lesson-list">
                    {result.lessons.map((lesson, index) => (
                      <section className="lesson" key={`${lesson.heading}-${index}`}>
                        <div className="lesson-number">{String(index + 1).padStart(2, "0")}</div>
                        <div className="lesson-content"><h3>{lesson.heading}</h3><p>{lesson.explanation}</p><div className="analogy"><Lightbulb size={17} /><div><b>换个日常说法</b><p>{lesson.analogy}</p></div></div><blockquote><span>原文依据</span>{lesson.evidence}</blockquote></div>
                      </section>
                    ))}
                  </div>
                  <section className="glossary-section"><div className="section-minihead"><h3>术语不装懂</h3><span>点开逐个看</span></div><div className="glossary-list">{result.glossary.map((item) => <details key={item.term}><summary>{item.term}<span>+</span></summary><p>{item.explanation}</p></details>)}</div></section>
                </div>
              )}

              {tab === "relations" && <div><header className="view-heading"><span className="eyebrow">ACTORS & MECHANISMS</span><h2>谁影响谁，通过什么发生</h2><p>点击图中主体，查看它在论文里的角色和直接联系。带“可能／推断”的关系需要回到原文继续验证。</p></header><RelationshipGraph entities={result.entities} relations={result.relations} /></div>}

              {tab === "compare" && <div><header className="view-heading"><span className="eyebrow">SIDE-BY-SIDE READING</span><h2>不同环境、组别与环节，分开看</h2><p>把散落在不同段落的条件放到同一行，比较差异时就不会张冠李戴。</p></header><ComparisonBoard comparisons={result.comparisons} /></div>}

              {tab === "charts" && (
                <div><header className="view-heading"><span className="eyebrow">DATA, WITH SOURCES</span><h2>让数字显出趋势，也保留出处</h2><p>只绘制原文明确提供的数据；将鼠标移到点上可核对数值，也可展开完整数据表。</p></header>
                  {result.charts.length ? <><div className="chart-switcher">{result.charts.map((chart, index) => <button key={chart.id} className={selectedChart === index ? "active" : ""} onClick={() => setSelectedChart(index)}>{chart.title}</button>)}</div><DataChart chart={result.charts[Math.min(selectedChart, result.charts.length - 1)]} /></> : <div className="empty-state">原文没有足够明确的数字可绘图。为避免编造数据，本次不生成折线图或柱状图；你仍可使用主体关系图与分栏对照。</div>}
                </div>
              )}

              {tab === "source" && (
                <div className="source-view"><header className="view-heading"><span className="eyebrow">BACK TO THE PAPER</span><h2>回到原文，核对每一步理解</h2><p>左侧结构可定位章节；搜索框只筛选当前已导入、已识别的文字。</p></header>
                  <label className="source-search"><Search size={17} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索变量、术语或一句话…" /><span>{filteredParagraphs.length} 段</span></label>
                  <div className="source-paragraphs">{filteredParagraphs.map((paragraph, index) => {
                    const sectionIndex = result.sections.findIndex((section) => paragraph.includes(section.excerpt.slice(0, Math.min(18, section.excerpt.length))) || section.excerpt.includes(paragraph.slice(0, Math.min(18, paragraph.length))));
                    return <p key={`${paragraph.slice(0, 20)}-${index}`} id={sectionIndex >= 0 ? `source-section-${sectionIndex}` : undefined} className={sectionIndex === activeSection ? "highlight" : ""}>{paragraph}</p>;
                  })}</div>
                </div>
              )}
            </div>

            <aside className="study-rail">
              <section><span className="eyebrow">先记住这一句</span><h3>研究问题</h3><p>{result.researchQuestion}</p></section>
              <section><span className="eyebrow">作者的回答</span><h3>核心结论</h3><p>{result.coreClaim}</p></section>
              <section className="next-steps"><span className="eyebrow">合上书以后</span><h3>用这三步检查自己</h3><ol>{result.nextSteps.slice(0, 3).map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol></section>
              <section className="limits"><span className="eyebrow">阅读边界</span><ul>{result.limitations.slice(0, 3).map((limit) => <li key={limit}>{limit}</li>)}</ul></section>
            </aside>
          </div>
        </section>

        <section className="method-section" id="method">
          <div className="method-intro"><span className="eyebrow">A BETTER READING ORDER · 03</span><h2>读懂，不等于把每句话<br />都翻译一遍。</h2><p>真正有效的精读，是先建立结构，再补细节。不同论文值得追问的东西不一样，澄读先认出它属于哪一类，再按那一类的规矩拆。</p></div>
          <div className="method-table">
            <div className="method-row head"><span>论文类型</span><span>先问什么</span><span>重点拆什么</span></div>
            <div className="method-row"><b>实证研究</b><span>X 真的影响了 Y 吗，凭什么说不是巧合？</span><span>变量与度量、识别策略、样本与数据、异质性、因果边界</span></div>
            <div className="method-row"><b>规范研究</b><span>谁在什么条件下承担什么责任？</span><span>主体、构成要件、权利义务、例外、适用环节、论证结构</span></div>
            <div className="method-row"><b>系统与实验</b><span>这个方法解决了什么瓶颈，代价是什么？</span><span>问题定义、架构、数据流、算法、实验设置与消融</span></div>
          </div>
        </section>

        <section className="boundaries-section" id="boundaries">
          <div><span className="eyebrow">HONEST BY DESIGN · 04</span><h2>它可以带你入门，<br />但不能替你判断。</h2></div>
          <div className="boundary-list"><p><b>不编造图表。</b>原文没有数字，就不生成数据图。</p><p><b>不把推断写成结论。</b>关系与机制仍需回到原文核对。</p><p><b>不替代表格与公式校对。</b>OCR 可能误识别上下标、符号和复杂排版。</p></div>
          <a href="#import" className="primary-button final-cta">导入我的论文<ArrowRight size={17} /></a>
        </section>
      </main>

      <footer><a className="brand footer-brand" href="#top"><BrandMark /><span>澄读</span></a><p>把复杂的论文，读成清楚的知识。</p><div><a href="#workbench">工作台</a><a href="#method">阅读方法</a><a href="#boundaries">使用边界</a></div></footer>

      <ProfileGate
        open={gateOpen}
        initial={profile}
        onSubmit={(value) => {
          saveProfile(value);
          setProfile(value);
          setGateOpen(false);
          submitProfile.mutate(value);
        }}
      />
    </div>
  );
}
