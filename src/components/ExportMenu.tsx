import { useState } from "react";
import { Download } from "lucide-react";
import type { AnalysisResult } from "@contracts/analysis";
import type { RecallAttempt, RecallQuestion } from "@contracts/study";
import { buildExport, downloadFile, exportFileName, type ExportFormat } from "../lib/exportKit";

/**
 * ExportMenu — 「落点」。
 *
 * 之前只有一个「导出笔记」，抄走的是页面上的文字；这里改成分目标导出：
 * Obsidian（双链/callout/mermaid）、Word（.doc，Word 直接开）、证据表 CSV、原始 JSON。
 * 换的是「读完的东西能不能在别处继续用」，不是多几个按钮。
 */

const ITEMS: { format: ExportFormat; label: string; hint: string }[] = [
  { format: "obsidian", label: "Obsidian 笔记", hint: "带双链、callout 与关系图" },
  { format: "word", label: "Word 文档（.docx）", hint: "原生格式，标题/表格/行距都在" },
  { format: "csv", label: "证据表 CSV", hint: "一条论断一行，Excel 可筛" },
  { format: "json", label: "原始 JSON", hint: "给脚本或二次加工用" },
];

interface Props {
  result: AnalysisResult;
  questions?: RecallQuestion[];
  attempts?: RecallAttempt[];
}

export default function ExportMenu({ result, questions, attempts }: Props) {
  const [open, setOpen] = useState(false);

  const run = (format: ExportFormat) => {
    const { content, mime } = buildExport(format, result, { questions, attempts });
    downloadFile(exportFileName(result, format), content, mime);
    setOpen(false);
  };

  return (
    <div className="export-menu">
      <button className="secondary-button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <Download size={16} />导出
      </button>
      {open && (
        <>
          <button className="export-backdrop" aria-label="关闭导出菜单" onClick={() => setOpen(false)} />
          <div className="export-list" role="menu">
            {ITEMS.map((item) => (
              <button key={item.format} role="menuitem" onClick={() => run(item.format)}>
                <b>{item.label}</b>
                <span>{item.hint}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
