import { z } from "zod";

/** 출발 시기 확인 — 여행지·출발일·일수로 날씨(우기·태풍·더위)·현지 공휴일·축제·휴관·성수기 혼잡을 확인한다 */
export const seasonRequestSchema = z.object({
  destination: z.string().trim().min(1, "여행지를 입력해 주세요.").max(100),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "출발일을 입력해 주세요."),
  days: z.number().int().min(1).max(60),
});
export type SeasonRequest = z.infer<typeof seasonRequestSchema>;

const noteSchema = z.object({
  kind: z.enum(["weather", "holiday", "event", "closure", "crowd"]).describe("weather 날씨(우기·태풍·폭염·한파) / holiday 현지 공휴일 / event 축제·행사 / closure 휴관·공사 / crowd 성수기 혼잡·요금 상승"),
  severity: z.enum(["warn", "info"]).describe("일정·안전·운영에 영향이 크면 warn, 참고면 info"),
  title: z.string().describe("한 줄 요약 (예: 10월 초 태풍 가능성)"),
  detail: z.string().describe("무엇을 대비할지 한두 문장 (예: 실내 대체 일정 준비, 여행자보험 안내)"),
  dates: z.string().describe("해당 날짜·기간 (예: 10월 1~7일). 시기 전체면 빈 문자열"),
});

export const seasonResultSchema = z.object({
  weather: z.string().describe("그 시기 날씨 한 줄 (평균 기온·강수, 옷차림)"),
  notes: z.array(noteSchema).describe("출발 기간에 해당하는 것만, 최대 6개. 검색으로 확인한 것만"),
});
export type SeasonNote = z.infer<typeof noteSchema>;

export interface SeasonResponse {
  weather: string;
  notes: SeasonNote[];
  searched: boolean;
  sources: { title: string; url: string }[];
}
