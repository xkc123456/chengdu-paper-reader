import { useEffect, useState } from "react";
import { trpc } from "../providers/trpc";

interface Props {
  open: boolean;
  kind: "complaint" | "appeal";
  defaultRef?: string;
  deviceId?: string;
  onClose: () => void;
}

/**
 * 一个弹窗两用：
 *   complaint —— 页脚的「侵权投诉」（任何人可用，含权利人）
 *   appeal    —— 用户内容被下架后的「联系我们申诉」
 */
export default function FeedbackDialog({ open, kind, defaultRef = "", deviceId, onClose }: Props) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [contact, setContact] = useState("");
  const [ref, setRef] = useState(defaultRef);
  const [sent, setSent] = useState(false);

  const submit = trpc.ticket.submit.useMutation({
    onSuccess: (res) => { if (res.ok) setSent(true); },
  });

  useEffect(() => {
    if (open) {
      setSent(false);
      setSubject("");
      setBody("");
      setContact("");
      setRef(defaultRef);
      submit.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind, defaultRef]);

  if (!open) return null;

  const isAppeal = kind === "appeal";
  const title = isAppeal ? "联系我们申诉" : "侵权投诉";
  const hint = isAppeal
    ? "如果你认为内容被误删，请说明理由；站长会在收到后复核。"
    : "如果你是权利人，或发现侵权内容，请填写下方信息；站长会在收到后处理。";
  const error = submit.data && !submit.data.ok ? submit.data.reason : submit.error?.message ?? "";
  const canSubmit = subject.trim().length > 0 && body.trim().length >= 5 && !submit.isPending;

  return (
    <div role="dialog" aria-modal="true" onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 95 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "min(560px, 94vw)", maxHeight: "88vh", overflowY: "auto", background: "#fff", color: "#121926", borderRadius: 14, padding: 22, boxShadow: "0 20px 60px rgba(15,23,42,.28)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>{title}</h3>
          <button onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <p style={{ margin: "0 0 14px", color: "#556174", fontSize: 13, lineHeight: 1.7 }}>{hint}</p>

        {sent ? (
          <div style={{ padding: "16px 0" }}>
            <p style={{ color: "#0f7a5a", fontSize: 14, margin: "0 0 12px" }}>已提交，站长会尽快处理。</p>
            <button onClick={onClose} style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: "#0064e6", color: "#fff", cursor: "pointer" }}>关闭</button>
          </div>
        ) : (
          <>
            <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>标题</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={100}
              placeholder={isAppeal ? "例如：我的《琵琶行》精读被误删" : "例如：某篇分享内容侵犯我的著作权"}
              style={{ width: "100%", boxSizing: "border-box", padding: "9px 10px", border: "1px solid #dce2eb", borderRadius: 8, marginBottom: 12 }} />

            <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>具体说明</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={6}
              placeholder={isAppeal ? "说明你认为误删的理由，以及希望怎么处理" : "请说明涉及的内容、权利证明或侵权事实"}
              style={{ width: "100%", boxSizing: "border-box", padding: "9px 10px", border: "1px solid #dce2eb", borderRadius: 8, marginBottom: 12, fontFamily: "inherit", resize: "vertical" }} />

            <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>联系方式（可选，便于回复）</label>
            <input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={100}
              placeholder="邮箱或微信"
              style={{ width: "100%", boxSizing: "border-box", padding: "9px 10px", border: "1px solid #dce2eb", borderRadius: 8, marginBottom: 12 }} />

            <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>涉及的内容（可选）</label>
            <input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={200}
              placeholder="标题或分享链接"
              style={{ width: "100%", boxSizing: "border-box", padding: "9px 10px", border: "1px solid #dce2eb", borderRadius: 8, marginBottom: 12 }} />

            {error && <p style={{ color: "#b3261e", fontSize: 13, margin: "0 0 10px" }}>{error === "rate-limited" ? "提交太频繁，请稍后再试。" : error}</p>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={onClose} style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid #dce2eb", background: "#fff", cursor: "pointer" }}>取消</button>
              <button disabled={!canSubmit}
                onClick={() => submit.mutate({ kind, subject: subject.trim(), body: body.trim(), contact: contact.trim() || undefined, ref: ref.trim() || undefined, deviceId })}
                style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: canSubmit ? "#0064e6" : "#9db8dc", color: "#fff", cursor: canSubmit ? "pointer" : "default" }}>
                {submit.isPending ? "提交中…" : "提交"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
