import { HwpEncryptedError, HwpUnsupportedError, HwpInvalidFormatError, HwpxReader, hwpToMarkdown } from "hwp-convert";
import * as XLSX from "xlsx";
import { courseFileExt } from "@/lib/courseFile";

/** 서버에서 텍스트를 뽑아낸 결과. text가 비어 있으면(표·내용을 못 찾음) 상위에서 에러로 처리한다. */
export interface ExtractedCourseText {
  text: string;
}

function readableExtractError(name: string): string {
  const ext = courseFileExt(name).toUpperCase();
  return `${ext} 파일에서 내용을 읽지 못했습니다. 파일이 손상되지 않았는지 확인하거나, PDF·이미지로 다시 올려주세요.`;
}

/** 엑셀(xlsx·xls)의 모든 시트를 표 형태 텍스트로 바꾼다 */
function extractExcelText(buf: Uint8Array): string {
  const wb = XLSX.read(buf, { type: "array" });
  const parts = wb.SheetNames.map((name) => {
    const sheet = wb.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    return `[시트: ${name}]\n${csv}`.trim();
  }).filter((part) => part.length > 0);
  return parts.join("\n\n");
}

/** 한글(HWP) 파일을 표를 보존한 마크다운 텍스트로 바꾼다. HWP 5.0(.hwp)과 HWPX(.hwpx) 모두 지원. */
async function extractHwpText(buf: Uint8Array, ext: string): Promise<string> {
  if (ext === "hwpx") {
    const reader = new HwpxReader();
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    await reader.loadFromArrayBuffer(arrayBuffer);
    return (await reader.extractMarkdown()).trim();
  }
  return (await hwpToMarkdown(buf)).trim();
}

/**
 * 업로드한 파일(엑셀·한글·텍스트)에서 코스 원문으로 쓸 텍스트를 뽑아낸다.
 * PDF·이미지는 Gemini가 직접 읽으므로 이 함수를 거치지 않는다 (isVisualCourseFile로 분기).
 */
export async function extractCourseFileText(file: { name: string; data: string }): Promise<ExtractedCourseText> {
  const ext = courseFileExt(file.name);
  const buf = Uint8Array.from(Buffer.from(file.data, "base64"));

  try {
    if (ext === "txt") {
      return { text: Buffer.from(buf).toString("utf-8").trim() };
    }
    if (ext === "xlsx" || ext === "xls") {
      return { text: extractExcelText(buf) };
    }
    if (ext === "hwp" || ext === "hwpx") {
      return { text: await extractHwpText(buf, ext) };
    }
  } catch (err) {
    if (err instanceof HwpEncryptedError) {
      throw new Error("암호가 걸린 한글(HWP) 파일은 열 수 없습니다. 암호를 풀고 다시 올려주세요.");
    }
    if (err instanceof HwpUnsupportedError || err instanceof HwpInvalidFormatError) {
      throw new Error(readableExtractError(file.name));
    }
    console.error("[courseFileExtract]", err);
    throw new Error(readableExtractError(file.name));
  }

  throw new Error("지원하지 않는 파일 형식입니다.");
}
