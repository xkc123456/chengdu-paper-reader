import type { AnalysisResult } from "@contracts/analysis";

/**
 * docx.ts — 自己拼一个真的 .docx，不引第三方库。
 *
 * 上一版把内容写成 HTML、后缀改成 .doc：Word 能打开，但那是 2003 年的兼容格式，
 * 标题层级、表格样式、行距都不受控，WPS 里还可能弹「格式与扩展名不符」。
 *
 * 这里直接产出 OOXML（Word 2007+ 的 .docx）。.docx 就是一个 ZIP，里面四个必需部件：
 *   [Content_Types].xml、_rels/.rels、word/document.xml、word/styles.xml
 * ZIP 用 store（不压缩）就够了——一篇笔记几十 KB，省掉 deflate 实现能少一大截代码。
 */

const encoder = new TextEncoder();

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** 最小 ZIP 写入器：method=0（store）、UTF-8 文件名、无压缩 */
export function buildZip(entries: ZipEntry[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);

    const local = new Uint8Array(30 + name.length + entry.data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 文件名
    lv.setUint16(8, 0, true); // store
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, entry.data.length, true);
    lv.setUint32(22, entry.data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    local.set(entry.data, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, entry.data.length, true);
    cv.setUint32(24, entry.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + centralSize + end.length;
  const output = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of [...locals, ...centrals, end]) {
    output.set(chunk, cursor);
    cursor += chunk.length;
  }
  return output;
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface ParaOptions {
  style?: "Title" | "Heading1" | "Heading2";
  bold?: boolean;
  size?: number; // 半磅
  color?: string;
  indent?: boolean;
  spaceAfter?: number;
}

function para(text: string, options: ParaOptions = {}): string {
  const props: string[] = [];
  if (options.style) props.push(`<w:pStyle w:val="${options.style}"/>`);
  if (options.indent) props.push(`<w:ind w:left="360"/>`);
  if (options.spaceAfter !== undefined) props.push(`<w:spacing w:after="${options.spaceAfter}"/>`);
  const pPr = props.length ? `<w:pPr>${props.join("")}</w:pPr>` : "";

  const runProps: string[] = [];
  if (options.bold) runProps.push("<w:b/>");
  if (options.size) runProps.push(`<w:sz w:val="${options.size}"/><w:szCs w:val="${options.size}"/>`);
  if (options.color) runProps.push(`<w:color w:val="${options.color}"/>`);
  const rPr = runProps.length ? `<w:rPr>${runProps.join("")}</w:rPr>` : "";

  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
}

function cell(text: string, header = false): string {
  return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/><w:shd w:val="clear" w:color="auto" w:fill="${header ? "EEF2F7" : "FFFFFF"}"/></w:tcPr>${para(text || "—", { size: 18, bold: header })}</w:tc>`;
}

function table(headers: string[], rows: string[][]): string {
  const border = `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"]
    .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="DCE2EB"/>`)
    .join("")}</w:tblBorders>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${border}</w:tblPr><w:tblGrid>${headers
    .map(() => `<w:gridCol w:w="${Math.floor(9000 / headers.length)}"/>`)
    .join("")}</w:tblGrid><w:tr>${headers.map((header) => cell(header, true)).join("")}</w:tr>${rows
    .map((row) => `<w:tr>${row.map((value) => cell(value)).join("")}</w:tr>`)
    .join("")}</w:tbl>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:eastAsia="宋体" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="200"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
</w:styles>`;

function documentXml(result: AnalysisResult): string {
  const body: string[] = [];

  body.push(para(result.title, { style: "Title" }));
  body.push(para(`${result.field} · 建议精读 ${result.readingMinutes} 分钟 · 难度 ${result.difficulty}`, { size: 18, color: "7C8798" }));
  body.push(para(result.oneSentence, { size: 24, color: "333D4D" }));

  body.push(para("研究问题", { style: "Heading1" }));
  body.push(para(result.researchQuestion));

  body.push(para("核心结论", { style: "Heading1" }));
  body.push(para(result.coreClaim));

  body.push(para("老师讲解", { style: "Heading1" }));
  result.lessons.forEach((lesson, index) => {
    body.push(para(`${index + 1}. ${lesson.heading}`, { style: "Heading2" }));
    body.push(para(lesson.explanation));
    body.push(para(`换个日常说法：${lesson.analogy}`, { size: 20, color: "555174" }));
    body.push(para(`原文依据：${lesson.evidence}`, { size: 20, color: "4A5568" }));
  });

  body.push(para("主体关系", { style: "Heading1" }));
  if (result.relations.length) {
    body.push(
      table(
        ["主体", "关系", "对象"],
        result.relations.map((relation) => [
          result.entities.find((entity) => entity.id === relation.source)?.name ?? relation.source,
          relation.label,
          result.entities.find((entity) => entity.id === relation.target)?.name ?? relation.target,
        ]),
      ),
    );
  } else {
    body.push(para("本次解析没有识别出明确的主体关系。", { color: "7C8798" }));
  }

  if (result.comparisons.length) {
    body.push(para("分栏对照", { style: "Heading1" }));
    result.comparisons.forEach((comparison) => {
      body.push(para(comparison.title, { style: "Heading2" }));
      body.push(
        table(
          ["比较维度", ...comparison.columns],
          comparison.rows.map((row) => [row.label, ...comparison.columns.map((_, index) => row.cells[index] ?? "")]),
        ),
      );
    });
  }

  if (result.charts.length) {
    body.push(para("数据图表", { style: "Heading1" }));
    result.charts.forEach((chart) => {
      body.push(para(chart.title, { style: "Heading2" }));
      body.push(para(`出处：${chart.note}（单位：${chart.yLabel}）`, { size: 18, color: "7C8798" }));
      body.push(
        table(
          [chart.xLabel, ...chart.series.map((series) => series.name)],
          chart.labels.map((label, index) => [label, ...chart.series.map((series) => String(series.data[index] ?? ""))]),
        ),
      );
    });
  }

  if (result.glossary.length) {
    body.push(para("术语表", { style: "Heading1" }));
    result.glossary.forEach((item) => body.push(para(`• ${item.term}：${item.explanation}`, { indent: true })));
  }

  body.push(para("阅读边界", { style: "Heading1" }));
  result.limitations.forEach((item) => body.push(para(`• ${item}`, { indent: true })));

  body.push(para("下一步", { style: "Heading1" }));
  result.nextSteps.forEach((item) => body.push(para(`• ${item}`, { indent: true })));

  body.push(para("由澄读生成，仅供学习参考，请以论文原文为准。", { size: 16, color: "7C8798" }));

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join(
    "",
  )}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** 生成 .docx 字节流：可直接 new Blob([bytes]) 下载 */
export function buildDocx(result: AnalysisResult): Uint8Array {
  return buildZip([
    { name: "[Content_Types].xml", data: encoder.encode(CONTENT_TYPES) },
    { name: "_rels/.rels", data: encoder.encode(ROOT_RELS) },
    { name: "word/document.xml", data: encoder.encode(documentXml(result)) },
    { name: "word/styles.xml", data: encoder.encode(STYLES) },
    { name: "word/_rels/document.xml.rels", data: encoder.encode(DOCUMENT_RELS) },
  ]);
}
