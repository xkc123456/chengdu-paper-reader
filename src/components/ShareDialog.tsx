import { useEffect, useState } from "react";
import type { AnalysisResult } from "@contracts/analysis";
import { trpc } from "../providers/trpc";

interface Props {
  open: boolean;
  onClose: () => void;
  deviceId: string;
  archiveId: string;
  title: string;
  field: string;
  result: AnalysisResult;
}

const card: React.CSSProperties = {
  width: "min(520px, 92vw)",
  background: "#fff",
  color: "#121926",
  borderRadius: 14,
  padding: 22,
  boxShadow: "0 20px 60px rgba(15,23,42,.28)",
};

export default function ShareDialog({ open, onClose, deviceId, archiveId, title, field, result }: Props) {
  const [days, setDays] = useState<7 | 30 | null>(null);
  const [link, setLink] = useState<{ url: string; id: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const create = trpc.share.create.useMutation({
    onSuccess: (res) => {
      if (res.ok) setLink({ url: res.url, id: res.id, token: res.deleteToken });
    },
  });
  const remove = trpc.share.remove.useMutation({
    onSuccess: () => setLink(null),
  });

  // 每次重新打开都从"未生成"开始：否则上一次的链接/报错会留在弹窗里，
  // 用户会以为新链接已经建好了。
  useEffect(() => {
    if (open) {
      setLink(null);
      setCopied(false);
      setDays(7);
      create.reset();
      remove.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const error = create.data && !create.data.ok ? create.data.reason : create.error?.message ?? "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 80, padding: 16 }}
    >
      <div style={card} onClick={(event) => event.stopPropagation()}>
        <h3 style={{ margin: "0 0 6px", fontSize: 18 }}>生成只读链接</h3>
        <p style={{ margin: "0 0 14px", color: "#556174", fontSize: 13, lineHeight: 1.6 }}>
          链接公开可见，内容是这篇的<strong>解析结果</strong>，不含原文全文；你可以随时删除。
          请勿分享含未公开数据或无权传播的论文。
        </p>

        {!link ? (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {([7, 30, null] as const).map((value) => (
                <button
                  key={String(value)}
                  onClick={() => setDays(value)}
                  style={{
                    flex: 1, padding: "9px 10px", borderRadius: 8, cursor: "pointer", fontSize: 13,
                    border: days === value ? "1px solid #0064e6" : "1px solid #dce2eb",
                    background: days === value ? "#eaf2ff" : "#fff",
                    color: days === value ? "#0064e6" : "#121926",
                  }}
                >
                  {value ? `${value} 天后失效` : "永久有效"}
                </button>
              ))}
            </div>
            {error && <p style={{ color: "#b3261e", fontSize: 13, margin: "0 0 10px" }}>{error}</p>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={onClose} style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid #dce2eb", background: "#fff", cursor: "pointer" }}>取消</button>
              <button
                disabled={create.isPending}
                onClick={() => create.mutate({ deviceId, archiveId, title, field, result, expiresInDays: days })}
                style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: "#0064e6", color: "#fff", cursor: "pointer" }}
              >
                {create.isPending ? "生成中…" : "生成链接"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input readOnly value={link.url} style={{ flex: 1, padding: "9px 10px", border: "1px solid #dce2eb", borderRadius: 8, fontSize: 13 }} />
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link.url);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
                style={{ padding: "9px 14px", borderRadius: 8, border: "none", background: "#0064e6", color: "#fff", cursor: "pointer" }}
              >
                {copied ? "已复制" : "复制"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
              <button
                onClick={() => remove.mutate({ id: link.id, token: link.token })}
                disabled={remove.isPending}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #b3261e", background: "#fff", color: "#b3261e", cursor: "pointer", fontSize: 13 }}
              >
                {remove.isPending ? "删除中…" : "删除链接"}
              </button>
              <a href={link.url} target="_blank" rel="noreferrer" style={{ color: "#0064e6", fontSize: 13 }}>打开预览 →</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
