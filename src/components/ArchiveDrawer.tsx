import { useState } from "react";
import { BookMarked, LoaderCircle, Trash2, X, ShieldOff } from "lucide-react";
import { trpc } from "../providers/trpc";
import { getVisitorId, clearConsent } from "../lib/visitor";
import { clearProfile } from "../lib/profile";

type Props = {
  open: boolean;
  onClose: () => void;
  /** 载入一篇存档：恢复原文与拆解结果 */
  onLoad: (id: string) => void;
};

/**
 * 阅读档案抽屉：列出这台设备存下的论文，支持载入和单篇删除，
 * 底部是「清空档案并撤回同意」（隐私政策第四节的撤回入口，必须真实可用）。
 */
export default function ArchiveDrawer({ open, onClose, onLoad }: Props) {
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const list = trpc.archive.list.useQuery(
    { visitorId: getVisitorId() },
    { enabled: open },
  );
  const remove = trpc.archive.remove.useMutation({
    onSuccess: () => list.refetch(),
  });
  const revoke = trpc.consent.revoke.useMutation({
    onSuccess: () => {
      // 撤回 = 删档 + 清本地状态 + 回到同意门
      clearConsent();
      clearProfile();
      window.location.reload();
    },
  });

  if (!open) return null;

  const items = list.data?.ok ? list.data.items : [];

  return (
    <div className="archive-backdrop" role="dialog" aria-modal="true" aria-labelledby="archive-title" onClick={onClose}>
      <aside className="archive-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="archive-head">
          <h2 id="archive-title"><BookMarked size={17} />阅读档案</h2>
          <button className="icon-button" aria-label="关闭" onClick={onClose}><X size={17} /></button>
        </div>

        {list.isPending && <p className="archive-note"><LoaderCircle size={14} className="spin" /> 正在读取…</p>}
        {list.data && !list.data.ok && list.data.reason === "unsupported" && (
          <p className="archive-note">当前环境未开启档案存储（本地开发模式）。部署到线上后可用。</p>
        )}
        {list.data && list.data.ok && items.length === 0 && (
          <p className="archive-note">还没有存档。解析完一篇论文后，点工作台右上角的「存入档案」。</p>
        )}

        <ul className="archive-list">
          {items.map((item) => (
            <li key={item.id}>
              <button className="archive-item" onClick={() => onLoad(item.id)}>
                <b>{item.title}</b>
                <span>{item.field} · {new Date(item.savedAt).toLocaleString("zh-CN", { hour12: false })}</span>
              </button>
              <button
                className="icon-button archive-delete"
                aria-label={`删除《${item.title}》`}
                disabled={remove.isPending}
                onClick={() => remove.mutate({ visitorId: getVisitorId(), id: item.id })}
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>

        <div className="archive-foot">
          {!confirmRevoke ? (
            <button className="text-button archive-revoke" onClick={() => setConfirmRevoke(true)}>
              <ShieldOff size={14} />清空档案并撤回同意
            </button>
          ) : (
            <div className="archive-revoke-confirm">
              <p>撤回同意后，服务器将删除你的全部阅读档案和院校信息，你需要重新同意才能继续使用。确认撤回？</p>
              <div>
                <button className="secondary-button" onClick={() => setConfirmRevoke(false)}>再想想</button>
                <button
                  className="primary-button danger"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate({ visitorId: getVisitorId() })}
                >
                  {revoke.isPending ? "正在撤回…" : "确认撤回"}
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
