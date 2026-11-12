import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, ChevronRight, RotateCcw, Lightbulb, FileText, Check } from "lucide-react";
import type { AnalysisResult } from "@contracts/analysis";
import type { RecallAttempt } from "@contracts/study";
import { buildRecallQuestions, gradeAnswer, summarize } from "../lib/recall";

/**
 * RecallPanel — 「复述检验」。
 *
 * 为什么要有这一屏：前面五个视图都在「给」，读者始终在接收。学习科学里最稳的结论是
 * retrieval practice（提取练习）比反复阅读有效得多。这里就做一件事：
 * 合上讲解，让读者自己讲一遍，讲不出来的地方直接跳回原文。
 *
 * 所有题目、评分、记录都在本地完成，不调用模型、不联网。
 */

interface Props {
  result: AnalysisResult;
  paperKey: string;
  onJump: (quote: string, heading?: string) => void;
}

const STORAGE_PREFIX = "cd.recall.";

function loadAttempts(paperKey: string): RecallAttempt[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + paperKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { attempts?: RecallAttempt[] };
    return Array.isArray(parsed.attempts) ? parsed.attempts : [];
  } catch {
    return [];
  }
}

export default function RecallPanel({ result, paperKey, onJump }: Props) {
  const questions = useMemo(() => buildRecallQuestions(result), [result]);
  const [queue, setQueue] = useState<string[]>(() => questions.map((question) => question.id));
  const [pos, setPos] = useState(0);
  const [draft, setDraft] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [attempts, setAttempts] = useState<RecallAttempt[]>(() => loadAttempts(paperKey));
  const [finished, setFinished] = useState(false);

  // 换论文时重置：否则会把上一篇的进度带过来
  useEffect(() => {
    const next = buildRecallQuestions(result);
    setQueue(next.map((question) => question.id));
    setPos(0);
    setDraft("");
    setShowHint(false);
    setFinished(false);
    setAttempts(loadAttempts(paperKey));
  }, [paperKey, result]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_PREFIX + paperKey, JSON.stringify({ paperKey, attempts, updatedAt: Date.now() }));
  }, [attempts, paperKey]);

  const byId = useMemo(() => new Map(questions.map((question) => [question.id, question])), [questions]);
  const current = byId.get(queue[pos] ?? "");
  const attempt = current ? attempts.find((item) => item.questionId === current.id) : undefined;
  const summary = summarize(attempts.filter((item) => queue.includes(item.questionId)));

  if (!questions.length) {
    return <div className="empty-state">这篇的解析结果还不足以出复述题。换一篇，或先补齐研究问题与核心结论。</div>;
  }

  const submit = () => {
    if (!current || !draft.trim()) return;
    const next = gradeAnswer(current, draft);
    setAttempts((previous) => [...previous.filter((item) => item.questionId !== next.questionId), next]);
  };

  const goNext = () => {
    setDraft("");
    setShowHint(false);
    if (pos + 1 >= queue.length) setFinished(true);
    else setPos(pos + 1);
  };

  const restart = (onlyWeak: boolean) => {
    const ids = onlyWeak
      ? queue.filter((id) => {
          const item = attempts.find((attemptItem) => attemptItem.questionId === id);
          return !item || item.verdict !== "掌握";
        })
      : questions.map((question) => question.id);
    setQueue(ids.length ? ids : questions.map((question) => question.id));
    setPos(0);
    setDraft("");
    setShowHint(false);
    setFinished(false);
  };

  if (finished) {
    return (
      <div className="recall-summary">
        <header className="view-heading">
          <span className="eyebrow">CAN YOU TEACH IT?</span>
          <h2>讲得出来，才算读懂</h2>
          <p>下面是这篇的复述成绩。红色题回到原文再读一遍，比重复看讲解有用。</p>
        </header>

        <div className="recall-stats">
          <div><b>{Math.round(summary.average * 100)}</b><span>平均分</span></div>
          <div><b>{summary.mastered}/{summary.total}</b><span>已掌握</span></div>
          <div><b>{Math.max(0, summary.total - summary.mastered)}</b><span>需回原文</span></div>
        </div>

        <ol className="recall-review">
          {queue.map((id) => {
            const question = byId.get(id);
            const item = attempts.find((attemptItem) => attemptItem.questionId === id);
            if (!question) return null;
            return (
              <li key={id} className={item?.verdict === "掌握" ? "ok" : "weak"}>
                <div className="recall-review-head">
                  <span className="recall-kind">{question.kind}</span>
                  <b>{question.prompt}</b>
                  <span className="recall-review-score">{item ? Math.round(item.score * 100) : "—"}</span>
                </div>
                {item?.missed.length ? <p>漏掉：{item.missed.join("、")}</p> : null}
                <button className="text-link" onClick={() => onJump(question.anchor.quote, question.anchor.heading)}>
                  回原文这一段 <ChevronRight size={14} />
                </button>
              </li>
            );
          })}
        </ol>

        <div className="recall-actions">
          <button className="secondary-button" onClick={() => restart(true)}><RotateCcw size={16} />只练没掌握的</button>
          <button className="primary-button" onClick={() => restart(false)}><BrainCircuit size={16} />全部重做</button>
        </div>
      </div>
    );
  }

  if (!current) return null;

  return (
    <div className="recall-view">
      <header className="view-heading">
        <span className="eyebrow">RECALL, DON'T REREAD</span>
        <h2>合上讲解，用自己的话讲一遍</h2>
        <p>答不全没关系：系统会告诉你漏了哪几句，并把你送回原文对应段落。</p>
      </header>

      <div className="recall-progress">
        <div className="recall-progress-bar"><i style={{ width: `${((pos + (attempt ? 1 : 0)) / queue.length) * 100}%` }} /></div>
        <span>第 {pos + 1} / {queue.length} 题</span>
      </div>

      <article className="recall-card">
        <span className="recall-kind">{current.kind}</span>
        <h3>{current.prompt}</h3>

        {showHint && <p className="recall-hint"><Lightbulb size={15} />{current.hint}</p>}

        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="用你自己的话写，不要照着上面的讲解抄…"
          rows={5}
          disabled={Boolean(attempt)}
        />

        {!attempt ? (
          <div className="recall-actions">
            <button className="secondary-button" onClick={() => setShowHint(true)} disabled={showHint}><Lightbulb size={16} />给点提示</button>
            <button className="primary-button" disabled={!draft.trim()} onClick={submit}><Check size={16} />提交复述</button>
          </div>
        ) : (
          <div className="recall-result" data-verdict={attempt.verdict}>
            <div className="recall-score">
              <b>{Math.round(attempt.score * 100)}</b>
              <span>/ 100 · {attempt.verdict}</span>
            </div>
            <p><b>你答到了：</b>{attempt.hit.length ? attempt.hit.join("、") : "—"}</p>
            <p><b>漏掉的：</b>{attempt.missed.length ? attempt.missed.join("、") : "没有明显遗漏"}</p>
            <details>
              <summary>看参考答案（先自己想一想再展开）</summary>
              <p>{current.reference}</p>
            </details>
            <div className="recall-actions">
              <button className="secondary-button" onClick={() => onJump(current.anchor.quote, current.anchor.heading)}>
                <FileText size={16} />回原文核对
              </button>
              <button className="primary-button" onClick={goNext}>
                {pos + 1 >= queue.length ? "看总结" : "下一题"}
              </button>
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
