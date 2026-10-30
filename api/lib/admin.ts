// 站长后台：把 KV 里的院校上报读出来，给一个能直接看的表格 + CSV 导出。
//
// 地址：/admin?key=<ADMIN_KEY>          看表格
//       /admin?key=<ADMIN_KEY>&format=csv 导出 CSV
//
// ADMIN_KEY 通过 `wrangler secret put ADMIN_KEY` 注入，不进仓库、不出现在前端。

import { DEFAULT_LOCK_MESSAGE, readLock, writeLock } from "./lock";

interface KvLike {
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor?: string;
  }>;
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface AdminEnv {
  PROFILES?: KvLike;
  ADMIN_KEY?: string;
}

export interface AdminContext {
  req: { query(name: string): string | undefined };
  env: unknown;
  html(body: string): Response;
  text(body: string, status?: 200 | 404 | 500): Response;
  redirect(location: string, status?: 303): Response;
}

type Record_ = {
  at: string;
  region: string;
  city: string;
  school: string;
  college: string;
  major: string;
  degree: string;
  ua: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toCsv(rows: Record_[]): string {
  const header = ["时间", "地区", "城市", "学校", "学院", "专业", "学历层次", "UA"];
  const lines = rows.map((row) =>
    [row.at, row.region, row.city, row.school, row.college, row.major, row.degree, row.ua]
      .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
      .join(","),
  );
  // BOM：Excel 直接打开不乱码
  return "\uFEFF" + [header.join(","), ...lines].join("\n");
}

async function readAll(store: KvLike): Promise<Record_[]> {
  const rows: Record_[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const listed = await store.list({ prefix: "p:", limit: 1000, cursor });
    const values = await Promise.all(
      listed.keys.map(async (key) => {
        const raw = await store.get(key.name);
        if (!raw) return null;
        try {
          return JSON.parse(raw) as Record_;
        } catch {
          return null;
        }
      }),
    );
    rows.push(...(values.filter(Boolean) as Record_[]));
    if (listed.list_complete) break;
    cursor = listed.cursor;
  }
  return rows.sort((a, b) => (a.at < b.at ? 1 : -1));
}

export async function handleAdmin(c: AdminContext): Promise<Response> {
  const env = (c.env ?? {}) as AdminEnv;
  const expected = env.ADMIN_KEY ?? "";
  const provided = c.req.query("key") ?? "";

  // 没配 key 就当作不存在，避免误把后台公开
  if (!expected || provided !== expected) return c.text("Not Found", 404);
  const store = env.PROFILES;
  if (!store) return c.text("当前运行环境没有绑定 KV（PROFILES）", 500);

  // 暂停 / 恢复：页面上的表单用 GET 提交，处理完 303 回后台本身
  const action = c.req.query("action") ?? "";
  if (action === "lock" || action === "unlock") {
    const message = (c.req.query("msg") ?? "").trim() || DEFAULT_LOCK_MESSAGE;
    await writeLock(store, {
      locked: action === "lock",
      message: action === "lock" ? message : "",
      at: new Date().toISOString(),
    });
    return c.redirect(`/admin?key=${encodeURIComponent(provided)}`, 303);
  }

  const lock = await readLock(store);
  const rows = await readAll(store);

  if ((c.req.query("format") ?? "") === "csv") {
    return new Response(toCsv(rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="chengdu-reader-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const schools = new Set(rows.map((row) => row.school)).size;
  const body = rows
    .map(
      (row) => `<tr>
        <td class="mono">${escapeHtml(row.at.replace("T", " ").slice(0, 16))}</td>
        <td>${escapeHtml(row.region)}</td>
        <td>${escapeHtml(row.city)}</td>
        <td><b>${escapeHtml(row.school)}</b></td>
        <td>${escapeHtml(row.college)}</td>
        <td>${escapeHtml(row.major)}</td>
        <td>${escapeHtml(row.degree)}</td>
        <td class="mono dim">${escapeHtml((row.ua || "").includes("Mobile") ? "手机" : "桌面")}</td>
      </tr>`,
    )
    .join("");

  const key = escapeHtml(provided);
  const html = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>澄读 · 使用登记</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 28px; font: 14px/1.6 -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; background: #f5f7fa; color: #121926; }
  h1 { font-size: 20px; margin: 0 0 6px; }
  .sub { color: #556174; font-size: 13px; margin-bottom: 18px; }
  .stats { display: flex; gap: 24px; margin-bottom: 18px; }
  .stats b { font-size: 22px; display: block; }
  .card { background: #fff; border: 1px solid #dce2eb; border-radius: 10px; overflow: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { padding: 9px 12px; border-bottom: 1px solid #eef2f7; text-align: left; white-space: nowrap; }
  th { background: #f8fafc; font-weight: 600; color: #556174; position: sticky; top: 0; }
  tr:hover td { background: #f8fbff; }
  .mono { font-family: ui-monospace, "Cascadia Code", Consolas, monospace; }
  .dim { color: #7c8798; }
  .actions { margin-bottom: 14px; }
  .actions a { display: inline-block; padding: 8px 14px; border-radius: 7px; background: #0064e6; color: #fff; text-decoration: none; font-size: 13px; }
  .lock { border: 1px solid #dce2eb; border-radius: 10px; padding: 14px 16px; background: #fff; margin-bottom: 18px; }
  .lock.on { border-color: #e0a17e; background: #fff7f2; }
  .lock-state { font-weight: 600; margin-bottom: 10px; }
  .lock form { display: flex; gap: 8px; flex-wrap: wrap; }
  .lock input[name="msg"] { flex: 1; min-width: 200px; padding: 8px 10px; border: 1px solid #dce2eb; border-radius: 7px; font-size: 13px; }
  .lock button { padding: 8px 14px; border-radius: 7px; border: 1px solid #dce2eb; background: #f5f7fa; font-size: 13px; cursor: pointer; }
  .lock button[value="lock"] { background: #a85a32; border-color: #a85a32; color: #fff; }
  .lock button[value="unlock"] { background: #087a62; border-color: #087a62; color: #fff; }
  .hint { margin: 10px 0 0; color: #7c8798; font-size: 12px; }
  .empty { padding: 36px; text-align: center; color: #7c8798; }
</style></head>
<body>
  <h1>澄读 · 使用登记</h1>
  <div class="sub">共 ${rows.length} 条 · 来自 ${schools} 所学校</div>

  <div class="lock ${lock.locked ? "on" : ""}">
    <div class="lock-state">${lock.locked ? "🔒 站点已暂停" : "✅ 站点正常使用"}</div>
    <form method="get" action="/admin">
      <input type="hidden" name="key" value="${key}">
      <input name="msg" placeholder="暂停时显示的说明（可选）" value="${escapeHtml(lock.message)}">
      <button name="action" value="lock">暂停使用</button>
      <button name="action" value="unlock">恢复使用</button>
    </form>
    <p class="hint">暂停后访客看到说明页、解析接口返回 503，数据仍保留；生效通常 10–60 秒（KV 缓存）。</p>
  </div>

  <div class="actions"><a href="/admin?key=${key}&format=csv">导出 CSV</a></div>
  <div class="card">
    ${rows.length
      ? `<table><thead><tr><th>时间</th><th>地区</th><th>城市</th><th>学校</th><th>学院</th><th>专业</th><th>学历</th><th>设备</th></tr></thead><tbody>${body}</tbody></table>`
      : `<div class="empty">还没有记录。有人填写院校信息后，这里就会出现。</div>`}
  </div>
</body></html>`;

  return c.html(html);
}
