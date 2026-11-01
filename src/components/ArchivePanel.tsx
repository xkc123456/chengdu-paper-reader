import { useState } from "react";
import type { ArchivedPaper } from "@contracts/archive";
import { trpc } from "../providers/trpc";

interface Props {
  open: boolean;
  deviceId: string;
  onClose: () => void;
  onOpen: (paper: ArchivedPaper, archiveId: string) => void;
  onAppeal?: (ref: string) => void;
}

export default function ArchivePanel({ open, deviceId, onClose, onOpen, onAppeal }: Props) {
  const utils = trpc.useUtils();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const list = trpc.archive.mine.useQuery({ deviceId }, { enabled: open, staleTime: 10_000 });
  const notices = trpc.archive.notices.useQuery({ deviceId }, { enabled: open, staleTime: 10_000 });
  const remove = trpc.archive.remove.useMutation({
    onSuccess: () => { void utils.archive.mine.invalidate(); },
  });

  if (!open) return null;

  const items = list.data?.ok ? list.data.items : [];

  const openOne = async (id: string) => {
    setBusyId(id);
    setError("");
    try {
      const res = await utils.client.archive.get.query({ deviceId, id });
      if (res.ok) onOpen(res.paper, id);
      else setError("这篇打不开了，可能已被删除。");
    } catch {
      setError("打开失败，请检查网络后重试。");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div role="dialog" aria-modal="true" onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", display: "flex", justifyContent: "flex-end", zIndex: 85 }}>
      <aside onClick={(event) => event.stopPropagation()}
        style={{ width: "min(420px, 92vw)", height: "100%", background: "#fff", color: "#121926", padding: 20, overflowY: "auto", boxShadow: "-12px 0 40px rgba(15,23,42,.18)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>我的存档</h3>
          <button onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <p style={{ margin: "0 0 10px", color: "#7c8798", fontSize: 12, lineHeight: 1.6 }}>
          存在这台浏览器对应的设备 ID 下。换设备、换浏览器看不到；收藏链接可以发给别人看。
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 0 12px", fontSize: 12, color: "#7c8798" }}>
          <span>设备 {deviceId.slice(0, 8)}</span>
          <button
            onClick={() => void list.refetch()}
            style={{ border: "1px solid #dce2eb", background: "#fff", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}
          >
            刷新
          </button>
        </div>

        {error && <p style={{ color: "#b3261e", fontSize: 13 }}>{error}</p>}
        {notices.data?.ok && notices.data.items.length > 0 && (
          <div style={{ border: "1px solid #f0c9a8", background: "#fff7f0", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#8a4b1e", marginBottom: 6 }}>
              有 {notices.data.items.length} 篇内容已被下架
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#8a4b1e", lineHeight: 1.8 }}>
              {notices.data.items.map((n) => (
                <li key={n.at + n.title}>{n.title || "（无标题）"} · {n.reason} · {new Date(n.at).toLocaleDateString("zh-CN")}</li>
              ))}
            </ul>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#8a4b1e" }}>如认为处理有误，可联系站长申诉。</p>
            {onAppeal && (
              <button
                onClick={() => onAppeal(notices.data!.ok ? notices.data!.items[0].title : "")}
                style={{ marginTop: 8, padding: "6px 12px", borderRadius: 7, border: "1px solid #d08a55", background: "#fff", color: "#8a4b1e", cursor: "pointer", fontSize: 12 }}
              >
                联系我们申诉
              </button>
            )}
          </div>
        )}
        {list.isError && <p style={{ color: "#b3261e", fontSize: 13 }}>加载失败，请点「刷新」重试。</p>}
        {list.isLoading && <p style={{ color: "#7c8798", fontSize: 13 }}>加载中…</p>}

        {!list.isLoading && items.length === 0 && (
          <div style={{ padding: "28px 0", color: "#7c8798", fontSize: 13, lineHeight: 1.8 }}>
            还没有存过论文。<br />导入一篇后点「存到云端」，就会出现在这里。<br />
            如果刚存过，等几秒点「刷新」。
          </div>
        )}

        {items.map((item) => (
          <div key={item.id} style={{ border: "1px solid #e3e8ef", borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.5 }}>{item.title}</div>
            <div style={{ color: "#7c8798", fontSize: 12, margin: "4px 0 10px" }}>
              {item.field || "未标注"} · {new Date(item.at).toLocaleString("zh-CN")} · {Math.max(1, Math.round(item.size / 1024))} KB
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button disabled={busyId === item.id} onClick={() => void openOne(item.id)}
                style={{ padding: "6px 12px", borderRadius: 7, border: "none", background: "#0064e6", color: "#fff", cursor: "pointer", fontSize: 13 }}>
                {busyId === item.id ? "打开中…" : "打开"}
              </button>
              <button disabled={remove.isPending}
                onClick={() => { if (confirm("删除后不可恢复，确定删除这篇存档？")) remove.mutate({ deviceId, id: item.id }); }}
                style={{ padding: "6px 12px", borderRadius: 7, border: "1px solid #dce2eb", background: "#fff", color: "#b3261e", cursor: "pointer", fontSize: 13 }}>
                删除
              </button>
            </div>
          </div>
        ))}
      </aside>
    </div>
  );
}
