# 澄读 · 论文精读工作台

面向本科生的论文阅读网站，优先支持经管、法律、人工智能与电子信息（软件方向）。

## 功能

- 导入论文：粘贴文字，上传 PDF / DOCX / TXT / MD / CSV，或上传、粘贴截图进行中英文 OCR。
- 校对后解析：PDF、Word 和 OCR 的识别结果均可编辑，再提交 AI 分析。
- 五种阅读视图：老师讲解、主体关系、分栏对照、数据图表、原文定位。
- 学习辅助：术语解释、研究问题、核心结论、阅读边界、下一步自查和 Markdown 笔记导出。
- 数据约束：只有原文明确提供数字时才绘制折线图或柱状图；缺少数据时显示空状态，不补造数值。
- 响应式与主题：适配桌面和手机，支持明暗主题。

## 技术结构

- 前端：React 19、TypeScript、Vite。
- 服务端：Hono、tRPC、SuperJSON。
- AI：AI SDK `generateObject` + Zod 结构化输出；模型 ID 在运行时从 `listModels()` 获取。
- 文档识别：PDF.js、Mammoth、Tesseract.js，均按需加载。

主要文件：

```text
contracts/analysis.ts          前后端共享的分析结果契约
api/paperRouter.ts            论文分析接口与提示词
api/ai/                      平台模型接入和错误分类
src/components/ImportPanel.tsx 三种导入方式与校对流程
src/lib/extract.ts            PDF、Word、文本和截图识别
src/components/              关系图、图表、分栏等阅读组件
src/App.tsx                   页面与五种工作台视图
```

## 本地运行

```bash
npm install
npm run dev
```

开发服务位于 `http://localhost:3000`。

```bash
npm run check   # 类型检查
npm run build   # 前端与生产服务端构建
npm start       # 生产模式启动
```

生产入口为 `dist/boot.js`，前端产物位于 `dist/public/`。

## 数据与额度说明

- 上传内容用于当次识别和分析，不建立跨设备阅读档案。
- AI 调用会消耗站点所有者的平台额度；失败的可计费请求不自动重试。
- 网关凭据仅存在于服务端，不进入浏览器。
- OCR 可能误识别公式、上下标和复杂表格；扫描版 PDF 若无文本层，请改用页面截图。
- AI 生成的关系、机制和解释仍需回到原文核对，不能替代研究设计与学术判断。
