import * as XLSX from "xlsx";

/**
 * 워드 파일에서 코스 원문으로 쓸 글자를 뽑는다 — 새 라이브러리 없이 SheetJS의 CFB(압축·복합 문서 읽기)를 쓴다.
 *  - DOCX(워드 2007~): ZIP 안의 word/document.xml에서 문단·표를 살려 텍스트로
 *  - DOC(워드 97~2003): 복합 문서의 WordDocument 스트림을 조각 표(piece table)대로 이어 붙여 텍스트로
 */

export class WordEncryptedError extends Error {}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code] ?? m;
  });
}

/**
 * word/document.xml → 텍스트. 본문 글자(w:t)만 모으고 — 지운 글자(w:delText)·필드 명령(w:instrText)은 빼고 —
 * 문단은 줄바꿈, 표는 칸을 " | "로, 행을 줄바꿈으로 (칸 안의 문단 끝은 띄어쓰기).
 */
export function docxXmlToText(xml: string): string {
  const token = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:(?:br|cr)\b[^>]*\/>|<w:tc(?:\s[^>]*)?>|<\/w:tc>|<\/w:tr>|<\/w:p>/g;
  let out = "";
  let cellDepth = 0;
  for (const m of xml.matchAll(token)) {
    const tag = m[0];
    if (m[1] !== undefined) out += decodeEntities(m[1]);
    else if (tag === "<w:tab/>") out += "\t";
    else if (tag.startsWith("<w:br") || tag.startsWith("<w:cr")) out += cellDepth > 0 ? " " : "\n";
    else if (tag.startsWith("<w:tc")) cellDepth++;
    else if (tag === "</w:tc>") {
      cellDepth = Math.max(0, cellDepth - 1);
      out = out.replace(/ +$/, "") + " | ";
    } else if (tag === "</w:tr>") out = out.replace(/ \| $/, "") + "\n";
    else if (tag === "</w:p>") out += cellDepth > 0 ? " " : "\n";
  }
  return tidy(out);
}

function tidy(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/(\s*\|\s*)+$/, "").replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function bytesOf(content: unknown): Uint8Array {
  if (content instanceof Uint8Array) return content;
  if (Array.isArray(content)) return Uint8Array.from(content as number[]);
  return new Uint8Array(0);
}

export function extractDocxText(buf: Uint8Array): string {
  const zip = XLSX.CFB.read(buf, { type: "array" });
  const entry = XLSX.CFB.find(zip, "/word/document.xml");
  if (!entry) {
    // 암호가 걸린 docx는 ZIP이 아니라 복합 문서(EncryptionInfo)로 저장된다
    if (XLSX.CFB.find(zip, "/EncryptionInfo")) throw new WordEncryptedError("encrypted");
    throw new Error("word/document.xml not found");
  }
  return docxXmlToText(new TextDecoder("utf-8").decode(bytesOf(entry.content)));
}

const u16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u32 = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

/** 8비트로 저장된 조각(영문 위주)의 글자 — Windows-1252의 0x80~0x9F 구간만 따로 바꾼다 */
const CP1252: Record<number, number> = {
  0x80: 0x20ac,
  0x82: 0x201a,
  0x83: 0x0192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x86: 0x2020,
  0x87: 0x2021,
  0x88: 0x02c6,
  0x89: 0x2030,
  0x8a: 0x0160,
  0x8b: 0x2039,
  0x8c: 0x0152,
  0x8e: 0x017d,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x98: 0x02dc,
  0x99: 0x2122,
  0x9a: 0x0161,
  0x9b: 0x203a,
  0x9c: 0x0153,
  0x9e: 0x017e,
  0x9f: 0x0178,
};

/** 워드 97~2003(.doc) 본문 텍스트 */
export function extractDocText(buf: Uint8Array): string {
  const cfb = XLSX.CFB.read(buf, { type: "array" });
  const wordEntry = XLSX.CFB.find(cfb, "/WordDocument");
  if (!wordEntry) throw new Error("WordDocument stream not found");
  const wd = bytesOf(wordEntry.content);
  if (u16(wd, 0) !== 0xa5ec) throw new Error("not a Word 97 document");
  const flags = u16(wd, 0x0a);
  if (flags & 0x0100) throw new WordEncryptedError("encrypted");
  const tableEntry = XLSX.CFB.find(cfb, flags & 0x0200 ? "/1Table" : "/0Table");
  if (!tableEntry) throw new Error("table stream not found");
  const table = bytesOf(tableEntry.content);

  // 조각 표(Clx): 서식 블록(0x01)을 건너뛰고 0x02 뒤의 PlcPcd를 읽는다
  const fcClx = u32(wd, 0x01a2);
  const lcbClx = u32(wd, 0x01a6);
  let pos = fcClx;
  const end = fcClx + lcbClx;
  while (pos < end && table[pos] === 0x01) pos += 3 + u16(table, pos + 1);
  if (table[pos] !== 0x02) throw new Error("piece table not found");
  const lcb = u32(table, pos + 1);
  const plc = pos + 5;
  const count = (lcb - 4) / 12;
  if (!Number.isInteger(count) || count <= 0) throw new Error("bad piece table");

  let text = "";
  for (let i = 0; i < count; i++) {
    const cpStart = u32(table, plc + i * 4);
    const cpEnd = u32(table, plc + (i + 1) * 4);
    const pcd = plc + (count + 1) * 4 + i * 8;
    const fc = u32(table, pcd + 2);
    const len = cpEnd - cpStart;
    if (fc & 0x40000000) {
      const at = (fc & 0x3fffffff) / 2;
      for (let k = 0; k < len; k++) {
        const c = wd[at + k];
        text += String.fromCharCode(CP1252[c] ?? c);
      }
    } else {
      for (let k = 0; k < len; k++) text += String.fromCharCode(u16(wd, fc + k * 2));
    }
  }

  // 필드(\x13 명령 \x14 결과 \x15)는 결과만, 표 칸 끝(\x07)은 " | ", 문단·줄 끝은 줄바꿈
  const cleaned = text
    .replace(/\x13[^\x13\x14\x15]*\x14/g, "")
    .replace(/\x13[^\x13\x14\x15]*\x15/g, "")
    .replace(/[\x14\x15]/g, "")
    // 표: 칸마다 \x07, 행 끝에 \x07이 하나 더 붙는다 → 두 개 이어지면 행 끝으로 본다
    .replace(/\x07\x07/g, " |\n")
    .replace(/\x07/g, " | ")
    .replace(/[\r\x0b\x0c]/g, "\n")
    .replace(/[\x00-\x08\x0e-\x1f]/g, "");
  return tidy(cleaned);
}
