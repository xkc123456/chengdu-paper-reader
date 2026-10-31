import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/** 原型 v5.1 文案。页底一块入口，点开后再看四条说明。 */
const FAQ_ITEMS = [
  {
    question: "会不会凭空画图？",
    answer: "原文没有数字，就不会生成数据图。图表只在有原文依据时出现。",
  },
  {
    question: "机制和结论会不会被写成铁板事实？",
    answer: "关系与机制仍需回到原文核对；推断不会被写成已经成立的结论。",
  },
  {
    question: "表格、公式能不能替我校对？",
    answer: "不能完全替代。OCR 可能误识别上下标、符号和复杂排版，关键处请对照原文。",
  },
  {
    question: "示范课里的数据能当研究证据吗？",
    answer: "不能。教学示例使用构造数据，只用来演示怎么拆一篇论文。",
  },
] as const;

function FaqItem({
  question,
  answer,
  initiallyOpen,
}: {
  question: string;
  answer: string;
  initiallyOpen: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const seeded = useRef(false);

  // 只在弹窗打开时把第一条展开。之后交给浏览器自己记住开合，避免 React 把 open 写死。
  useLayoutEffect(() => {
    if (seeded.current || !initiallyOpen || !ref.current) return;
    ref.current.open = true;
    seeded.current = true;
  }, [initiallyOpen]);

  return (
    <details ref={ref}>
      <summary>
        {question}
        <span aria-hidden="true">+</span>
      </summary>
      <p>{answer}</p>
    </details>
  );
}

export default function FaqSection() {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      (previouslyFocused ?? triggerRef.current)?.focus();
    };
  }, [open]);

  return (
    <section className="faq-section" id="faq" aria-labelledby="faq-heading">
      <div>
        <span className="eyebrow">常见疑问</span>
        <h2 id="faq-heading">你想问的那几件事</h2>
      </div>
      <p className="faq-preview">图表怎么来、结论怎么写、公式能不能替你校——点开看说明。</p>
      <button
        ref={triggerRef}
        className="primary-button faq-open"
        type="button"
        onClick={() => setOpen(true)}
      >
        查看常见疑问
      </button>

      {open && (
        <div
          className="faq-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            className="faq-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
          >
            <h3 id={titleId}>常见疑问</h3>
            <p className="faq-lead">把原先分散在页上的说明收进这里，需要时再看。</p>
            {FAQ_ITEMS.map((item, index) => (
              <FaqItem
                key={item.question}
                question={item.question}
                answer={item.answer}
                initiallyOpen={index === 0}
              />
            ))}
            <button className="secondary-button faq-close" type="button" onClick={() => setOpen(false)}>
              关闭
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
