import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import type { LegalDoc } from "../legalCopy";

type Props = {
  doc: LegalDoc;
  onClose: () => void;
};

/**
 * 站内法律文本页（#/privacy、#/terms）。整页覆盖，不用路由库：
 * 站点是单页应用，用 hash 区分就够了，深链接也能直接打开。
 */
export default function LegalPage({ doc, onClose }: Props) {
  useEffect(() => {
    document.title = `${doc.title} · 澄读`;
    window.scrollTo(0, 0);
    return () => {
      document.title = "澄读 · 论文精读工作台";
    };
  }, [doc.title]);

  return (
    <div className="legal-page">
      <div className="legal-body">
        <button className="secondary-button legal-back" onClick={onClose}>
          <ArrowLeft size={15} />返回
        </button>
        <h1>{doc.title}</h1>
        <p className="legal-meta">最近更新：{doc.updated}　版本：{doc.version}</p>
        {doc.blocks.map((block, index) => {
          if (block.type === "h2") return <h2 key={index}>{block.text}</h2>;
          if (block.type === "li") {
            return <p key={index} className={`legal-li${block.strong ? " strong" : ""}`}>· {block.text}</p>;
          }
          return <p key={index} className={block.strong ? "strong" : undefined}>{block.text}</p>;
        })}
        <button className="secondary-button legal-back" onClick={onClose}>
          <ArrowLeft size={15} />返回
        </button>
      </div>
    </div>
  );
}
