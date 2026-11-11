import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import app from "./boot";
import { isAppPath } from "./appPaths";
import {
  MAX_INBOX_BYTES,
  VISITOR_RATE_PER_HOUR,
  listInbox,
  readProfile,
  resolveUpload,
  type InboxBucket,
  type InboxKv,
  type InboxObject,
} from "./lib/inbox";

const root = path.resolve(import.meta.dirname, "..");

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0,
]);
const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n");

function memoryKv(): InboxKv & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    async get(key) {
      return values.get(key) ?? null;
    },
    async put(key, value) {
      values.set(key, value);
    },
    async list({ prefix, limit = 100, cursor } = {}) {
      const keys = [...values.keys()]
        .filter(key => !prefix || key.startsWith(prefix))
        .sort();
      const start = cursor ? Number(cursor) : 0;
      const slice = keys.slice(start, start + limit);
      const next = start + slice.length;
      return {
        keys: slice.map(name => ({ name })),
        list_complete: next >= keys.length,
        cursor: next >= keys.length ? undefined : String(next),
      };
    },
  };
}

function memoryBucket(): InboxBucket & { objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    async put(key, value) {
      const bytes =
        typeof value === "string"
          ? new TextEncoder().encode(value)
          : value instanceof Uint8Array
            ? value
            : new Uint8Array(value);
      objects.set(key, bytes);
    },
    async get(key): Promise<InboxObject | null> {
      const found = objects.get(key);
      if (!found) return null;
      return {
        size: found.byteLength,
        async arrayBuffer() {
          const copy = new Uint8Array(found.byteLength);
          copy.set(found);
          return copy.buffer;
        },
        async text() {
          return new TextDecoder().decode(found);
        },
      };
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}

let ipSeq = 10;
function nextIp(): string {
  ipSeq += 1;
  return `203.0.113.${ipSeq}`;
}

function envWith(kv: InboxKv, bucket?: InboxBucket) {
  return {
    PROFILES: kv,
    INBOX: bucket,
    INBOX_TOKEN: "partner-token",
    ADMIN_KEY: "admin-key",
  };
}

async function postPartner(
  kv: InboxKv,
  bucket: InboxBucket,
  init: RequestInit & { token?: string }
) {
  const headers = new Headers(init.headers);
  if (init.token !== "")
    headers.set("authorization", `Bearer ${init.token ?? "partner-token"}`);
  return app.fetch(
    new Request("http://cdreader.top/api/inbox", { ...init, headers }),
    envWith(kv, bucket)
  );
}

describe("inbox validation", () => {
  it("accepts text, markdown, images and pdf, and rejects other types", () => {
    expect(
      resolveUpload({
        bytes: new TextEncoder().encode("hello"),
        contentType: "text/plain; charset=utf-8",
        filename: "a.txt",
      }).contentType
    ).toBe("text/plain");
    expect(
      resolveUpload({
        bytes: new TextEncoder().encode("# 标题\n正文"),
        contentType: "text/markdown",
        filename: "a.md",
      }).contentType
    ).toBe("text/markdown");
    expect(
      resolveUpload({
        bytes: PNG,
        contentType: "application/octet-stream",
        filename: "shot.png",
      }).contentType
    ).toBe("image/png");
    expect(
      resolveUpload({
        bytes: PDF,
        contentType: "application/pdf",
        filename: "paper.pdf",
      }).filename
    ).toBe("paper.pdf");
    expect(
      resolveUpload({
        bytes: new TextEncoder().encode("GIF89a-nope"),
        contentType: "image/gif",
        filename: "a.gif",
      })
    ).toMatchObject({ contentType: "image/gif" });
    expect(() =>
      resolveUpload({
        bytes: new TextEncoder().encode("<html></html>"),
        contentType: "text/html",
        filename: "a.html",
      })
    ).toThrow(/不支持的文件类型/);
    expect(() =>
      resolveUpload({
        bytes: new TextEncoder().encode("not a png"),
        contentType: "image/png",
        filename: "a.png",
      })
    ).toThrow(/对不上/);
    expect(() =>
      resolveUpload({ bytes: PNG, contentType: "image/png", filename: "a.pdf" })
    ).toThrow(/不支持的文件类型/);
    expect(() =>
      resolveUpload({
        bytes: new Uint8Array(),
        contentType: "text/plain",
        filename: "a.txt",
      })
    ).toThrow(/空的/);
  });

  it("rejects payloads over 10MB", () => {
    const bytes = new Uint8Array(MAX_INBOX_BYTES + 1);
    bytes.fill(97);
    expect(() =>
      resolveUpload({ bytes, contentType: "text/plain", filename: "big.txt" })
    ).toThrow(/10MB/);
  });

  it("keeps only school profile fields", () => {
    expect(
      readProfile({
        region: "北京",
        city: "北京",
        school: "测试大学",
        college: "经管",
        major: "金融学",
        degree: "本科",
        name: "张三",
        phone: "13800000000",
        email: "a@b.c",
        apiKey: "sk-test-should-not-land",
      })
    ).toEqual({
      region: "北京",
      city: "北京",
      school: "测试大学",
      college: "经管",
      major: "金融学",
      degree: "本科",
    });
    expect(readProfile({ degree: "随便写" })).toBeUndefined();
  });
});

describe("inbox http", () => {
  it("rejects a missing or wrong partner token without storing anything", async () => {
    const kv = memoryKv();
    const bucket = memoryBucket();
    const body = "# 笔记\n不应该被保存";
    const missing = await postPartner(kv, bucket, {
      method: "POST",
      token: "",
      headers: { "content-type": "text/markdown" },
      body,
    });
    const wrong = await postPartner(kv, bucket, {
      method: "POST",
      token: "nope",
      headers: { "content-type": "text/markdown" },
      body,
    });
    const query = await app.fetch(
      new Request("http://cdreader.top/api/inbox?token=partner-token", {
        method: "POST",
        headers: { "content-type": "text/markdown" },
        body,
      }),
      envWith(kv, bucket)
    );
    expect(missing.status).toBe(404);
    expect(wrong.status).toBe(404);
    expect(query.status).toBe(404);
    expect(await missing.text()).toBe("Not Found");
    expect(kv.values.size).toBe(0);
    expect(bucket.objects.size).toBe(0);
  });

  it("stores markdown, lists it, and keeps the file behind the admin key", async () => {
    const kv = memoryKv();
    const bucket = memoryBucket();
    const secret = "只有后台能看见的句子";
    const created = await postPartner(kv, bucket, {
      method: "POST",
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "x-inbox-title": encodeURIComponent("周报"),
        "x-inbox-source": "lab-a",
        "x-inbox-filename": "notes.md",
      },
      body: `# 周报\n${secret}`,
    });
    expect(created.status).toBe(201);
    const payload = (await created.json()) as {
      id: string;
      channel: string;
      source: string;
    };
    expect(payload.channel).toBe("partner");
    expect(payload.source).toBe("lab-a");

    const listed = await listInbox(kv);
    expect(listed.map(item => item.title)).toEqual(["周报"]);
    expect(listed[0]?.r2Key).toBe(`items/${payload.id}`);

    const admin = await app.fetch(
      new Request("http://cdreader.top/admin?key=admin-key"),
      envWith(kv, bucket)
    );
    const html = await admin.text();
    expect(admin.status).toBe(200);
    expect(html).toContain("文档收件箱");
    expect(html).toContain("周报");
    expect(html).toContain("合作方 · lab-a");
    expect(html).toContain("暂停使用");
    expect(html).toContain("导出 CSV");
    expect(html).not.toContain(secret);

    const hidden = await app.fetch(
      new Request(
        `http://cdreader.top/admin?key=wrong&inbox=${payload.id}&download=1`
      ),
      envWith(kv, bucket)
    );
    expect(hidden.status).toBe(404);
    expect(await hidden.text()).not.toContain(secret);

    const preview = await app.fetch(
      new Request(
        `http://cdreader.top/admin?key=admin-key&inbox=${payload.id}`
      ),
      envWith(kv, bucket)
    );
    const previewHtml = await preview.text();
    expect(previewHtml).toContain(secret);
    expect(previewHtml).toContain("下载");

    const file = await app.fetch(
      new Request(
        `http://cdreader.top/admin?key=admin-key&inbox=${payload.id}&download=1`
      ),
      envWith(kv, bucket)
    );
    expect(file.status).toBe(200);
    expect(file.headers.get("content-disposition")).toContain("attachment");
    expect(file.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await file.text()).toContain(secret);
  });

  it("stores a multipart image and previews it only for the admin", async () => {
    const kv = memoryKv();
    const bucket = memoryBucket();
    const form = new FormData();
    form.set("file", new File([PNG], "shot.png", { type: "image/png" }));
    form.set("title", "截图");
    form.set("source", "lab-b");
    const created = await postPartner(kv, bucket, {
      method: "POST",
      body: form,
    });
    expect(created.status).toBe(201);
    const payload = (await created.json()) as { id: string };
    const preview = await app.fetch(
      new Request(
        `http://cdreader.top/admin?key=admin-key&inbox=${payload.id}`
      ),
      envWith(kv, bucket)
    );
    const html = await preview.text();
    expect(html).toContain("<img");
    expect(html).toContain("inline=1");
    const image = await app.fetch(
      new Request(
        `http://cdreader.top/admin?key=admin-key&inbox=${payload.id}&inline=1`
      ),
      envWith(kv, bucket)
    );
    expect(image.headers.get("content-type")).toBe("image/png");
    expect(image.headers.get("content-disposition")).toContain("inline");
    expect(new Uint8Array(await image.arrayBuffer()).slice(0, 4)).toEqual(
      PNG.slice(0, 4)
    );
  });

  it("rejects a disallowed upload and an oversize body", async () => {
    const kv = memoryKv();
    const bucket = memoryBucket();
    const bad = await postPartner(kv, bucket, {
      method: "POST",
      headers: { "content-type": "text/html" },
      body: "<html><script>alert(1)</script></html>",
    });
    expect(bad.status).toBe(400);
    expect(kv.values.size).toBe(0);

    const big = "a".repeat(MAX_INBOX_BYTES + 1);
    const over = await postPartner(kv, bucket, {
      method: "POST",
      headers: { "content-type": "text/plain", "x-inbox-filename": "big.txt" },
      body: big,
    });
    expect(over.status).toBe(413);
    expect(bucket.objects.size).toBe(0);
  });

  it("accepts a visitor import, strips secrets, and rate limits the IP", async () => {
    const kv = memoryKv();
    const bucket = memoryBucket();
    const ip = nextIp();
    const text = `课堂笔记 ${"甲".repeat(40)}`;
    const created = await app.fetch(
      new Request("http://cdreader.top/api/inbox/visitor", {
        method: "POST",
        headers: { "content-type": "application/json", "x-real-ip": ip },
        body: JSON.stringify({
          text,
          title: "课堂笔记",
          filename: "paste.txt",
          apiKey: "sk-test-should-not-land",
          channel: "partner",
          source: "合作方",
          profile: {
            region: "北京",
            city: "北京",
            school: "测试大学",
            college: "经管学院",
            major: "金融学",
            degree: "本科",
            name: "张三",
            phone: "13800000000",
            email: "a@b.c",
          },
        }),
      }),
      envWith(kv, bucket)
    );
    expect(created.status).toBe(201);
    const listed = await listInbox(kv);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.channel).toBe("visitor");
    expect(listed[0]?.source).toBe("访客导入");
    expect(listed[0]?.profile).toEqual({
      region: "北京",
      city: "北京",
      school: "测试大学",
      college: "经管学院",
      major: "金融学",
      degree: "本科",
    });
    const stored =
      [...kv.values.values()].join("\n") +
      [...bucket.objects.values()]
        .map(item => new TextDecoder().decode(item))
        .join("\n");
    expect(stored).not.toContain("sk-test-should-not-land");
    expect(stored).not.toContain("张三");
    expect(stored).not.toContain("13800000000");
    expect(stored).not.toContain("a@b.c");
    expect(stored).toContain(text);

    const page = await app.fetch(
      new Request("http://cdreader.top/admin?key=admin-key"),
      envWith(kv, bucket)
    );
    expect(await page.text()).toContain("访客导入 · 测试大学 · 金融学");

    for (let i = 0; i < VISITOR_RATE_PER_HOUR - 1; i += 1) {
      const res = await app.fetch(
        new Request("http://cdreader.top/api/inbox/visitor", {
          method: "POST",
          headers: { "content-type": "text/plain", "x-real-ip": ip },
          body: `more-${i}-${"x".repeat(20)}`,
        }),
        envWith(kv, bucket)
      );
      expect(res.status).toBe(201);
    }
    const limited = await app.fetch(
      new Request("http://cdreader.top/api/inbox/visitor", {
        method: "POST",
        headers: { "content-type": "text/plain", "x-real-ip": ip },
        body: `overflow-${"x".repeat(20)}`,
      }),
      envWith(kv, bucket)
    );
    expect(limited.status).toBe(429);
  });

  it("returns a clear error when R2 is missing and does not throw", async () => {
    const kv = memoryKv();
    const res = await app.fetch(
      new Request("http://cdreader.top/api/inbox/visitor", {
        method: "POST",
        headers: { "content-type": "text/plain", "x-real-ip": nextIp() },
        body: "没有桶也可以把话说清楚",
      }),
      { PROFILES: kv, INBOX_TOKEN: "partner-token", ADMIN_KEY: "admin-key" }
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("R2");
    expect(body.error).toContain("INBOX");
    expect(kv.values.size).toBe(0);
  });
});

describe("inbox routing and client surface", () => {
  it("keeps inbox and admin paths on the worker, not the SPA fallback", () => {
    expect(isAppPath("/api/inbox")).toBe(true);
    expect(isAppPath("/api/inbox/visitor")).toBe(true);
    expect(isAppPath("/admin")).toBe(true);
    expect(isAppPath("/admin/inbox/abc")).toBe(true);
    expect(isAppPath("/")).toBe(false);
    expect(isAppPath("/robots.txt")).toBe(false);
    const workerSource = readFileSync(path.join(root, "api/worker.ts"), "utf8");
    expect(workerSource).toContain("isAppPath(pathname)");
  });

  it("does not put inbox or admin secrets in the visitor frontend", () => {
    const files = [
      path.join(root, "index.html"),
      ...walk(path.join(root, "src")),
    ];
    const bundled = files.map(file => readFileSync(file, "utf8")).join("\n");
    expect(bundled).not.toContain("INBOX_TOKEN");
    expect(bundled).not.toContain("ADMIN_KEY");
    const sync = readFileSync(path.join(root, "src/lib/inboxSync.ts"), "utf8");
    expect(sync).not.toMatch(/apiKey|loadKey|INBOX_TOKEN|ADMIN_KEY/);
    const wrangler = readFileSync(path.join(root, "wrangler.jsonc"), "utf8");
    expect(wrangler).toContain("cdreader-inbox");
    expect(wrangler).toContain('"binding": "INBOX"');
    expect(wrangler).toContain('"/admin/*"');
    expect(wrangler).toContain('"/api/*"');
    const vite = readFileSync(path.join(root, "vite.config.ts"), "utf8");
    expect(vite).toContain("admin(?:$|[/?])");
  });
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "ocr" || name === "node_modules") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx?|css|html)$/.test(name)) out.push(full);
  }
  return out;
}
