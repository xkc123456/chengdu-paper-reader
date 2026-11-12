import { describe, expect, it } from "vitest";
import type { AnalysisResult } from "@contracts/analysis";
import { sampleAnalysis } from "./sample";
import { buildDocx, buildZip, crc32 } from "./docx";

/** 只解 store（不压缩）的 ZIP —— 够用来验证我们自己写出来的包 */
function unzip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const out = new Map<string, string>();
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const name = decoder.decode(bytes.slice(offset + 30, offset + 30 + nameLength));
    const start = offset + 30 + nameLength + extraLength;
    out.set(name, decoder.decode(bytes.slice(start, start + size)));
    offset = start + size;
  }
  return out;
}

function clone(): AnalysisResult {
  return JSON.parse(JSON.stringify(sampleAnalysis)) as AnalysisResult;
}

describe("crc32", () => {
  it("与标准测试向量一致", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("buildZip", () => {
  it("多文件可原样读回", () => {
    const zip = buildZip([
      { name: "a.txt", data: new TextEncoder().encode("hello") },
      { name: "dir/b.txt", data: new TextEncoder().encode("世界") },
    ]);
    const files = unzip(zip);
    expect(files.get("a.txt")).toBe("hello");
    expect(files.get("dir/b.txt")).toBe("世界");
  });

  it("结尾是 EOCD 签名", () => {
    const zip = buildZip([{ name: "a.txt", data: new TextEncoder().encode("x") }]);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(zip.length - 22 + 10, true)).toBe(1); // 条目数
  });
});

describe("buildDocx", () => {
  const docx = buildDocx(clone());
  const files = unzip(docx);
  const documentXml = files.get("word/document.xml") ?? "";

  it("是 ZIP（PK 开头）且含四个必需部件", () => {
    expect(docx[0]).toBe(0x50);
    expect(docx[1]).toBe(0x4b);
    expect([...files.keys()].sort()).toEqual(
      ["[Content_Types].xml", "_rels/.rels", "word/_rels/document.xml.rels", "word/document.xml", "word/styles.xml"].sort(),
    );
  });

  it("Content_Types 声明了 docx 主文档与样式", () => {
    const types = files.get("[Content_Types].xml") ?? "";
    expect(types).toContain("wordprocessingml.document.main+xml");
    expect(types).toContain("wordprocessingml.styles+xml");
  });

  it("正文含标题、三个核心小节与讲解", () => {
    expect(documentXml).toContain("数字金融与中小企业融资约束");
    expect(documentXml).toContain("研究问题");
    expect(documentXml).toContain("核心结论");
    expect(documentXml).toContain("老师讲解");
    expect(documentXml).toContain("w:pStyle w:val=\"Heading1\"");
  });

  it("主体关系与比较表渲染成 w:tbl", () => {
    expect(documentXml).toContain("<w:tbl>");
    expect(documentXml).toContain("<w:tc>");
    expect(documentXml).toContain("w:tblBorders");
  });

  it("特殊字符被 XML 转义", () => {
    const risky = clone();
    risky.title = '<script> & "引号"</script>';
    const xml = unzip(buildDocx(risky)).get("word/document.xml") ?? "";
    expect(xml).not.toContain("<script>");
    expect(xml).toContain("&lt;script&gt;");
    expect(xml).toContain("&amp;");
  });

  it("含 A4 页面设置与中文字体", () => {
    expect(documentXml).toContain('w:pgSz w:w="11906"');
    expect(files.get("word/styles.xml")).toContain('w:eastAsia="宋体"');
  });
});
