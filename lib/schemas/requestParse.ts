import { z } from "zod";
import type { ThemeId, TripInput } from "@/types";

/** 한 줄로 쓴 견적 요청을 입력칸으로 나누는 요청 */
export const requestParseSchema = z.object({
  text: z.string().trim().min(2, "요청을 입력해 주세요.").max(500, "요청이 너무 깁니다. (최대 500자)"),
  /** 오늘 날짜 YYYY-MM-DD ("다음 달 10일" 같은 상대 날짜 계산용) */
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type RequestParseRequest = z.infer<typeof requestParseSchema>;

const THEME_IDS = ["history", "food", "nature", "shopping", "photo", "activity", "local"] as const;

export const requestParseResultSchema = z.object({
  destination: z.string().describe("여행지(도시, 국가). 여러 도시면 쉼표로. 없으면 빈 문자열"),
  days: z.number().describe("총 일수 (예: 3박5일이면 5). 없으면 0"),
  nights: z.number().describe("숙박 수 (예: 3박5일이면 3). 없으면 -1"),
  travelers: z.number().describe("인원 수. 없으면 0"),
  departureDate: z.string().describe("출발일 YYYY-MM-DD. 상대 날짜는 오늘 기준으로 계산. 없으면 빈 문자열"),
  originCity: z.string().describe("출발 도시(예: 인천, 부산). 없으면 빈 문자열"),
  packageType: z.enum(["land", "land_hotel", "full", "unknown"]).describe("랜드만 / 랜드+숙박 / 항공 포함 풀패키지. 언급 없으면 unknown"),
  tripScope: z.enum(["domestic", "overseas", "unknown"]).describe("국내(한국 방문 외국인 대상)/해외. 모르면 unknown"),
  travelType: z.enum(["semi", "package", "honeymoon", "senior", "accessible", "unknown"]).describe("여행 유형. 언급 없으면 unknown"),
  targetMarginRate: z.number().describe("목표 마진율(%). 없으면 0"),
  themes: z.array(z.enum(THEME_IDS)).describe("언급된 선호 테마. 없으면 빈 배열"),
  notes: z.string().describe("위 항목에 들어가지 않는 고객 요청사항 (예: 시니어 위주, 도보 최소화). 없으면 빈 문자열"),
});

export type RequestParseResult = z.infer<typeof requestParseResultSchema>;

/** 읽어낸 값 중 확인된 것만 입력 패치로 바꾼다. 비어 있거나 모르는 값은 건드리지 않는다. */
export function toInputPatch(r: RequestParseResult, current: Pick<TripInput, "notes">): { patch: Partial<TripInput>; filled: string[] } {
  const patch: Partial<TripInput> = {};
  const filled: string[] = [];
  if (r.destination.trim()) {
    patch.destination = r.destination.trim();
    filled.push("여행지");
  }
  if (r.days >= 1 && r.days <= 14) {
    patch.days = Math.round(r.days);
    filled.push("일수");
  }
  if (r.nights >= 0 && r.nights <= 30) {
    patch.nights = Math.round(r.nights);
    filled.push("숙박");
  } else if (patch.days) {
    // 숙박 수를 말하지 않았으면 임시로 일수 − 1. 항공편을 고르면 출국·귀국 시각으로 다시 맞춘다
    patch.nights = Math.max(0, patch.days - 1);
  }
  if (r.travelers >= 1 && r.travelers <= 50) {
    patch.travelers = Math.round(r.travelers);
    filled.push("인원");
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(r.departureDate.trim())) {
    patch.departureDate = r.departureDate.trim();
    filled.push("출발일");
  }
  if (r.originCity.trim()) {
    patch.originCity = r.originCity.trim();
    filled.push("출발지");
  }
  if (r.packageType !== "unknown") {
    patch.packageType = r.packageType;
    if (r.packageType === "full") patch.includesFlights = true;
    filled.push("판매 구성");
  }
  if (r.tripScope !== "unknown") {
    patch.tripScope = r.tripScope;
    filled.push("국내/해외");
  }
  if (r.travelType !== "unknown") {
    patch.travelType = r.travelType;
    filled.push("여행 유형");
  }
  if (r.targetMarginRate > 0 && r.targetMarginRate < 90) {
    patch.targetMarginRate = r.targetMarginRate;
    filled.push("목표 마진");
  }
  if (r.themes.length > 0) {
    patch.themes = r.themes as ThemeId[];
    filled.push("테마");
  }
  if (r.notes.trim()) {
    patch.notes = [current.notes.trim(), r.notes.trim()].filter(Boolean).join("\n");
    filled.push("요청사항");
  }
  return { patch, filled };
}
