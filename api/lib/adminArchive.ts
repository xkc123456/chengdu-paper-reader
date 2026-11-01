// 后台的「论文云存档」区块：列表、查看、一键下架、下架日志。
//
// 设计原则：
//   - 列表只扫 m: 元信息，不把正文全拉出来
//   - 查看单篇才读 a: 全文
//   - 下架 = 真删（a: 与 m: 都删），再写一条不含正文的日志 t:
import type { ArchiveStore } from "./archives";
import { getArchive, listArchives, listTakedowns, takedownArchive } from "./archives";
import { removeShareByArchive, shareIdForArchive, type ShareStore } from "./shares";
import { listTickets, markTicketDone } from "./tickets";

export interface ArchiveAdminContext {
  req: {
    query(name: string): string | undefined;
    parseBody?(): Promise<Record<string, unknown>>;
  };
  html(body: string, status?: number): Response;
  text(body: string, status?: number): Response;
  redirect(location: string, status?: number): Response;
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function kb(size: number): string {
  return size > 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
}

function sourceLabel(source?: string): string {
  switch (source) {
    case "complaint": return "权利人投诉";
    case "report": return "用户举报";
    case "patrol": return "站长巡查";
    case "self": return "本人删除";
    case "other": return "其他";
    default: return source || "—";
  }
}

/**
 * 处理 `view` / `delete` 两种动作。没有动作时返回 null，让调用方继续渲染列表页。
 */
export async function handleArchiveAdmin(
  c: ArchiveAdminContext,
  store: ArchiveStore | undefined,
  key: string,
  shareStore?: ShareStore,
): Promise<Response | null> {
  if (!store) return null;

  // 下架记录导出：用于向权利人或监管证明「何时、因何、处置了什么」
  if (c.req.query("log") === "csv") {
    const rows = await listTakedowns(store, 500);
    const header = ["时间", "标题", "原因", "来源", "操作人", "请求方", "链接已撤"];
    const lines = rows.map((r) =>
      [r.at, r.title, r.reason, sourceLabel(r.source), r.operator ?? "", r.requester ?? "", r.shareRevoked ? "已撤" : ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = "\uFEFF" + [header.join(","), ...lines].join("\n");
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="takedown-log-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const view = c.req.query("view");
  if (view) {
    const record = await getArchive(store, view);
    if (!record) return c.text("Not Found", 404);
    const text = record.paper.sourceText ?? "";
    const shareId = shareStore ? await shareIdForArchive(shareStore, view) : null;
    const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(record.title)} · 存档详情</title>
<style>
  body{margin:0;padding:28px;font:14px/1.7 -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:#f5f7fa;color:#121926}
  h1{font-size:19px;margin:0 0 4px} .sub{color:#556174;font-size:13px;margin-bottom:16px}
  .card{background:#fff;border:1px solid #dce2eb;border-radius:10px;padding:16px;margin-bottom:16px}
  pre{white-space:pre-wrap;word-break:break-word;font:13px/1.7 ui-monospace,Consolas,monospace;margin:0;max-height:60vh;overflow:auto}
  .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  input[type=text]{flex:1;min-width:220px;padding:8px 10px;border:1px solid #dce2eb;border-radius:7px}
  button{padding:8px 14px;border-radius:7px;border:1px solid #b3261e;background:#b3261e;color:#fff;font-size:13px;cursor:pointer}
  a.back{color:#0064e6;text-decoration:none;font-size:13px}
  .tag{display:inline-block;padding:2px 8px;border-radius:999px;background:#eef2f7;color:#556174;font-size:12px}
</style></head><body>
  <h1>${esc(record.title)}</h1>
  <div class="sub">${esc(record.field || "未标注")} · ${esc(record.at.slice(0, 16).replace("T", " "))} · ${kb(record.size)} · 设备 ${esc(record.deviceId.slice(0, 8))}</div>
  ${shareId
    ? `<div class="card"><div class="sub" style="margin:0 0 6px">公开链接（下架时一并删除）</div><a href="/s/${shareId}" target="_blank" rel="noreferrer">/s/${shareId}</a></div>`
    : `<div class="card"><span class="tag">没有公开链接</span></div>`}
  <div class="card"><div class="row" style="justify-content:space-between;margin-bottom:10px">
    <b>下架这篇</b>
    <form method="post" action="/admin?key=${encodeURIComponent(key)}" class="row" style="flex:1">
      <input type="hidden" name="action" value="delete">
      <input type="hidden" name="id" value="${esc(record.id)}">
      <select name="source" style="padding:8px 10px;border:1px solid #dce2eb;border-radius:7px">
        <option value="complaint">权利人投诉</option>
        <option value="report">用户举报</option>
        <option value="patrol">站长巡查</option>
        <option value="other">其他</option>
      </select>
      <input type="text" name="requester" placeholder="投诉人/请求方（可选，写进日志）">
      <input type="text" name="reason" placeholder="下架原因（写进日志，例如：侵犯著作权）">
      <button type="submit" onclick="return confirm('确认下架并删除？删除后不可恢复。')">一键下架</button>
    </form>
  </div>
  <a class="back" href="/admin?key=${encodeURIComponent(key)}">← 返回列表</a></div>
  <div class="card"><div class="sub" style="margin:0 0 8px">原文（${text ? text.length + " 字" : "未保存原文"}）</div><pre>${esc(text.slice(0, 20000))}</pre></div>
  <div class="card"><div class="sub" style="margin:0 0 8px">解析结果（JSON）</div><pre>${esc(JSON.stringify(record.paper.result, null, 1).slice(0, 60000))}</pre></div>
</body></html>`;
    return c.html(html);
  }

  // GET 时 action 在 query；POST（表单提交）时 action 在 body 里。
  // 先解析 body，再决定要不要下架，否则 POST 进来永远匹配不到。
  const body = c.req.parseBody ? await c.req.parseBody() : {};
  const action = String(body.action ?? "") || (c.req.query("action") ?? "");
  if (action === "delete") {
    const id = String(body.id ?? c.req.query("id") ?? "");
    const reason = String(body.reason ?? "").trim() || "站长下架";
    const source = String(body.source ?? "").trim() || "patrol";
    const requester = String(body.requester ?? "").trim();
    if (!id) return c.text("Bad Request", 400);
    // 先删公开链接，再删存档：任何一步失败都不会留下「链接还活着、内容已删」的半截状态
    const revoked = shareStore ? await removeShareByArchive(shareStore, id) : null;
    await takedownArchive(store, id, reason, {
      operator: "admin",
      source,
      requester,
      shareRevoked: Boolean(revoked),
    });
    // 删完回列表；不把标题带进 URL
    return c.redirect(`/admin?key=${encodeURIComponent(key)}&done=1`, 303);
  }

  return null;
}

/** 投诉 / 申诉工单：标记已处理 */
export async function handleTicketsAdmin(
  c: ArchiveAdminContext,
  store: ArchiveStore | undefined,
  key: string,
): Promise<Response | null> {
  if (!store) return null;
  const body = c.req.parseBody ? await c.req.parseBody() : {};
  const action = String(body.action ?? "") || (c.req.query("action") ?? "");
  if (action !== "ticket-done") return null;
  const id = String(body.id ?? c.req.query("id") ?? "");
  if (!id) return c.text("Bad Request", 400);
  await markTicketDone(store, id);
  return c.redirect(`/admin?key=${encodeURIComponent(key)}&ticket=done`, 303);
}

/** 列表页上的「投诉与申诉」区块 */
export async function renderTicketsSection(store: ArchiveStore, key: string): Promise<string> {
  const tickets = await listTickets(store, 50);
  const open = tickets.filter((t) => t.status === "open").length;
  const rows = tickets
    .map(
      (t) => `<tr>
        <td class="mono">${esc(t.at.slice(0, 19).replace("T", " "))}</td>
        <td>${t.kind === "complaint" ? "侵权投诉" : "用户申诉"}</td>
        <td><b>${esc(t.subject)}</b></td>
        <td style="white-space:normal;max-width:420px">${esc(t.body.slice(0, 300))}</td>
        <td class="dim">${esc(t.contact || "—")}</td>
        <td class="dim">${esc(t.ref || "—")}</td>
        <td>${t.status === "open" ? "待处理" : "已处理"}</td>
        <td>${t.status === "open"
          ? `<form method="post" action="/admin?key=${encodeURIComponent(key)}" style="display:inline">
               <input type="hidden" name="action" value="ticket-done">
               <input type="hidden" name="id" value="${esc(t.id)}">
               <button type="submit" style="padding:4px 10px;border-radius:6px;border:1px solid #dce2eb;background:#f5f7fa;cursor:pointer;font-size:12px">标记已处理</button>
             </form>`
          : "—"}</td>
      </tr>`,
    )
    .join("");

  return `<div class="lock">
    <div class="lock-state">📨 投诉与申诉（待处理 ${open} / 共 ${tickets.length}）</div>
    <p class="hint">来自页脚「侵权投诉」与用户端「联系我们申诉」。内容只在这里可见，不会公开。</p>
    <div class="card" style="margin-top:10px">
      ${tickets.length
        ? `<table><thead><tr><th>时间</th><th>类型</th><th>标题</th><th>内容</th><th>联系方式</th><th>涉及内容</th><th>状态</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table>`
        : `<div class="empty">还没有投诉或申诉。</div>`}
    </div>
  </div>`;
}

/** 列表页上的那一块 HTML */
export async function renderArchiveSection(store: ArchiveStore, key: string): Promise<string> {
  const [items, takedowns] = await Promise.all([listArchives(store), listTakedowns(store, 10)]);
  const rows = items
    .map(
      (item) => `<tr>
        <td class="mono">${esc(item.at.slice(0, 16).replace("T", " "))}</td>
        <td><b>${esc(item.title)}</b></td>
        <td>${esc(item.field || "—")}</td>
        <td class="mono dim">${esc(item.deviceId.slice(0, 8))}</td>
        <td class="mono dim">${kb(item.size)}${item.hasSource ? " · 含原文" : ""}</td>
        <td><a class="link" href="/admin?key=${encodeURIComponent(key)}&view=${encodeURIComponent(item.id)}">查看</a></td>
      </tr>`,
    )
    .join("");

  const logRows = takedowns
    .map(
      (item) => `<tr>
        <td class="mono">${esc(item.at.slice(0, 19).replace("T", " "))}</td>
        <td><b>${esc(item.title || item.id)}</b></td>
        <td>${esc(item.reason)}</td>
        <td>${esc(sourceLabel(item.source))}</td>
        <td class="mono dim">${esc(item.operator || "—")}</td>
        <td class="dim">${esc(item.requester || "—")}</td>
        <td class="dim">${item.shareRevoked ? "已撤" : "—"}</td>
      </tr>`,
    )
    .join("");

  return `<div class="lock">
    <div class="lock-state">📦 论文云存档（${items.length} 篇）</div>
    <p class="hint">用户主动点「存到云端」才会出现在这里。列表只显示元信息，点「查看」才读正文；「一键下架」是真删除，并留一条不含正文的日志。</p>
    <div class="card" style="margin-top:10px">
      ${items.length ? `<table><thead><tr><th>时间</th><th>标题</th><th>学科</th><th>设备</th><th>大小</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">还没有云存档。用户点「存到云端」后，这里会出现。</div>`}
    </div>
    <div class="sub" style="margin:14px 0 6px">下架记录（最近 ${takedowns.length} 条，可作处置留痕）</div>
    ${takedowns.length
      ? `<div class="card"><table><thead><tr><th>时间</th><th>标题</th><th>原因</th><th>来源</th><th>操作人</th><th>请求方</th><th>链接</th></tr></thead><tbody>${logRows}</tbody></table></div>
         <p class="hint"><a href="/admin?key=${encodeURIComponent(key)}&log=csv">导出下架记录 CSV</a></p>`
      : `<p class="hint">还没有下架记录。</p>`}
  </div>`;
}
