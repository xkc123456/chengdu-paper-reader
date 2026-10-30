
export type RecognizedFile = {
  text: string;
  label: string;
  warning?: string;
};

function cleanText(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/[\t\u00a0]+/g, " ")
    .replace(/ {2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 60000);
}

export async function recognizeFile(
  file: File,
  onProgress: (message: string, value?: number) => void,
): Promise<RecognizedFile> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const isImage = file.type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "bmp"].includes(extension);

  if (isImage) {
    onProgress("正在识别截图中的中英文…", 0);
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("chi_sim+eng", 1, {
      workerPath: "/ocr/worker.min.js",
      corePath: "/ocr/tesseract-core-simd-lstm.wasm.js",
      langPath: "/ocr/lang",
      workerBlobURL: false,
      logger: (message) => {
        if (message.status === "recognizing text") {
          onProgress("正在识别截图中的中英文…", Math.round(message.progress * 100));
        } else if (message.status.includes("language")) {
          onProgress("正在加载中英文识别模型…");
        }
      },
    });
    try {
      const result = await worker.recognize(file);
      const text = cleanText(result.data.text);
      if (!text) throw new Error("没有识别到文字，请换一张更清晰的截图，或直接粘贴原文。");
      return { text, label: file.name || "剪贴板截图", warning: "OCR 可能误识别公式、上下标和表格，请在分析前校对。" };
    } finally {
      await worker.terminate();
    }
  }

  if (extension === "pdf") {
    onProgress("正在加载 PDF 识别器…");
    const [pdfjsLib, worker] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]);
    pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default;
    onProgress("正在读取 PDF 页面…");
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pages: string[] = [];
    const pageCount = Math.min(pdf.numPages, 60);
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      onProgress(`正在提取第 ${pageNumber} / ${pageCount} 页…`, Math.round((pageNumber / pageCount) * 100));
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      pages.push(`\n\n【第 ${pageNumber} 页】\n${text}`);
    }
    const text = cleanText(pages.join(""));
    if (text.replace(/【第 \d+ 页】/g, "").trim().length < 20) {
      throw new Error("这份 PDF 可能是扫描件。请把关键页面作为截图上传，或粘贴可复制文字。");
    }
    return {
      text,
      label: file.name,
      warning: pdf.numPages > 60 ? `仅处理前 60 页（原文件共 ${pdf.numPages} 页）。` : "PDF 中的公式与表格可能需要人工校对。",
    };
  }

  if (extension === "docx") {
    onProgress("正在提取 Word 正文…");
    const mammoth = (await import("mammoth")).default;
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    const text = cleanText(result.value);
    if (!text) throw new Error("Word 中没有提取到正文，请检查文件内容。");
    return { text, label: file.name, warning: "Word 中的图片、公式和复杂表格不会完整提取。" };
  }

  if (["txt", "md", "csv"].includes(extension) || file.type.startsWith("text/")) {
    onProgress("正在读取文本…");
    const text = cleanText(await file.text());
    if (!text) throw new Error("文件内容为空。");
    return { text, label: file.name };
  }

  throw new Error("暂支持 PDF、DOCX、TXT、MD、CSV，以及 PNG／JPG／WebP 截图。");
}
