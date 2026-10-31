// Cloudflare Workers 入口。
//
// 为什么单独一个文件：Node 版入口（api/server.ts）用 @hono/node-server 监听端口、
// 用 node:fs 发静态文件；Workers 没有这两样东西，静态资源走 Assets 绑定，
// 运行时由 workerd 驱动。应用本体（api/boot.ts）两边完全共用。
//
// 路由分工：
//   /robots.txt、/sitemap.xml → 内联的静态正文，绝不回退 index.html
//   /api/*、/admin            → Hono 应用（tRPC + 日志上报 + JSON 404）
//   其余                      → Assets 绑定；未命中静态文件时回退 index.html（SPA）
import app from "./boot";
import { serveCrawlBody, isCrawlPath, SITEMAP_PATH } from "./crawl";
import { robotsTxt, sitemapXml } from "./crawl-assets";

interface WorkerEnv {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const { pathname } = new URL(request.url);
    // 爬虫文件在 run_worker_first 里优先进入 Worker。即便 Assets 漏配，
    // 这里返回的也是文本 / XML，不会把首页 HTML 拼进 robots.txt。
    if (isCrawlPath(pathname)) {
      const body = pathname === SITEMAP_PATH ? sitemapXml : robotsTxt;
      return serveCrawlBody(pathname, body);
    }
    // /admin 也交给应用处理，否则会被 Assets 的单页回退吃掉
    if (
      pathname === "/admin" ||
      pathname === "/api" ||
      pathname.startsWith("/api/")
    ) {
      // env 要透传进去：tRPC 上下文与 /admin 都靠它拿 KV 绑定
      return app.fetch(
        request,
        env as unknown as Parameters<typeof app.fetch>[1]
      );
    }
    return env.ASSETS.fetch(request);
  },
};
