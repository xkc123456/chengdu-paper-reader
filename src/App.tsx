import { useMemo, useState } from "react";
import {
  ArrowDown, ArrowRight, BookOpen, ChartNoAxesCombined, Check, ChevronRight,
  Columns3, Download, FileText, GraduationCap, Lightbulb, Network, Search, Share2, Upload,
} from "lucide-react";
import type { AnalysisResult } from "@contracts/analysis";
import { trpc } from "./providers/trpc";
import { sampleAnalysis, sampleText } from "./lib/sample";
import { loadKey, saveKey } from "./lib/key";
import { loadProfile, saveProfile, type Profile } from "./lib/profile";
import { getDeviceId } from "./lib/device";
import LockedScreen from "./components/LockedScreen";
import ProfileGate from "./components/ProfileGate";
import { ThemeToggle } from "./lib/theme";
import FaqSection from "./components/FaqSection";
import { homeCopy } from "./homeCopy";
import ImportPanel from "./components/ImportPanel";
import RelationshipGraph from "./components/RelationshipGraph";
import DataChart from "./components/DataChart";
import ComparisonBoard from "./components/ComparisonBoard";
import ShareDialog from "./components/ShareDialog";
import SharedPaper from "./components/SharedPaper";

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
  // 云存档 / 分享的界面状态
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [savedArchiveId, setSavedArchiveId] = useState<string | null>(null);
  const submitProfile = trpc.profile.submit.useMutation();
  // 云存档：用户主动点「存到云端」并勾选同意后才会写服务端
  const archive = trpc.archive.save.useMutation({
    onSuccess: (res) => {
      if (res.ok) {
        setSavedArchiveId(res.id);
        setConsentOpen(false);
        setConsentChecked(false);
      }
    },
  });
  // 站点暂停开关：每 60 秒查一次，站长在后台一关，访客这边最多一分钟就看到暂停页
  const siteStatus = trpc.site.status.useQuery(undefined, {
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const analyze = trpc.paper.analyze.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setIsSample(false);
      setDirty(false);
      setTab("guide");
      setActiveSection(0);
      setSelectedChart(0);
      setSavedArchiveId(null);
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

  // /s/<id> 是只读分享页：走独立组件，不加载工作台（也不写 localStorage）
  const shareMatch = typeof window !== "undefined" ? window.location.pathname.match(/^\/s\/([A-Za-z0-9]{6,16})\/?$/) : null;
  if (shareMatch) {
    return <SharedPaper id={shareMatch[1]} />;
  }

  // 站长暂停时给一个说明页：页面不消失，只是不能继续用
  if (siteStatus.data?.locked) {
    return <LockedScreen message={siteStatus.data.message} />;
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="澄读首页"><BrandMark /><span>{homeCopy.brand}</span><small>{homeCopy.brandTag}</small></a>
        <nav aria-label="主导航">
          <a href="#workbench">精读工作台</a><a href="#method">如何读</a><a href="#faq">使用边界</a>
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
            <div className="hero-kicker"><span>{homeCopy.kicker}</span><i />{homeCopy.kickerAside}</div>
            <h1>{homeCopy.headlineBefore}<br />{homeCopy.headlineMiddle}<em>{homeCopy.headlineEm}</em>{homeCopy.headlineAfter}</h1>
            <p className="hero-lead">{homeCopy.claim}</p>
            <div className="hero-proof">
              {homeCopy.proof.map((item) => (
                <div key={item.n}><b>{item.n}</b><span>{item.title}<small>{item.detail}</small></span></div>
              ))}
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
          {homeCopy.capabilities.map((item) => (
            <span key={item}><Check size={15} />{item}</span>
          ))}
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
              <button
                className="secondary-button"
                disabled={isSample || archive.isPending}
                title={isSample ? "示例论文不需要存档" : "把这篇的解析结果存到云端，换设备也能打开"}
                onClick={() => { setConsentChecked(false); setConsentOpen(true); }}
              >
                <Upload size={16} />
                {archive.isPending ? "上传中…" : savedArchiveId ? "已存到云端" : "存到云端"}
              </button>
              <button
                className="secondary-button"
                disabled={isSample}
                title={savedArchiveId ? "生成只读链接" : "先存到云端，才能生成分享链接"}
                onClick={() => {
                  if (!savedArchiveId) { setConsentChecked(false); setConsentOpen(true); return; }
                  setShareOpen(true);
                }}
              >
                <Share2 size={16} />分享
              </button>
            </div>
          </div>

          <article className="paper-meta">
            <div><span className="field-label">{result.field}</span><h2>{result.title}</h2><p>{result.oneSentence}</p></div>
            <dl><div><dt>建议精读</dt><dd>{result.readingMinutes} 分钟</dd></div><div><dt>理解难度</dt><dd>{result.difficulty}</dd></div></dl>
          </article>

          <p className="ai-note">以上解读内容由 AI 生成，仅供学习参考，请以论文原文为准。</p>

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
          <div className="method-intro"><h2>{homeCopy.methodTitleBefore}<br />{homeCopy.methodTitleAfter}</h2><p>{homeCopy.methodLead}</p></div>
          <div className="method-table">
            <div className="method-row head">{homeCopy.methodHead.map((cell) => <span key={cell}>{cell}</span>)}</div>
            {homeCopy.methodRows.map((row) => (
              <div className="method-row" key={row.kind}><b>{row.kind}</b><span>{row.ask}</span><span>{row.focus}</span></div>
            ))}
          </div>
        </section>

        <FaqSection />
      </main>

      <footer><a className="brand footer-brand" href="#top"><BrandMark /><span>{homeCopy.brand}</span></a><p>{homeCopy.footer}</p><div><a href="#workbench">工作台</a><a href="#method">阅读方法</a><a href="#faq">使用边界</a></div></footer>

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

      {consentOpen && (
        <div className="consent-backdrop" role="dialog" aria-modal="true" aria-labelledby="consent-title" onClick={() => setConsentOpen(false)}>
          <div className="consent-card" onClick={(event) => event.stopPropagation()}>
            <h3 id="consent-title">存到云端前，请确认</h3>
            <p>这篇的解析结果和原文会保存到服务器，方便你在其他设备打开。保存后你可以随时删除；如果内容涉嫌侵权或违法，站长也会下架。</p>
            <label className="consent-check">
              <input type="checkbox" checked={consentChecked} onChange={(event) => setConsentChecked(event.target.checked)} />
              <span>我确认对这篇论文有合法使用权，内容不含违法或侵权信息；我已在进入网站时同意《用户协议》，在此再次确认。</span>
            </label>
            <div className="consent-actions">
              <button className="secondary-button" onClick={() => setConsentOpen(false)}>取消</button>
              <button
                className="primary-button"
                disabled={!consentChecked || archive.isPending}
                onClick={() => archive.mutate({
                  deviceId: getDeviceId(),
                  paper: {
                    id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
                    title: result.title,
                    field: result.field,
                    createdAt: Date.now(),
                    sourceText: text.slice(0, 200_000),
                    result,
                  },
                })}
              >
                {archive.isPending ? "保存中…" : "同意并保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        deviceId={getDeviceId()}
        archiveId={savedArchiveId ?? ""}
        title={result.title}
        field={result.field}
        result={result}
      />
    </div>
  );
}
