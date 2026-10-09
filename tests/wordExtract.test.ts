import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { extractCourseFileText } from "@/lib/server/courseFileExtract";
import { docxXmlToText, extractDocText, WordEncryptedError } from "@/lib/server/wordExtract";

const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:r><w:t>다낭 3박 5일 견적서</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">DAY 1 </w:t></w:r><w:r><w:t>인천 출발</w:t></w:r><w:r><w:br/><w:t>호텔 체크인</w:t></w:r></w:p>
<w:p><w:r><w:t>바나힐 &amp; 골든브릿지</w:t></w:r><w:r><w:delText>지운 글</w:delText></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>인원</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1인 요금</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>4명</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>USD 400</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
</w:body></w:document>`;

function docxBytes(xml: string): Uint8Array {
  const zip = XLSX.CFB.utils.cfb_new();
  XLSX.CFB.utils.cfb_add(zip, "/word/document.xml", new TextEncoder().encode(xml));
  return new Uint8Array(XLSX.CFB.write(zip, { type: "array", fileType: "zip" }) as ArrayLike<number>);
}

/** 워드 97 형식의 최소 문서: 유니코드 조각(한글) + 8비트 조각(영문) */
function docBytes(unicodeText: string, ansiText: string, flags = 0x0200): Uint8Array {
  const wd = new Uint8Array(0x800);
  const dv = new DataView(wd.buffer);
  dv.setUint16(0, 0xa5ec, true);
  dv.setUint16(0x0a, flags, true);
  const uniAt = 0x400;
  for (let i = 0; i < unicodeText.length; i++) dv.setUint16(uniAt + i * 2, unicodeText.charCodeAt(i), true);
  const ansiAt = 0x600;
  for (let i = 0; i < ansiText.length; i++) wd[ansiAt + i] = ansiText.charCodeAt(i);

  // 조각 표: CP 0..u..u+a, 조각 2개
  const table = new Uint8Array(64);
  const tv = new DataView(table.buffer);
  const n = 2;
  const lcb = (n + 1) * 4 + n * 8;
  table[0] = 0x02;
  tv.setUint32(1, lcb, true);
  const plc = 5;
  tv.setUint32(plc, 0, true);
  tv.setUint32(plc + 4, unicodeText.length, true);
  tv.setUint32(plc + 8, unicodeText.length + ansiText.length, true);
  const pcd = plc + (n + 1) * 4;
  tv.setUint32(pcd + 2, uniAt, true);
  tv.setUint32(pcd + 8 + 2, (ansiAt * 2) | 0x40000000, true);
  dv.setUint32(0x01a2, 0, true);
  dv.setUint32(0x01a6, 5 + lcb, true);

  const cfb = XLSX.CFB.utils.cfb_new();
  XLSX.CFB.utils.cfb_add(cfb, "/WordDocument", wd);
  XLSX.CFB.utils.cfb_add(cfb, "/1Table", table);
  return new Uint8Array(XLSX.CFB.write(cfb, { type: "array" }) as ArrayLike<number>);
}

const base64 = (b: Uint8Array) => Buffer.from(b).toString("base64");

describe("워드(DOCX) 코스표 읽기", () => {
  it("문단·줄바꿈·표(칸 | 구분, 행 줄바꿈)를 살리고, 지운 글자는 뺀다", () => {
    expect(docxXmlToText(DOCUMENT_XML)).toBe(
      ["다낭 3박 5일 견적서", "DAY 1 인천 출발", "호텔 체크인", "바나힐 & 골든브릿지", "인원 | 1인 요금", "4명 | USD 400"].join("\n"),
    );
  });

  it("업로드한 .docx 파일에서 텍스트를 뽑는다", async () => {
    const { text } = await extractCourseFileText({ name: "견적서.docx", data: base64(docxBytes(DOCUMENT_XML)) });
    expect(text).toContain("DAY 1 인천 출발");
    expect(text).toContain("4명 | USD 400");
  });

  it("워드 파일이 아니면 읽기 오류 안내", async () => {
    await expect(extractCourseFileText({ name: "견적서.docx", data: base64(new TextEncoder().encode("not a zip")) })).rejects.toThrow(
      "DOCX 파일에서 내용을 읽지 못했습니다",
    );
  });
});

describe("워드 97(DOC) 코스표 읽기", () => {
  it("유니코드(한글) 조각과 8비트(영문) 조각을 이어 붙이고, 문단 끝·표 칸을 정리한다", () => {
    const text = extractDocText(docBytes("DAY 1 다낭\r바나힐\x07골든브릿지\x07\x07", "Hotel check-in\r"));
    expect(text).toBe(["DAY 1 다낭", "바나힐 | 골든브릿지", "Hotel check-in"].join("\n"));
  });

  it("필드 명령은 빼고 결과만 남긴다", () => {
    expect(extractDocText(docBytes('\x13HYPERLINK "http://x"\x14예약 페이지\x15\r', ""))).toBe("예약 페이지");
  });

  it("암호가 걸린 문서는 따로 알린다", async () => {
    expect(() => extractDocText(docBytes("x", "", 0x0300))).toThrow(WordEncryptedError);
    await expect(extractCourseFileText({ name: "견적서.doc", data: base64(docBytes("x", "", 0x0300)) })).rejects.toThrow("암호가 걸린 워드 파일");
  });
});
