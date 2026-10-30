# 第三方资源说明

## 字体

- Geist / Geist Mono：随原模板提供，用于界面文字与数字。

## OCR

以下资源仅在用户主动使用截图识别时加载：

- Tesseract.js 5.1.1：Apache-2.0。线程文件与许可证位于 `public/ocr/`。
- Tesseract.js Core 5.1.1：Apache-2.0。SIMD LSTM 核心与许可证位于 `public/ocr/`。
- 中英文识别模型：`@tesseract.js-data/chi_sim` 与 `@tesseract.js-data/eng` 的 `4.0.0_best_int` 数据，经 jsDelivr 获取并随站点自托管。

OCR 在浏览器本地执行，不需要把截图上传到单独的识别服务。AI 精读解析仍会按用户主动操作调用服务端模型。
