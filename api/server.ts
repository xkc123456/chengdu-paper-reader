// 生产入口：只做「挂静态资源 + 监听端口」，应用本体在 api/boot.ts。
//
// 拆成两个文件是为了让 `npm start` 在任何平台（含 Windows 的 cmd）都能直接跑，
// 不必再靠 `NODE_ENV=production node dist/boot.js` 这种只在 *nix 生效的写法；
// 开发时 @hono/vite-dev-server 加载 boot.ts，也不会因为顶层 listen 而抢端口。
//
// dotenv 只在 Node 侧加载：Cloudflare Workers 由 wrangler 注入变量，那里没有 .env 文件。
import "dotenv/config";
import { serve } from "@hono/node-server";
import app from "./boot";
import { serveStaticFiles } from "./lib/vite";
import { env } from "./lib/env";
import { log } from "./lib/logger";

serveStaticFiles(app);

serve({ fetch: app.fetch, port: env.port }, (info) => {
  log.info(`澄读已启动：http://localhost:${info.port}/`);
  log.info(
    `模型接入：${env.llmBaseUrl} · ${env.llmModel} · 站长额度策略 ${env.ownerKeyPolicy}${
      env.ownerApiKey ? "（已配置站长 Key）" : "（未配置站长 Key）"
    }`,
  );
});
