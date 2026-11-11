# 文档收件箱

合作方可以把研究笔记、截图和 PDF 交到服务器；访客在工作台里成功导入文本、图片或 PDF（以及 Word 等已经能导入的格式）之后，也会留一份副本。站长在 `/admin` 里查看和下载。正文在 R2，元信息在现有的 `PROFILES` KV，键前缀是 `inbox:`。

访客的模型 API Key 仍然只在他自己的浏览器里，上传请求不会带上它，服务端也不保存、不写进日志。

口令不要写进仓库，也不要写进任何会发给访客的前端代码。

## 部署前

```bash
npx wrangler r2 bucket create cdreader-inbox
npx wrangler secret put INBOX_TOKEN
```

`INBOX_TOKEN` 只给合作方上传用。后台查看沿用原来的 `ADMIN_KEY`（`npx wrangler secret put ADMIN_KEY`）。两个都是 wrangler secret。

`wrangler.jsonc` 里已经声明了绑定：桶名 `cdreader-inbox`，绑定名 `INBOX`。本地 `npm run dev` 没有这个绑定，上传会返回一段说明文字，站点本身仍然能开。

## 合作方上传

把下面的 `$INBOX_TOKEN` 换成 secret 的值，`$ORIGIN` 换成站点地址，例如 `https://cdreader.top`。

文件（PDF 或图片）：

```bash
curl -X POST "$ORIGIN/api/inbox" \
  -H "Authorization: Bearer $INBOX_TOKEN" \
  -F "file=@paper.pdf" \
  -F "title=文献笔记" \
  -F "source=lab-a"
```

Markdown 或纯文本，直接把正文放在请求体里：

```bash
curl -X POST "$ORIGIN/api/inbox" \
  -H "Authorization: Bearer $INBOX_TOKEN" \
  -H "Content-Type: text/markdown; charset=utf-8" \
  -H "X-Inbox-Title: weekly" \
  -H "X-Inbox-Source: lab-a" \
  -H "X-Inbox-Filename: notes.md" \
  --data-binary @notes.md
```

标题或文件名含中文时，请求头里写成百分号编码（`周报` 写成 `%E5%91%A8%E6%8A%A5`）。表单字段本身可以用 UTF-8，不必编码。

没带口令、口令不对、或者还没设置 `INBOX_TOKEN`，接口都返回 404。

允许的类型：纯文本、Markdown、CSV、PNG、JPEG、WebP、GIF、PDF。单个文件最大 10MB。图片和 PDF 会核对文件头，对不上就拒绝。

## 访客导入

工作台里导入成功后，浏览器会向 `POST /api/inbox/visitor` 再送一份。这条地址不使用 `INBOX_TOKEN` 或 `ADMIN_KEY`。每个 IP 每小时最多 20 次。类型和大小限制与合作方相同。Word、BMP 这类不在列表里的文件，改存已经识别出的文本。同步失败时，访客照常在本地继续读。

如果这台浏览器里已经填过院校和专业，元信息会带上地区、城市、学校、学院、专业、学历。不收集姓名、手机号、邮箱。

## 后台查看

打开 `/admin?key=<ADMIN_KEY>`，页面上有「文档收件箱」。来源一列能区分合作方和访客导入。文本和图片可以在页面里看，PDF 和其他类型都可以下载。查看和下载仍然要带 `ADMIN_KEY`，对象没有公开地址。

院校登记表、暂停和恢复按钮保持原样。
