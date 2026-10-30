# 澄读 · 论文精读工作台

把一篇论文拆成「老师讲得明白、你能复述」的样子：先讲直觉，再讲术语，最后回到原文核对证据。

面向本科生，但不预设学科——模型会先判断论文属于实证研究、规范研究还是系统与实验，再按那一类论文的阅读惯例去拆。

## 功能

- **导入**：粘贴文字，上传 PDF / DOCX / TXT / MD / CSV，或上传、粘贴截图做中英文 OCR（全部在浏览器本地完成）。
- **校对**：PDF、Word、OCR 的结果都可以先改再解析，避免为了一个错字重复调用模型。
- **五种视图**：老师讲解、主体关系、分栏对照、数据图表、原文定位。
- **学习辅助**：术语解释、研究问题、核心结论、阅读边界、下一步自查，以及 Markdown 笔记导出。
- **数据诚实**：只有原文明确给出数字时才画折线图/柱状图；缺数据就显示空状态，不补造数值。
- **响应式 + 明暗主题**。

## 用自己的 API Key（默认）

站点本身不承担模型费用：每位访客在导入面板里填自己的 Key，解析时随请求发给服务端转发给模型。

- Key 只存在**你自己的浏览器**（`localStorage`），服务端不写数据库、不进日志（日志有脱敏，见 `api/lib/scrub.ts`）。
- 默认接入点是 DeepSeek（`https://api.deepseek.com/v1`，模型 `deepseek-chat`），因为它在 OpenAI 兼容协议里价格低、中文稳；换成任何兼容端点只需改 `LLM_BASE_URL` 与 `LLM_MODEL`。
- 站长自己开发调试时，可以配置 `DEEPSEEK_API_KEY` 并把 `OWNER_KEY_POLICY` 设为 `open`，这样访客没填 Key 时用你的额度；**默认是 `closed`，访客必须自带 Key**。

## 本地运行

```bash
npm install
cp .env.example .env      # 可选：只有站长自用时才需要
npm run dev               # http://localhost:3000
```

```bash
npm run check   # TypeScript 类型检查
npm run build   # 前端 + 生产服务端
npm start       # 生产模式，读取 dist/server.js
```

生产入口是 `dist/server.js`，前端产物在 `dist/public/`。

## 部署

两个运行时共用同一份 `api/` 代码，按需要选一个：

### A. Cloudflare Workers（免费，72 小时内可上线）

免费额度：每天 10 万次请求、无限静态流量、不睡觉、不过期、不需要信用卡。

```bash
npm run build      # 先产出 dist/public，Workers 的 Assets 绑定要用
npx wrangler login # 浏览器里授权一次
npm run cf:deploy  # 部署，几十秒后给出 *.workers.dev 网址
```

配置在 `wrangler.jsonc`：`assets` 指向 `dist/public`，`not_found_handling` 设为单页应用回退；
`compatibility_flags` 打开 `nodejs_compat`，这样 `api/` 里的 `process.env`、`node:path` 不用改。
本地预览用 `npm run cf:dev`（在 workerd 里跑，和线上是同一个运行时）。

> 免费版单次请求有 **10ms CPU** 上限（等待模型的时间不算 CPU，但 JSON 解析与校验算）。
> 如果日志里出现 `1102` / "Worker exceeded CPU time limit"，升级到付费版（$5/月）或改用下面的 B 方案。

### B. 自己的一台服务器（国内访问快）

仓库自带 `Dockerfile`，任何能跑容器的平台都可以直接部署（自己的 VPS、Render、Railway、Fly.io）：

```bash
docker build -t chengdu-paper-reader .
docker run -d -p 3000:3000 --restart unless-stopped chengdu-paper-reader
```

国内轻量服务器（学生机约 ¥10/月）配个 Caddy/Nginx 反代就能上 HTTPS，国内访问通常 20–50ms。

部署时通常**不需要配置任何环境变量**：默认就是「访客自带 Key」模式。想用自己的额度做演示，再加 `DEEPSEEK_API_KEY` + `OWNER_KEY_POLICY=open`。

| 变量 | 作用 | 默认 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | 站长自己的 Key | 空 |
| `OWNER_KEY_POLICY` | `closed` 只认访客 Key；`open` 允许借用站长 Key | `closed` |
| `LLM_BASE_URL` | OpenAI 兼容接入点 | `https://api.deepseek.com/v1` |
| `LLM_MODEL` | 模型名 | `deepseek-chat` |
| `PORT` | 监听端口 | `3000` |
| `RATE_LIMIT_PER_HOUR` | 每 IP 每小时解析次数，`0` 为不限 | `30` |
| `LOG_DIR` | 日志目录 | `./.data/logs` |

## 代码结构

```text
contracts/analysis.ts            前后端共享的分析结果契约（Zod）
api/boot.ts                      Hono 应用（路由、中间件、错误处理）
api/server.ts                    生产入口：挂静态资源 + 监听端口
api/paperRouter.ts               解析接口：限流、选 Key、提示词、错误映射
api/ai/provider.ts               OpenAI 兼容接入（默认 DeepSeek）
api/ai/ai-client.ts              模型错误 → 语义类型
api/lib/ratelimit.ts             单进程内存限流
src/lib/extract.ts               PDF / Word / 文本 / 截图识别
src/lib/key.ts                   访客 Key 的本地存取
src/components/ImportPanel.tsx   三种导入方式、校对与 Key 输入
src/components/                  关系图、图表、分栏等阅读组件
src/App.tsx                      页面与五种工作台视图
public/ocr/                      Tesseract.js 线程、核心与中英文模型（自托管）
```

## 已知边界

- OCR 可能误识别公式、上下标和复杂表格；扫描版 PDF 若无文本层，请改用页面截图。
- 单次最多 60,000 字符；超长论文建议分段导入。
- AI 生成的关系、机制与解释仍需回到原文核对，不能替代研究设计与学术判断。
- 限流是单进程内存计数，多实例部署时每个实例各自计数；要严格配额得换 Redis。

## 第三方资源

见 [CREDITS.md](CREDITS.md)。字体来自原模板（Geist / Geist Mono），OCR 使用 Tesseract.js（Apache-2.0），中英文模型数据随仓库自托管。
