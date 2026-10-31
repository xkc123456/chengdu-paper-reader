import { useEffect, useRef, useState } from "react";
import {
  CircleAlert, FileText, FileUp, Image, KeyRound, LoaderCircle, LockKeyhole,
  ScanText, ShieldCheck, Sparkles, X,
} from "lucide-react";
import { recognizeFile } from "../lib/extract";
import { maskKey } from "../lib/key";

type Mode = "text" | "document" | "screenshot";
type Props = {
  text: string;
  setText: (value: string) => void;
  onAnalyze: () => void;
  pending: boolean;
  error: string;
  apiKey: string;
  setApiKey: (value: string) => void;
};

export default function ImportPanel({ text, setText, onAnalyze, pending, error, apiKey, setApiKey }: Props) {
  const [mode, setMode] = useState<Mode>("text");
  const [recognizing, setRecognizing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [fileName, setFileName] = useState("");
  const [warning, setWarning] = useState("");
  const [localError, setLocalError] = useState("");
  const [preview, setPreview] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const handleFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setLocalError("文件不能超过 20 MB。长篇论文可先导入核心章节。 ");
      return;
    }
    setLocalError("");
    setWarning("");
    setFileName(file.name || "剪贴板截图");
    setRecognizing(true);
    setProgress(0);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : "");
    try {
      const result = await recognizeFile(file, (message, value) => {
        setStatus(message);
        if (value !== undefined) setProgress(value);
      });
      setText(result.text);
      setWarning(result.warning ?? "");
      setStatus(`已识别 ${result.text.length.toLocaleString()} 个字符，请校对后解析`);
    } catch (caught) {
      setStatus("");
      setLocalError(caught instanceof Error ? caught.message : "文件识别失败，请重试。");
    } finally {
      setRecognizing(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const accept = mode === "screenshot" ? "image/png,image/jpeg,image/webp,image/bmp" : ".pdf,.docx,.txt,.md,.csv";

  return (
    <section className="import-panel" id="import" aria-label="导入论文">
      <div className="import-topline">
        <div><h2>把你的论文放进来</h2></div>
        <span className="privacy"><LockKeyhole size={13} />经你同意可存入阅读档案，随时可删</span>
      </div>
      <div className="import-tabs" role="tablist" aria-label="导入方式">
        <button role="tab" aria-selected={mode === "text"} className={mode === "text" ? "active" : ""} onClick={() => setMode("text")}><FileText size={16} />粘贴文字</button>
        <button role="tab" aria-selected={mode === "document"} className={mode === "document" ? "active" : ""} onClick={() => setMode("document")}><FileUp size={16} />上传文档</button>
        <button role="tab" aria-selected={mode === "screenshot"} className={mode === "screenshot" ? "active" : ""} onClick={() => setMode("screenshot")}><Image size={16} />截图识别</button>
      </div>

      <div className="import-content">
        {mode === "text" ? (
          <label className="text-input-wrap">
            <span className="sr-only">论文文字</span>
            <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="粘贴论文全文，或先粘贴摘要、研究方法、结果等核心章节……" />
          </label>
        ) : (
          <div
            className={`drop-zone ${dragging ? "dragging" : ""}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); void handleFile(event.dataTransfer.files[0]); }}
            onPaste={(event) => {
              if (mode === "screenshot") {
                const file = Array.from(event.clipboardData.files)[0];
                if (file) { event.preventDefault(); void handleFile(file); }
              }
            }}
            tabIndex={0}
          >
            <input ref={fileInput} className="sr-only" type="file" accept={accept} onChange={(event) => void handleFile(event.target.files?.[0])} />
            {mode === "screenshot" && preview ? <img src={preview} alt="待识别截图预览" /> : <ScanText size={28} strokeWidth={1.5} />}
            <div className="drop-copy">
              <strong>{fileName || (mode === "screenshot" ? "拖入、选择或粘贴论文截图" : "拖入或选择论文文档")}</strong>
              <span>{mode === "screenshot" ? "支持 PNG、JPG、WebP；中英文混合识别" : "支持 PDF、DOCX、TXT、MD、CSV，最大 20 MB"}</span>
            </div>
            <button className="secondary-button" disabled={recognizing} onClick={() => fileInput.current?.click()}>{recognizing ? "正在识别" : "选择文件"}</button>
          </div>
        )}

        {(recognizing || status) && mode !== "text" && (
          <div className="recognition-status" aria-live="polite">
            <div>{recognizing && <LoaderCircle size={15} className="spin" />}<span>{status}</span>{recognizing && <b>{progress}%</b>}</div>
            {recognizing && <progress max="100" value={progress} />}
          </div>
        )}
        {warning && <p className="inline-warning">{warning}</p>}
        {mode !== "text" && text && !recognizing && (
          <label className="recognized-text">
            <span>识别结果 <small>可直接修改校对</small></span>
            <textarea value={text} onChange={(event) => setText(event.target.value)} />
          </label>
        )}
      </div>

      <div className="key-panel">
        <label className="key-field">
          <KeyRound size={15} />
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value.replace(/\s/g, ""))}
            placeholder="粘贴你的 API Key（DeepSeek、OpenAI 等，通常 sk- 开头）"
            autoComplete="off"
            spellCheck={false}
            aria-label="我的 API Key"
          />
          {apiKey && <button type="button" className="key-clear" onClick={() => setApiKey("")}>清除</button>}
        </label>
        <p className="key-hint">
          <ShieldCheck size={13} />
          <span>
            {apiKey
              ? <>已保存在本机浏览器（{maskKey(apiKey)}），换台设备需要重新填写。</>
              : <>本站不替访客承担模型费用，解析用的是你自己的 Key。</>}
            {" "}Key 仅供单次使用：仅随本次解析请求转发给你选用的模型服务商，不存储、不写日志、用完即弃。
            <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer">去获取（以 DeepSeek 为例）</a>
          </span>
        </p>
      </div>

      {(localError || error) && <div className="form-error" role="alert"><CircleAlert size={17} /><span>{localError || error}</span></div>}
      <div className="analyze-row">
        <button className="primary-button analyze-button" disabled={pending || recognizing || text.trim().length < 80} onClick={onAnalyze}>
          {pending ? <LoaderCircle size={18} className="spin" /> : <Sparkles size={18} />}
          {pending ? "正在梳理论文…" : "开始精读拆解"}
        </button>
        {text && !pending && <button className="icon-button clear-button" aria-label="清空论文文字" onClick={() => { setText(""); setFileName(""); setStatus(""); setWarning(""); setPreview(""); }}><X size={17} /></button>}
      </div>
      <p className="quota-note">{text.length.toLocaleString()} / 60,000 字符 · 长文耗时更久，识别后可先校对再解析，避免重复调用</p>
      {pending && (
        <div className="analysis-progress" aria-live="polite">
          <div className="thinking-line"><i /><i /><i /></div>
          <strong>老师正在通读并搭建结构</strong>
          <span>依次整理研究问题、主体关系、分栏对照与原文数据</span>
        </div>
      )}
    </section>
  );
}
