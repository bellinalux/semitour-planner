import { z } from "zod";

/** 이용 편의시설 재검색 요청 */
export const verifyAccessibilityRequestSchema = z.object({
  destination: z.string().trim().min(1, "여행지를 입력해 주세요.").max(100),
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(60),
        name: z.string().trim().min(1).max(120),
        /** 그 항목이 속한 도시 (여러 도시를 도는 코스에서 같은 이름의 장소를 구분하는 데 쓴다) */
        city: z.string().trim().max(60).optional(),
      }),
    )
    .min(1, "확인할 항목이 없습니다.")
    .max(30, "한 번에 30개까지 확인할 수 있습니다."),
});

export type VerifyAccessibilityRequest = z.infer<typeof verifyAccessibilityRequestSchema>;

/** ---------- LLM 응답 ---------- */

export const accessibilityResultSchema = z.object({
  results: z.array(
    z.object({
      id: z.string().describe("요청한 코스 ID"),
      level: z.enum(["ok", "limited", "difficult", "unknown"]).describe("휠체어·거동불편 여행자의 이용 가능 정도"),
      wheelchairAccessible: z.boolean(),
      accessibleRestroom: z.boolean(),
      elevator: z.boolean(),
      ramp: z.boolean(),
      note: z.string().describe("조사 근거·유의사항 한 줄. 확인 못했으면 빈 문자열"),
    }),
  ),
});

export type AccessibilityResult = z.infer<typeof accessibilityResultSchema>["results"][number];

export interface VerifyAccessibilityResponse {
  results: AccessibilityResult[];
  sources: { title: string; url: string }[];
  searched: boolean;
  checkedAt: string;
}
