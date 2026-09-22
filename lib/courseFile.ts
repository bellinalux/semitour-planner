/** 업체 코스표로 올릴 수 있는 파일 형식과 크기 제한. 클라이언트(업로드)와 서버(검증)가 함께 쓴다. */
export const COURSE_FILE_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;

/** 업로드 파일 원본 크기 상한 (base64로 인코딩하면 약 4/3배가 된다) */
export const MAX_COURSE_FILE_BYTES = 6 * 1024 * 1024;

export interface CourseFile {
  name: string;
  mimeType: string;
  /** base64로 인코딩한 파일 내용 */
  data: string;
}
