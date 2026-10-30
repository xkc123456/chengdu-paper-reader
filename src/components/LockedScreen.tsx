import { RefreshCw } from "lucide-react";

/** 站长在后台按了「暂停使用」时，访客看到的页面 */
export default function LockedScreen({ message }: { message: string }) {
  return (
    <div className="locked-shell">
      <div className="locked-card">
        <span className="eyebrow">PAUSED</span>
        <h1>暂停使用</h1>
        <p>{message || "站点正在维护，请稍后再来。"}</p>
        <button className="secondary-button" onClick={() => location.reload()}>
          <RefreshCw size={15} />刷新页面
        </button>
        <small>如果长时间没有恢复，请联系分享链接给你的同学。</small>
      </div>
    </div>
  );
}
