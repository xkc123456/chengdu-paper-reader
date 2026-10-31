import type { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "fs";
import path from "path";
import {
  crawlFilename,
  isCrawlPath,
  missingCrawlResponse,
  serveCrawlBody,
} from "../crawl";

type App = Hono<{ Bindings: HttpBindings }>;

export function serveStaticFiles(app: App) {
  const distPath = path.resolve(import.meta.dirname, "../dist/public");

  // 在通用静态中间件之前处理。文件缺失或正文被换成首页 HTML 时返回纯文本 404，
  // 不把请求交给下面的 index.html 回退。
  app.use("*", async (c, next) => {
    if (!isCrawlPath(c.req.path)) return next();
    const name = crawlFilename(c.req.path);
    if (!name) return missingCrawlResponse();
    const filePath = path.join(distPath, name);
    if (!fs.existsSync(filePath)) return missingCrawlResponse();
    return serveCrawlBody(c.req.path, fs.readFileSync(filePath, "utf8"));
  });

  app.use("*", serveStatic({ root: "./dist/public" }));

  app.notFound(c => {
    if (isCrawlPath(c.req.path)) return missingCrawlResponse();
    const accept = c.req.header("accept") ?? "";
    if (!accept.includes("text/html")) {
      return c.json({ error: "Not Found" }, 404);
    }
    const indexPath = path.resolve(distPath, "index.html");
    const content = fs.readFileSync(indexPath, "utf-8");
    return c.html(content);
  });
}
