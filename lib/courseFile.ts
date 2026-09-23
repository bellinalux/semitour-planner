/**
 * 업체 코스표로 올릴 수 있는 파일 형식과 크기 제한. 클라이언트(업로드)와 서버(검증)가 함께 쓴다.
 *
 * 확장자로 판별하는 이유: 브라우저·OS에 따라 .hwp/.hwpx 같은 파일은 file.type(MIME)이
 * 빈 문자열로 오는 경우가 많아, 파일 이름의 확장자를 기준으로 삼는 것이 더 안정적이다.
 */

/** Gemini가 파일 자체를 바로 읽을 수 있는 형식 (이미지·PDF) */
export const COURSE_VISUAL_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "webp"] as const;

/** 서버에서 먼저 텍스트를 뽑아낸 뒤, 그 텍스트를 코스 원문처럼 쓰는 형식 */
export const COURSE_TEXT_EXTRACT_EXTENSIONS = ["txt", "xlsx", "xls", "hwp", "hwpx"] as const;

export const COURSE_FILE_ACCEPT = [...COURSE_VISUAL_EXTENSIONS, ...COURSE_TEXT_EXTRACT_EXTENSIONS].map((e) => `.${e}`).join(",");

export const COURSE_FILE_TYPES_LABEL = "사진(PNG·JPG·WEBP), PDF, 한글(HWP·HWPX), 엑셀(XLSX·XLS), 텍스트(TXT)";

/** 업로드 파일 원본 크기 상한 (base64로 인코딩하면 약 4/3배가 된다) */
export const MAX_COURSE_FILE_BYTES = 6 * 1024 * 1024;

export interface CourseFile {
  name: string;
  mimeType: string;
  /** base64로 인코딩한 파일 내용 */
  data: string;
}

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  txt: "text/plain",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  hwp: "application/x-hwp",
  hwpx: "application/vnd.hancom.hwpx",
};

export function courseFileExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function isSupportedCourseFile(name: string): boolean {
  const ext = courseFileExt(name);
  return (COURSE_VISUAL_EXTENSIONS as readonly string[]).includes(ext) || (COURSE_TEXT_EXTRACT_EXTENSIONS as readonly string[]).includes(ext);
}

/** Gemini에게 파일 그대로(이미지·PDF) 보여줄지, 서버에서 텍스트를 뽑아낼지 */
export function isVisualCourseFile(name: string): boolean {
  return (COURSE_VISUAL_EXTENSIONS as readonly string[]).includes(courseFileExt(name));
}

/** 브라우저가 준 MIME이 비어 있거나 믿을 수 없을 때, 확장자로 표준 MIME을 채운다 */
export function mimeTypeForCourseFile(name: string, browserType: string): string {
  return EXT_MIME[courseFileExt(name)] ?? browserType ?? "application/octet-stream";
}
