import { z } from "zod";

/** 하루 일정에 남는 여유 시간을 추천 코스로 채우는 요청 */
export const dayFillRequestSchema = z.object({
  destination: z.string().trim().min(1, "여행지를 입력해 주세요.").max(100),
  /** 그날 숙박(또는 도착)하는 도시. 다지역 코스에서 더 정확한 추천에 쓴다 */
  city: z.string().trim().max(60).optional(),
  /** 국내(한국을 방문하는 외국인 대상)/해외(한국인이 떠나는 여행) 여부. 추천 검색 대상 관광객을 정한다 */
  tripScope: z.enum(["domestic", "overseas"]).default("overseas"),
  currency: z.enum(["KRW", "USD", "EUR", "JPY", "GBP", "CNY", "THB", "VND", "SGD", "AUD"]),
  /** 이미 일정에 있어 중복 추천을 피할 장소 이름들 */
  existingNames: z.array(z.string().trim().max(120)).max(30).default([]),
  /** 채워야 할 여유 시간(분) */
  freeMinutes: z.number().int().min(60).max(720),
  /** 이 시각부터 비어 있음 (예: "14:30"). 모르면 빈 문자열 */
  fromTime: z.string().max(10).default(""),
});

export type DayFillRequest = z.infer<typeof dayFillRequestSchema>;

/** ---------- LLM 응답 ---------- */

const dayFillItemSchema = z.object({
  name: z.string().describe("명소·식당·체험 이름 (현지에서 검색 가능한 실제 이름)"),
  description: z.string().describe("이 장소에서 하는 활동과 볼거리 1~2문장"),
  reason: z.string().describe("이 관광객층에게 왜 추천하는지 근거 한 문장 (여행 후기·블로그·커뮤니티에서 확인한 인기 이유)"),
  stayMinutes: z.number().describe("예상 체류 시간(분)"),
  travelMinutesToNext: z.number().describe("다음 추천 장소까지 이동 시간(분). 마지막 추천이면 0"),
  entryFee: z.number().describe("1인 입장료 (요청 통화 단위, 무료면 0)"),
  mealCost: z.number().describe("1인 식대 (식사 장소가 아니면 0)"),
  caution: z.string().describe("휴관일·예약 필요 등 확인이 필요한 사항. 없으면 빈 문자열"),
  cuisine: z.string().describe("식사 장소면 음식 종류를 짧게 적는다(예: 현지식, 한식, 씨푸드). 식사가 아니면 빈 문자열"),
});

export const dayFillResultSchema = z.object({
  suggestions: z
    .array(dayFillItemSchema)
    .max(4)
    .describe("여유 시간에 채울 추천 코스, 방문 순서대로. 추천할 곳이 없으면 빈 배열"),
});

export type DayFillResult = z.infer<typeof dayFillResultSchema>;
export type DayFillSuggestion = z.infer<typeof dayFillItemSchema>;

export interface DayFillResponse extends DayFillResult {
  sources: { title: string; url: string }[];
  searched: boolean;
}
