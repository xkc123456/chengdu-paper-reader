import { useState } from "react";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { CONSENT_NOTICE, LEGAL_VERSION } from "@contracts/legal";
import { trpc } from "../providers/trpc";
import { getVisitorId, saveConsent } from "../lib/visitor";

type Props = {
  onAgree: () => void;
  /** 打开站内法律文本页：#/privacy 或 #/terms */
  onOpenLegal: (doc: "privacy" | "terms") => void;
};

/**
 * 进站同意门：不勾选不能使用，勾选框默认不勾。
 *
 * 合规要点（改动前先想清楚再动）：
 * - 不得默认勾选——预勾的同意是无效同意；
 * - 加粗摘要必须保留，且措辞与《隐私政策》开头的重点提示保持同义；
 * - 同意后把【时间戳 + 版本号 + 访客标识】上报服务端存证（consent.record）。
 */
export default function ConsentGate({ onAgree, onOpenLegal }: Props) {
  const [checked, setChecked] = useState(false);
  const record = trpc.consent.record.useMutation();

  const agree = () => {
    if (!checked) return;
    saveConsent();
    // 先放行界面再上报：存证失败（网络抖动）不该把用户拦在门外，
    // 本地已记录版本号，下次启动可补偿上报
    onAgree();
    record.mutate({ visitorId: getVisitorId(), version: LEGAL_VERSION });
  };

  return (
    <div className="gate-backdrop" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className="gate-card consent-card">
        <div className="gate-head">
          <span className="gate-icon"><ShieldCheck size={20} /></span>
          <div>
            <h2 id="consent-title">使用前先读两句</h2>
            <p>澄读会怎么处理你的论文和 API Key，都在下面两份文件里。</p>
          </div>
        </div>

        <p className="consent-notice"><strong>{CONSENT_NOTICE}</strong></p>

        <label className="consent-check">
          <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
          <span>
            我已阅读并同意
            <button type="button" className="consent-link" onClick={() => onOpenLegal("privacy")}>《隐私政策》</button>
            和
            <button type="button" className="consent-link" onClick={() => onOpenLegal("terms")}>《用户协议》</button>
            （{LEGAL_VERSION}）
          </span>
        </label>

        <div className="gate-actions">
          <button className="primary-button gate-submit" disabled={!checked} onClick={agree}>
            同意并进入<ArrowRight size={16} />
          </button>
        </div>
        <p className="consent-footnote">不同意将无法使用本站服务；你可以随时在阅读档案页撤回同意。</p>
      </div>
    </div>
  );
}
