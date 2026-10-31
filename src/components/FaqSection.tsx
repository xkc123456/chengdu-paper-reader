import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { homeCopy } from "../homeCopy";

/** 页底一块入口，点开后再看四条说明。文案与无脚本正文共用 homeCopy。 */

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
        <span className="eyebrow">{homeCopy.faqEyebrow}</span>
        <h2 id="faq-heading">{homeCopy.faqHeading}</h2>
      </div>
      <p className="faq-preview">{homeCopy.faqPreview}</p>
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
            {homeCopy.faq.map((item, index) => (
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
