// 访客导入成功后，把一份副本交给 /api/inbox/visitor。
//
// 这条路径不带上传口令，也不带后台口令，更不读取模型 API Key。
// 服务端拒绝、网络失败、文件超限，都静默结束：本地已经识别好的文字照常可用。

import { loadProfile, type Profile } from "./profile";
import { sampleText } from "./sample";

const MAX_BYTES = 10 * 1024 * 1024;
const textSeen = new Set<string>();
const fileSeen = new Set<string>();

const ALLOWED_EXT = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".pdf",
]);
const ALLOWED_TYPE = new Set([
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

function fingerprint(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1)
    hash = ((hash * 33) ^ value.charCodeAt(i)) >>> 0;
  return `${value.length}:${hash}`;
}

function extensionOf(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const index = base.lastIndexOf(".");
  return index > 0 ? base.slice(index).toLowerCase() : "";
}

function fileAllowed(file: File): boolean {
  if (file.size <= 0 || file.size > MAX_BYTES) return false;
  const ext = extensionOf(file.name);
  const type = (file.type || "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (type && ALLOWED_TYPE.has(type)) return !ext || ALLOWED_EXT.has(ext);
  if (!type || type === "application/octet-stream") return ALLOWED_EXT.has(ext);
  return false;
}

function publicProfile(profile: Profile | null) {
  if (!profile) return undefined;
  const { region, city, school, college, major, degree } = profile;
  if (!region && !city && !school && !college && !major && !degree)
    return undefined;
  return { region, city, school, college, major, degree };
}

function textFilename(name: string): string {
  const stem = (name.replace(/\.[^.]+$/, "") || "import")
    .replace(/[^\w.\-\u4e00-\u9fff]+/g, "_")
    .slice(0, 80);
  return `${stem || "import"}.txt`;
}

/** 文本导入。示例论文、太短的片段、以及这一页已经交过的同一份，都不再发。 */
export async function syncVisitorText(
  text: string,
  opts?: { title?: string; filename?: string }
): Promise<void> {
  const trimmed = text.trim();
  if (trimmed.length < 80 || trimmed === sampleText.trim()) return;
  if (new TextEncoder().encode(trimmed).byteLength > MAX_BYTES) return;
  const seen = fingerprint(trimmed);
  if (textSeen.has(seen)) return;
  textSeen.add(seen);
  try {
    const profile = publicProfile(loadProfile());
    const res = await fetch("/api/inbox/visitor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: trimmed,
        filename: opts?.filename || "paste.txt",
        ...(opts?.title ? { title: opts.title } : {}),
        ...(profile ? { profile } : {}),
      }),
    });
    if (res.status >= 500) textSeen.delete(seen);
  } catch {
    textSeen.delete(seen);
  }
}

/**
 * 文件导入。类型和大小都符合收件箱要求时传原文件；
 * Word、BMP 这类不在允许列表里的，改传已经识别出的文本。
 */
export async function syncVisitorFile(
  file: File,
  opts?: { text?: string; title?: string }
): Promise<void> {
  const id = `${file.name}:${file.size}:${file.lastModified}`;
  if (fileSeen.has(id)) return;
  fileSeen.add(id);
  try {
    if (fileAllowed(file)) {
      const textKey = opts?.text?.trim() ?? "";
      const seenText = textKey.length >= 80 ? fingerprint(textKey) : "";
      if (seenText) textSeen.add(seenText);
      const body = new FormData();
      body.set("file", file, file.name || "upload.bin");
      if (opts?.title) body.set("title", opts.title);
      const profile = publicProfile(loadProfile());
      if (profile) body.set("profile", JSON.stringify(profile));
      try {
        const res = await fetch("/api/inbox/visitor", { method: "POST", body });
        if (
          res.ok ||
          res.status === 429 ||
          res.status === 503 ||
          res.status >= 500
        )
          return;
      } catch {
        if (seenText) textSeen.delete(seenText);
        return;
      }
      if (seenText) textSeen.delete(seenText);
    }
    if (opts?.text) {
      await syncVisitorText(opts.text, {
        title: opts.title || file.name,
        filename: textFilename(file.name),
      });
    }
  } catch {
    // 本地识别已经完成，同步失败不影响继续阅读。
  }
}
