// 文档收件箱：合作方用 INBOX_TOKEN 上传，访客导入成功后也会留一份副本。
//
// 正文在 R2（绑定 INBOX，桶 cdreader-inbox），元信息在 PROFILES 这个 KV 里，
// 键形如 inbox:<uuid>。两边都没绑定时，接口返回明确错误，不把整个应用拖垮。
//
// INBOX_TOKEN 和 ADMIN_KEY 只在服务端比对。访客那条路径不认这两个口令。

import { DEGREES } from "@contracts/profile";
import { log } from "./logger";
import { readLock } from "./lock";
import { clientKey, take } from "./ratelimit";

export const MAX_INBOX_BYTES = 10 * 1024 * 1024;
/** multipart 会比文件本身多一点边界，正文上限仍按 10MB 卡。 */
export const INBOX_BODY_LIMIT = MAX_INBOX_BYTES + 512 * 1024;
export const VISITOR_RATE_PER_HOUR = 20;

export const R2_MISSING = "当前运行环境没有绑定 R2（INBOX），文档收件箱不可用";
export const KV_MISSING =
  "当前运行环境没有绑定 KV（PROFILES），无法保存收件箱元信息";
const TYPE_ERROR =
  "不支持的文件类型，仅接受文本、Markdown、PNG、JPEG、WebP、GIF 和 PDF";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EXT_TYPE: Record<string, string> = {
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
};

const ALIAS: Record<string, string> = {
  "text/x-markdown": "text/markdown",
  "text/md": "text/markdown",
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "application/x-pdf": "application/pdf",
};

const DEFAULT_NAME: Record<string, string> = {
  "text/plain": "note.txt",
  "text/csv": "note.csv",
  "text/markdown": "note.md",
  "image/png": "image.png",
  "image/jpeg": "image.jpg",
  "image/webp": "image.webp",
  "image/gif": "image.gif",
  "application/pdf": "document.pdf",
};

const PROFILE_LIMIT = {
  region: 32,
  city: 32,
  school: 64,
  college: 64,
  major: 64,
  degree: 32,
} as const;

export interface InboxProfile {
  region: string;
  city: string;
  school: string;
  college: string;
  major: string;
  degree: string;
}

export interface InboxMeta {
  id: string;
  title: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
  /** 给人看的来源标签。访客固定是「访客导入」，合作方是上传时带的名字。 */
  source: string;
  channel: "partner" | "visitor";
  r2Key: string;
  profile?: InboxProfile;
}

export interface InboxKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor?: string;
  }>;
}

export interface InboxObject {
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  size?: number;
  httpMetadata?: { contentType?: string };
}

export interface InboxBucket {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    options?: { httpMetadata?: { contentType?: string } }
  ): Promise<unknown>;
  get(key: string): Promise<InboxObject | null>;
  delete?(key: string): Promise<void>;
}

export interface InboxBindings {
  PROFILES?: InboxKv;
  INBOX?: InboxBucket;
  INBOX_TOKEN?: string;
  ADMIN_KEY?: string;
}

export class InboxReject extends Error {
  constructor(
    readonly status: 400 | 413 | 503,
    message: string
  ) {
    super(message);
  }
}

interface Prepared {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
  title: string;
  source: string;
  channel: "partner" | "visitor";
  profile?: InboxProfile;
}

interface ViewContext {
  req: { query(name: string): string | undefined };
  text(body: string, status?: number): Response;
  html(body: string, status?: number): Response;
}

export function bindingsOf(env: unknown): InboxBindings {
  if (!env || typeof env !== "object") return {};
  return env as InboxBindings;
}

/** 口令不对、没配、或根本没带，都当作没有这个接口。 */
export function inboxTokenOk(
  env: unknown,
  authorization: string | null | undefined
): boolean {
  const expected = (bindingsOf(env).INBOX_TOKEN ?? "").trim();
  if (!expected) return false;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? "");
  if (!match) return false;
  return safeEqual(expected, match[1]);
}

export function readProfile(input: unknown): InboxProfile | undefined {
  let value: unknown = input;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const raw = value as Record<string, unknown>;
  const pick = (key: keyof typeof PROFILE_LIMIT) => {
    const item = raw[key];
    if (typeof item !== "string") return "";
    return item
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, PROFILE_LIMIT[key]);
  };
  const degreeRaw = pick("degree");
  const profile: InboxProfile = {
    region: pick("region"),
    city: pick("city"),
    school: pick("school"),
    college: pick("college"),
    major: pick("major"),
    degree: (DEGREES as readonly string[]).includes(degreeRaw) ? degreeRaw : "",
  };
  if (!profile.school && !profile.major && !profile.region && !profile.college)
    return undefined;
  return profile;
}

export function resolveUpload(input: {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
}): { bytes: Uint8Array; contentType: string; filename: string } {
  if (input.bytes.byteLength === 0) throw new InboxReject(400, "文件是空的");
  if (input.bytes.byteLength > MAX_INBOX_BYTES)
    throw new InboxReject(413, "文件超过 10MB 上限");

  const filename = sanitizeFilename(input.filename, "");
  const ext = extensionOf(filename);
  const declared = canonicalType(input.contentType);
  if (declared === "invalid") throw new InboxReject(400, TYPE_ERROR);
  const fromExt = ext ? EXT_TYPE[ext] : undefined;

  let contentType = "";
  if (declared && declared !== "application/octet-stream" && fromExt) {
    if (!typesCompatible(declared, fromExt))
      throw new InboxReject(400, TYPE_ERROR);
    contentType = preferredType(declared, fromExt, ext);
  } else if (declared && declared !== "application/octet-stream" && !ext) {
    contentType = declared;
  } else if (
    (!declared || declared === "application/octet-stream") &&
    fromExt
  ) {
    contentType = fromExt;
  } else {
    throw new InboxReject(400, TYPE_ERROR);
  }

  if (!magicOk(input.bytes, contentType))
    throw new InboxReject(400, "文件内容和类型对不上");
  return {
    bytes: input.bytes,
    contentType,
    filename: filename || DEFAULT_NAME[contentType] || "upload.bin",
  };
}

export async function listInbox(
  kv: InboxKv,
  limit = 200
): Promise<InboxMeta[]> {
  const rows: InboxMeta[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10 && rows.length < limit; page += 1) {
    const listed = await kv.list({ prefix: "inbox:", limit: 100, cursor });
    const values = await Promise.all(
      listed.keys.map(async key => {
        const raw = await kv.get(key.name);
        return raw ? parseMeta(raw) : null;
      })
    );
    for (const item of values) if (item) rows.push(item);
    if (listed.list_complete || !listed.cursor) break;
    cursor = listed.cursor;
  }
  return rows
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
}

export async function getInbox(
  kv: InboxKv,
  id: string
): Promise<InboxMeta | null> {
  if (!UUID_RE.test(id)) return null;
  const raw = await kv.get(`inbox:${id}`);
  if (!raw) return null;
  return parseMeta(raw);
}

export async function handlePartnerInbox(
  request: Request,
  env: unknown
): Promise<Response> {
  if (!inboxTokenOk(env, request.headers.get("authorization")))
    return notFound();
  const bindings = bindingsOf(env);
  const unavailable = storageError(bindings);
  if (unavailable) return json({ error: unavailable }, 503);
  try {
    const prepared = await readPartnerBody(request);
    const meta = await persist(bindings, prepared);
    return json({ ok: true, ...publicMeta(meta) }, 201);
  } catch (error) {
    return fail(error);
  }
}

export async function handleVisitorInbox(
  request: Request,
  env: unknown
): Promise<Response> {
  // 公开入口：不看 Authorization，避免把口令做进浏览器。先按 IP 限流，再谈存储。
  const bindings = bindingsOf(env);
  const limit = take(
    `inbox:${clientKey(request.headers)}`,
    VISITOR_RATE_PER_HOUR
  );
  if (!limit.ok) {
    return json({ error: "上传过于频繁，请稍后再试" }, 429, {
      "retry-after": String(limit.retryAfterSec),
    });
  }
  const unavailable = storageError(bindings);
  if (unavailable) return json({ error: unavailable }, 503);
  try {
    const lock = await readLock(bindings.PROFILES);
    if (lock.locked) return json({ error: "站点已暂停" }, 503);
    const prepared = await readVisitorBody(request);
    const meta = await persist(bindings, prepared);
    return json({ ok: true, ...publicMeta(meta) }, 201);
  } catch (error) {
    return fail(error);
  }
}

export async function handleInboxAdmin(
  c: ViewContext,
  env: InboxBindings,
  key: string
): Promise<Response | null> {
  const id = c.req.query("inbox") ?? "";
  if (!id) return null;
  try {
    const kv = env.PROFILES;
    if (!kv) return c.text(KV_MISSING, 500);
    const meta = await getInbox(kv, id);
    if (!meta) return c.text("Not Found", 404);
    const wantBytes =
      c.req.query("download") === "1" || c.req.query("inline") === "1";
    if (!wantBytes) return c.html(await renderPreview(meta, env.INBOX, key));
    if (!env.INBOX) return c.text(R2_MISSING, 503);
    const object = await env.INBOX.get(meta.r2Key);
    if (!object) return c.text("Not Found", 404);
    const bytes = new Uint8Array(await object.arrayBuffer());
    const inline =
      c.req.query("inline") === "1" &&
      c.req.query("download") !== "1" &&
      meta.contentType.startsWith("image/");
    return new Response(bytes, {
      headers: {
        "content-type": meta.contentType,
        "content-disposition": contentDisposition(meta.filename, inline),
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    log.error("inbox admin failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return c.text("文档读取失败", 500);
  }
}

export async function renderInboxSection(
  kv: InboxKv,
  bucket: InboxBucket | undefined,
  key: string
): Promise<string> {
  let items: InboxMeta[] = [];
  let failed = false;
  try {
    items = await listInbox(kv);
  } catch (error) {
    failed = true;
    log.error("inbox list failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const rows = items
    .map(item => {
      const href = adminHref(key, { inbox: item.id });
      const download = adminHref(key, { inbox: item.id, download: "1" });
      return `<tr>
        <td class="mono">${esc(formatTime(item.createdAt))}</td>
        <td><b>${esc(item.title)}</b></td>
        <td>${esc(typeLabel(item.contentType))}</td>
        <td class="mono dim">${esc(formatSize(item.size))}</td>
        <td>${esc(sourceLabel(item))}</td>
        <td><a class="link" href="${esc(href)}">查看</a> · <a class="link" href="${esc(download)}">下载</a></td>
      </tr>`;
    })
    .join("");
  const storageHint = bucket ? "" : `<p class="hint">${esc(R2_MISSING)}</p>`;
  return `<div class="lock">
    <div class="lock-state">📥 文档收件箱（${items.length}）</div>
    <p class="hint">合作方用接口上传；访客在工作台导入文本、图片或 PDF 后，这里也会留下一份。查看和下载都要本页口令，没有公开链接。</p>
    ${storageHint}
    <div class="card" style="margin-top:10px">
      ${
        failed
          ? `<div class="empty">收件箱暂时读不出来。</div>`
          : items.length
            ? `<table><thead><tr><th>时间</th><th>标题</th><th>类型</th><th>大小</th><th>来源</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table>`
            : `<div class="empty">还没有文档。</div>`
      }
    </div>
  </div>`;
}

async function readPartnerBody(request: Request): Promise<Prepared> {
  const headerType = request.headers.get("content-type") ?? "";
  if (headerType.toLowerCase().includes("multipart/form-data")) {
    return readForm(await request.formData(), "partner");
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  const resolved = resolveUpload({
    bytes,
    contentType: headerType,
    filename: headerValue(request, "x-inbox-filename"),
  });
  return {
    ...resolved,
    title: sanitizeTitle(
      headerValue(request, "x-inbox-title"),
      titleFrom(resolved.filename, bytes)
    ),
    source: sanitizeSource(headerValue(request, "x-inbox-source"), "合作方"),
    channel: "partner",
  };
}

async function readVisitorBody(request: Request): Promise<Prepared> {
  const headerType = (request.headers.get("content-type") ?? "").toLowerCase();
  if (headerType.includes("multipart/form-data"))
    return readForm(await request.formData(), "visitor");
  if (headerType.includes("application/json"))
    return readJson(new Uint8Array(await request.arrayBuffer()));
  const bytes = new Uint8Array(await request.arrayBuffer());
  const resolved = resolveUpload({
    bytes,
    contentType: headerType,
    filename: headerValue(request, "x-inbox-filename"),
  });
  return {
    ...resolved,
    title: sanitizeTitle(
      headerValue(request, "x-inbox-title"),
      titleFrom(resolved.filename, bytes)
    ),
    source: "访客导入",
    channel: "visitor",
    profile: readProfile(headerValue(request, "x-inbox-profile")),
  };
}

async function readForm(
  form: FormData,
  channel: "partner" | "visitor"
): Promise<Prepared> {
  const titleField = stringField(form.get("title"));
  const source =
    channel === "visitor"
      ? "访客导入"
      : sanitizeSource(stringField(form.get("source")), "合作方");
  const profile =
    channel === "visitor"
      ? readProfile(form.get("profile") ?? profileFromFields(form))
      : undefined;
  const file = form.get("file");
  if (isUpload(file)) {
    const resolved = resolveUpload({
      bytes: new Uint8Array(await file.arrayBuffer()),
      contentType: file.type || stringField(form.get("contentType")),
      filename: file.name || stringField(form.get("filename")),
    });
    return {
      ...resolved,
      title: sanitizeTitle(
        titleField,
        titleFrom(resolved.filename, resolved.bytes)
      ),
      source,
      channel,
      profile,
    };
  }
  const text = stringField(form.get("text"));
  if (!text) throw new InboxReject(400, "没有收到文件或文本");
  return fromText(
    text,
    titleField,
    stringField(form.get("filename")),
    source,
    channel,
    profile
  );
}

function readJson(bytes: Uint8Array): Prepared {
  if (bytes.byteLength > INBOX_BODY_LIMIT)
    throw new InboxReject(413, "文件超过 10MB 上限");
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new InboxReject(400, "请求格式不对");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new InboxReject(400, "请求格式不对");
  const body = parsed as Record<string, unknown>;
  // 只取文本和允许的画像字段。apiKey、姓名、电话、邮箱即使传了也不读、不存。
  if (typeof body.text !== "string")
    throw new InboxReject(400, "没有收到文件或文本");
  return fromText(
    body.text,
    typeof body.title === "string" ? body.title : "",
    typeof body.filename === "string" ? body.filename : "paste.txt",
    "访客导入",
    "visitor",
    readProfile(body.profile)
  );
}

function fromText(
  text: string,
  title: string,
  filename: string,
  source: string,
  channel: "partner" | "visitor",
  profile?: InboxProfile
): Prepared {
  const bytes = new TextEncoder().encode(text);
  const name = filename || (channel === "visitor" ? "paste.txt" : "note.txt");
  const ext = extensionOf(sanitizeFilename(name, ""));
  const contentType =
    ext === ".md" || ext === ".markdown"
      ? "text/markdown"
      : ext === ".csv"
        ? "text/csv"
        : "text/plain";
  const safeName = EXT_TYPE[ext]
    ? sanitizeFilename(name, DEFAULT_NAME[contentType])
    : DEFAULT_NAME[contentType];
  const resolved = resolveUpload({ bytes, contentType, filename: safeName });
  return {
    ...resolved,
    title: sanitizeTitle(title, titleFrom(resolved.filename, bytes)),
    source: channel === "visitor" ? "访客导入" : source,
    channel,
    profile: channel === "visitor" ? profile : undefined,
  };
}

async function persist(env: InboxBindings, item: Prepared): Promise<InboxMeta> {
  const kv = env.PROFILES;
  const bucket = env.INBOX;
  if (!kv || !bucket)
    throw new InboxReject(503, storageError(env) ?? R2_MISSING);
  const id = crypto.randomUUID();
  const r2Key = `items/${id}`;
  const meta: InboxMeta = {
    id,
    title: item.title,
    filename: item.filename,
    contentType: item.contentType,
    size: item.bytes.byteLength,
    createdAt: new Date().toISOString(),
    source: item.source,
    channel: item.channel,
    r2Key,
    ...(item.profile ? { profile: item.profile } : {}),
  };
  await bucket.put(r2Key, item.bytes, {
    httpMetadata: { contentType: item.contentType },
  });
  try {
    await kv.put(`inbox:${id}`, JSON.stringify(meta));
  } catch (error) {
    if (bucket.delete) {
      try {
        await bucket.delete(r2Key);
      } catch {
        // 元信息没写上，对象可能留在桶里，下次部署后可以按 items/ 清理
      }
    }
    throw error;
  }
  return meta;
}

async function renderPreview(
  meta: InboxMeta,
  bucket: InboxBucket | undefined,
  key: string
): Promise<string> {
  const back = adminHref(key);
  const download = adminHref(key, { inbox: meta.id, download: "1" });
  let body = "";
  if (!bucket) {
    body = `<p>${esc(R2_MISSING)}</p>`;
  } else if (meta.contentType.startsWith("text/")) {
    const object = await bucket.get(meta.r2Key);
    if (!object) body = "<p>文件不在了。</p>";
    else {
      const text = await object.text();
      const clipped = text.length > 100_000;
      body = `<pre>${esc(clipped ? text.slice(0, 100_000) : text)}</pre>${clipped ? `<p class="hint">只显示前 100,000 字，完整文件请下载。</p>` : ""}`;
    }
  } else if (meta.contentType.startsWith("image/")) {
    const src = adminHref(key, { inbox: meta.id, inline: "1" });
    body = `<img class="inbox-img" alt="${esc(meta.title)}" src="${esc(src)}" referrerpolicy="no-referrer" />`;
  } else {
    body = "<p>这个类型请下载后查看。</p>";
  }
  const profileLine = meta.profile
    ? [
        meta.profile.region,
        meta.profile.city,
        meta.profile.school,
        meta.profile.college,
        meta.profile.major,
        meta.profile.degree,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(meta.title)} · 文档收件箱</title>
<style>
  body{margin:0;padding:28px;font:14px/1.7 -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:#f5f7fa;color:#121926}
  h1{font-size:19px;margin:0 0 4px} .sub{color:#556174;font-size:13px;margin-bottom:16px}
  .card{background:#fff;border:1px solid #dce2eb;border-radius:10px;padding:16px;margin-bottom:16px}
  pre{white-space:pre-wrap;word-break:break-word;font:13px/1.7 ui-monospace,Consolas,monospace;margin:0;max-height:70vh;overflow:auto}
  a{color:#0064e6;text-decoration:none}
  .inbox-img{max-width:100%;height:auto;border-radius:8px}
  .hint{color:#7c8798;font-size:12px}
</style></head><body>
  <h1>${esc(meta.title)}</h1>
  <div class="sub">${esc(sourceLabel(meta))} · ${esc(typeLabel(meta.contentType))} · ${esc(formatSize(meta.size))} · ${esc(formatTime(meta.createdAt))}</div>
  ${profileLine ? `<div class="sub">${esc(profileLine)}</div>` : ""}
  <div class="card"><a href="${esc(download)}">下载</a> · <a href="${esc(back)}">返回列表</a></div>
  <div class="card">${body}</div>
</body></html>`;
}

function storageError(env: InboxBindings): string | null {
  if (
    !env.PROFILES ||
    typeof env.PROFILES.put !== "function" ||
    typeof env.PROFILES.get !== "function"
  )
    return KV_MISSING;
  if (
    !env.INBOX ||
    typeof env.INBOX.put !== "function" ||
    typeof env.INBOX.get !== "function"
  )
    return R2_MISSING;
  return null;
}

function fail(error: unknown): Response {
  if (error instanceof InboxReject)
    return json({ error: error.message }, error.status);
  log.error("inbox failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  return json({ error: "文档保存失败" }, 500);
}

function publicMeta(meta: InboxMeta) {
  return {
    id: meta.id,
    title: meta.title,
    filename: meta.filename,
    contentType: meta.contentType,
    size: meta.size,
    createdAt: meta.createdAt,
    source: meta.source,
    channel: meta.channel,
  };
}

function parseMeta(raw: string): InboxMeta | null {
  try {
    const value = JSON.parse(raw) as Partial<InboxMeta>;
    if (!value || typeof value.id !== "string" || !UUID_RE.test(value.id))
      return null;
    if (value.r2Key !== `items/${value.id}`) return null;
    if (value.channel !== "partner" && value.channel !== "visitor") return null;
    if (typeof value.title !== "string" || typeof value.filename !== "string")
      return null;
    if (typeof value.contentType !== "string" || typeof value.size !== "number")
      return null;
    if (typeof value.createdAt !== "string" || typeof value.source !== "string")
      return null;
    const profile = value.profile ? readProfile(value.profile) : undefined;
    return {
      id: value.id,
      title: value.title.slice(0, 120),
      filename: value.filename.slice(0, 120),
      contentType: value.contentType.slice(0, 80),
      size: value.size,
      createdAt: value.createdAt,
      source: value.source.slice(0, 80),
      channel: value.channel,
      r2Key: value.r2Key,
      ...(profile ? { profile } : {}),
    };
  } catch {
    return null;
  }
}

function canonicalType(header: string): string {
  const raw = header.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!raw) return "";
  if (raw === "application/octet-stream") return raw;
  const alias = ALIAS[raw] ?? raw;
  if (alias in DEFAULT_NAME) return alias;
  return "invalid";
}

function typesCompatible(declared: string, fromExt: string): boolean {
  if (declared === fromExt) return true;
  return declared.startsWith("text/") && fromExt.startsWith("text/");
}

function preferredType(declared: string, fromExt: string, ext: string): string {
  if (declared.startsWith("text/") && fromExt.startsWith("text/")) {
    if (ext === ".md" || ext === ".markdown") return "text/markdown";
    if (ext === ".csv") return "text/csv";
    if (ext === ".txt") return "text/plain";
  }
  return declared;
}

function magicOk(bytes: Uint8Array, type: string): boolean {
  const starts = (sig: number[]) =>
    sig.every((byte, index) => bytes[index] === byte);
  if (type === "image/png") return starts([0x89, 0x50, 0x4e, 0x47]);
  if (type === "image/jpeg") return starts([0xff, 0xd8, 0xff]);
  if (type === "image/gif")
    return (
      starts([0x47, 0x49, 0x46, 0x38]) &&
      (bytes[4] === 0x37 || bytes[4] === 0x39) &&
      bytes[5] === 0x61
    );
  if (type === "image/webp") {
    return (
      starts([0x52, 0x49, 0x46, 0x46]) &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }
  if (type === "application/pdf") return starts([0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (type.startsWith("text/")) {
    const n = Math.min(bytes.length, 8192);
    for (let i = 0; i < n; i += 1) if (bytes[i] === 0) return false;
    return true;
  }
  return false;
}

function extensionOf(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? "";
  const index = base.lastIndexOf(".");
  if (index <= 0) return "";
  return base.slice(index).toLowerCase();
}

function sanitizeFilename(name: string, fallback: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim()
    .slice(0, 120);
  if (!cleaned || cleaned === "." || cleaned === "..") return fallback;
  return cleaned;
}

function sanitizeTitle(value: string, fallback: string): string {
  const cleaned = value
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

function sanitizeSource(value: string, fallback: string): string {
  const cleaned = value
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

function titleFrom(filename: string, bytes: Uint8Array): string {
  const stem = filename.replace(/\.[^.]+$/, "").trim();
  if (
    stem &&
    stem !== "note" &&
    stem !== "paste" &&
    stem !== "image" &&
    stem !== "document"
  )
    return sanitizeTitle(stem, "未命名文档");
  if (bytes.length && bytes[0] !== 0x89 && bytes[0] !== 0xff) {
    const line = new TextDecoder()
      .decode(bytes.slice(0, 240))
      .split(/\r?\n/)
      .map(item => item.trim())
      .find(Boolean);
    if (line) return sanitizeTitle(line.replace(/^#+\s*/, ""), "未命名文档");
  }
  return "未命名文档";
}

function headerValue(request: Request, name: string): string {
  // HTTP 头只能稳定放 ASCII。中文标题用百分号编码，例如 %E5%91%A8%E6%8A%A5。
  const raw = (request.headers.get(name) ?? "")
    .replace(/[\r\n]/g, "")
    .trim()
    .slice(0, 600);
  const decoded = raw.includes("%") ? safeDecode(raw) : raw;
  return decoded.slice(0, 200);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

interface UploadFile {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isUpload(value: unknown): value is UploadFile {
  if (!value || typeof value !== "object") return false;
  const file = value as Partial<UploadFile>;
  return (
    typeof file.arrayBuffer === "function" && typeof file.size === "number"
  );
}

function profileFromFields(form: FormData): unknown {
  return {
    region: stringField(form.get("region")),
    city: stringField(form.get("city")),
    school: stringField(form.get("school")),
    college: stringField(form.get("college")),
    major: stringField(form.get("major")),
    degree: stringField(form.get("degree")),
  };
}

function sourceLabel(item: InboxMeta): string {
  if (item.channel === "visitor") {
    const place = [item.profile?.school, item.profile?.major]
      .filter(Boolean)
      .join(" · ");
    return place ? `访客导入 · ${place}` : "访客导入";
  }
  return item.source && item.source !== "合作方"
    ? `合作方 · ${item.source}`
    : "合作方";
}

function typeLabel(contentType: string): string {
  switch (contentType) {
    case "text/plain":
    case "text/csv":
      return "文本";
    case "text/markdown":
      return "Markdown";
    case "image/png":
      return "PNG";
    case "image/jpeg":
      return "JPEG";
    case "image/webp":
      return "WebP";
    case "image/gif":
      return "GIF";
    case "application/pdf":
      return "PDF";
    default:
      return contentType || "未知";
  }
}

function formatSize(size: number): string {
  if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function formatTime(value: string): string {
  return value.replace("T", " ").slice(0, 16);
}

function adminHref(key: string, query: Record<string, string> = {}): string {
  const params = new URLSearchParams({ key, ...query });
  return `/admin?${params.toString()}`;
}

function contentDisposition(filename: string, inline: boolean): string {
  const kind = inline ? "inline" : "attachment";
  const ascii =
    filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") || "download";
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function safeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length || left.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

function notFound(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function json(
  body: unknown,
  status: number,
  extra: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extra,
    },
  });
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
