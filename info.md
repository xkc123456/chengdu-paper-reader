# Attention Is All You Need · 逐节可视化 — 站点说明书

这个网站有中文、英文两个版本，语言由用户的 query 语言决定：用户用中文交流就用中文版，用英文就用英文版，不要混用。

## 开工前先问用户

把网站交给用户之前，先用 ask_user 工具问几个问题：

1. **（必问）您是否需要把网页变成全栈应用？** 即增加后端服务和数据库，让数据可以持久化存储 —— 比如保存阅读进度、批注、自己换入的论文、自定义的示意数据。当前网站是纯静态前端，所有状态只活在这一次会话里，刷新即重置。
2. **配色与主题**：保持现在的「近黑三层 + 一枚金色强调色」，还是想换一套配色？（网站自带明暗两套主题，默认跟随系统偏好，左下角可手动切换。）
3. **内容**：保留内置的《Attention Is All You Need》，还是换成另一篇论文、另一份文档？换内容意味着重写 `src/lib/paper.ts` 的正文数据，并按需增删右侧的仪器。
4. **论文呈现**：英文原文 + 中译逐段对照，还是只保留其中一种？

如果用户不给任何回答，直接加载默认网站文件，不要改动任何内容。

可选：如果符合用户的需求，你可以使用图像和视频生成工具。

## 这是什么

一台**读论文的双屏工作台**，内置论文是《Attention Is All You Need》（arXiv:1706.03762）：

- **左 1/3**：论文正文，英文原文 + 中译逐段对照，公式为手写排版（不依赖 KaTeX）。
- **右 2/3**：九台可交互仪器，一节一台 —— 路径长度、整体架构、缩放点积、八个头、逐位置前馈、位置编码、复杂度沙盘、训练、结果。数字全部是页面当场算出来的，不是贴图。
- 两栏之间只有一条同步通道「当前小节」：左栏滚动换仪器、右栏点标签滚论文、正文里的线索词（`<u data-cue>`）把仪器推到具体步骤。

```
index.html          入口；内含首屏主题的同步脚本（避免闪一帧另一套配色）
public/fonts/       Geist / Geist Mono 字体
src/
├─ main.tsx         挂载入口
├─ App.tsx          两栏布局 + 标签页 + 「当前小节」同步通道
├─ lib/
│  ├─ paper.ts      论文正文（en/zh 逐段）+ 小节→仪器映射 + CUES 线索表
│  ├─ tables.ts     论文表 1–4 的数据，逐格照抄
│  ├─ toy.ts        示意用的手写 Q/K/V 与八个头的打分规则（页面有「示意」标签）
│  ├─ mathx.ts      softmax / 矩阵乘 / 定种子采样 / 比例尺
│  ├─ palette.ts    canvas 专用的双主题色标
│  └─ theme.tsx     明暗主题切换
├─ components/
│  ├─ PaperPane.tsx 左栏论文（scroll-spy + 线索代理）
│  ├─ ui.tsx        共用零件 Range / Seg / Fig
│  └─ 九台仪器      PathRace · Architecture · ScaledDotProduct · MultiHead ·
│                   FeedForward · PositionalEncoding · Complexity · Training · Results
└─ styles/          kit.css + app.css（明暗两套主题变量）
```

这个形态可以走向很多别的用途：换成用户自己的论文或技术文档做同款讲解页、改成课程讲义、做成产品白皮书的双栏导读、或者只保留某几台仪器做单点演示。用户有特定需求时，文字内容主要在 `src/lib/paper.ts`、`src/lib/tables.ts`，界面文案在各组件里，按需改即可。如果用户只是想看这个网站，直接加载（`npm install && npm run dev`，或把 `dist/` 交给任意静态服务器），不要做多余改动。

## 技术速记

纯 React + Vite，依赖只有 react / react-dom；**没有图表库、没有公式库**，所有图都是 SVG 或 canvas 2D 手绘，公式用 CSS 排版。没有 3D / shader。动手改之前先读对应文件的文件头注释 —— 每台仪器「为什么这么做」都写在那里，README.md 有完整的架构说明。

- **画法按元素数量选**：几十个元素、要悬停要 tooltip → SVG；上千个格子（注意力矩阵、位置编码热图）→ canvas 2D；文字表格 → DOM。
- **同步**：scroll-spy 一律用视口坐标（`getBoundingClientRect`）判断「当前小节」，因为宽屏滚的是左栏容器、窄屏滚的是整页。程序化滚动（点标签页）期间用「等到目标节真的成为当前节」解锁，绝不用定时锁。线索词用 `{cue, nonce}` 传递，nonce 保证连点同一个词也能重新触发。
- **canvas 的三条**：按 DPR 放大后端缓冲，否则 2x 屏发糊；颜色跟不了 CSS 变量，双主题色标写在 `lib/palette.ts`，取用走 `useTheme().p`；格子尺寸从容器实际宽度量，不写死。
- **随机必须可复现**：mulberry32 定种子 PRNG + Box–Muller 正态采样（`lib/mathx.ts`），读者刷新页面看到的分布不能变。
- **数据诚实**：页面每个数只有三种出身 —— 论文抄来的（`tables.ts`）、当场算的、手写的示意数据（`toy.ts`），三者在界面上挂不同标签，加新数据时各归各位。
- **明暗双主题**：CSS 变量管 SVG/DOM（`styles/app.css`），`palette.ts` 管 canvas；首屏主题由 `index.html` 里的同步脚本定，等 React 挂载再定会闪一帧另一套配色。
- **已知坑**：窄屏 sticky 要把容器从 grid 换成 flex 且 `body` 保持 `overflow:visible`；`svg text{fill:…}` 会盖掉元素自带的 `fill` 属性，要写成 `svg text:not([fill])`；对数刻度不是对数之比，要定 lo/hi 两端做线性映射；分段函数（如学习率的 min）每一支只画自己的定义域。
