import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FolderOpen, Loader2, X } from "lucide-react";
import type { MapRow, ThemeCluster } from "@contracts/study";
import { trpc } from "../providers/trpc";
import { buildMapRows, singletonKeywords, themeClusters, toMapCsv, toMapHtml, toMapMarkdown, type MapSource } from "../lib/libraryMap";
import { downloadFile } from "../lib/exportKit";

/**
 * MapPanel — 「批量」。
 *
 * 一篇一篇读，读到第五篇就开始记混：谁用什么方法、谁和谁结论相反。
 * 这里把已存档的若干篇横过来排成一张矩阵，并用关键词共现给出主题簇。
 * 数据只来自本机设备的存档，不额外调用模型。
 */

interface Props {
  open: boolean;
  deviceId: string;
  onClose: () => void;
  /** 当前工作台这篇：不必先存档也能进地图，否则「刚读完就想和上一篇比」永远差一步 */
  current?: MapSource;
}

const MAX_PAPERS = 24;

export default function MapPanel({ open, deviceId, onClose, current }: Props) {
  const utils = trpc.useUtils();
  const list = trpc.archive.mine.useQuery({ deviceId }, { enabled: open, staleTime: 10_000 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<MapRow[] | null>(null);
  const [clusters, setClusters] = useState<ThemeCluster[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // 只在「刚打开」时预选一次：否则用户手动取消勾选后会被自动选回去
  const preselected = useRef(false);

  const items = useMemo(() => (list.data?.ok ? list.data.items.slice(0, MAX_PAPERS) : []), [list.data]);

  useEffect(() => {
    if (!open) {
      preselected.current = false;
      return;
    }
    setRows(null);
    setError("");
  }, [open]);

  useEffect(() => {
    if (!open || preselected.current || !items.length) return;
    setSelected(new Set(items.map((item) => item.id)));
    preselected.current = true;
  }, [open, items]);

  if (!open) return null;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      const ids = [...selected];
      const sources: MapSource[] = [];
      // 当前这篇永远在列表里，且排在最前：它是用户此刻最关心的一篇
      if (current) sources.push(current);
      for (const id of ids) {
        const res = await utils.client.archive.get.query({ deviceId, id });
        if (res.ok && !sources.some((item) => item.result.title === res.paper.result.title)) {
          sources.push({ id, title: res.paper.title, field: res.paper.field, result: res.paper.result });
        }
      }
      if (!sources.length) {
        setError("还没有可用的论文。先解析一篇，或把读过的论文存到云端。");
        return;
      }
      const nextRows = buildMapRows(sources);
      setRows(nextRows);
      setClusters(themeClusters(nextRows));
    } catch {
      setError("生成失败，请检查网络后重试。");
    } finally {
      setBusy(false);
    }
  };

  const exportMap = (format: "html" | "md" | "csv") => {
    if (!rows) return;
    if (format === "html") downloadFile("文献地图.html", toMapHtml(rows, clusters), "text/html;charset=utf-8");
    if (format === "md") downloadFile("文献地图.md", toMapMarkdown(rows, clusters), "text/markdown;charset=utf-8");
    if (format === "csv") downloadFile("文献地图.csv", toMapCsv(rows), "text/csv;charset=utf-8");
  };

  const singles = rows ? singletonKeywords(rows) : [];

  return (
    <div className="map-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="map-card" onClick={(event) => event.stopPropagation()}>
        <header className="map-head">
          <div>
            <span className="eyebrow">READ THEM TOGETHER</span>
            <h3>文献地图</h3>
            <p>把已存档的论文横过来排成一张表：谁问什么、用什么方法、结论是否互相支持。</p>
          </div>
          <button className="map-close" aria-label="关闭" onClick={onClose}><X size={18} /></button>
        </header>

        <div className="map-picker">
          {list.isLoading && <p className="map-empty">读取存档…</p>}
          {!list.isLoading && items.length === 0 && (
            <p className="map-empty">
              {current
                ? "还没有云端存档。这次先把「当前这篇」放进地图；再存几篇，就能横向比较了。"
                : "还没有存档。先在每篇上点「存到云端」，这里才有材料可拼。"}
            </p>
          )}
          {items.map((item) => (
            <label key={item.id} className="map-pick">
              <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
              <span>
                <b>{item.title}</b>
                <small>{item.field || "未标注"} · {new Date(item.at).toLocaleDateString("zh-CN")}</small>
              </span>
            </label>
          ))}
        </div>

        {error && <p className="map-error">{error}</p>}

        <div className="map-actions">
          <span className="map-count">已选 {selected.size} 篇{items.length >= MAX_PAPERS ? `（最多 ${MAX_PAPERS}）` : ""}</span>
          <button className="primary-button" disabled={(!selected.size && !current) || busy} onClick={() => void generate()}>
            {busy ? <><Loader2 size={16} className="spin" />生成中…</> : <><FolderOpen size={16} />生成地图</>}
          </button>
        </div>

        {rows && (
          <div className="map-result">
            <div className="map-table-wrap">
              <table className="map-table">
                <thead>
                  <tr><th>论文</th><th>领域</th><th>研究问题</th><th>核心结论</th><th>方法</th><th>数据</th></tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="map-title">{row.title}</td>
                      <td>{row.field || "—"}</td>
                      <td>{row.question || "—"}</td>
                      <td>{row.claim || "—"}</td>
                      <td>{row.method || "—"}</td>
                      <td>{row.data || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="map-clusters">
              <h4>主题簇 <small>被两篇及以上共同提到</small></h4>
              {clusters.length ? (
                <ul>
                  {clusters.map((cluster) => (
                    <li key={cluster.keyword}>
                      <b>{cluster.keyword}</b><span>{cluster.titles.length} 篇</span>
                      <p>{cluster.titles.join(" · ")}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="map-empty">这批论文还没有共同关键词。要么再多几篇，要么检查解析出的 keywords 是否为空。</p>
              )}
              {singles.length > 0 && (
                <p className="map-singles">只出现一次的关键词（可能就是你还没覆盖的角度）：{singles.join("、")}</p>
              )}
            </div>

            <div className="map-actions">
              <button className="secondary-button" onClick={() => exportMap("html")}><Download size={16} />导出 HTML</button>
              <button className="secondary-button" onClick={() => exportMap("md")}><Download size={16} />导出 Markdown</button>
              <button className="secondary-button" onClick={() => exportMap("csv")}><Download size={16} />导出 CSV</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
