import { z } from "zod";
import type { CompetitorItinerary } from "@/types";

/** 경쟁 상품 일정 가져오기 요청 — 상품 이름·여행사·판매 페이지(또는 검색 링크)로 그 상품의 일정표를 찾는다 */
export const competitorItineraryRequestSchema = z.object({
  agency: z.string().trim().max(60).default(""),
  productName: z.string().trim().min(1).max(160),
  url: z.string().trim().max(500).default(""),
  destination: z.string().trim().min(1).max(100),
  nights: z.number().int().min(0).max(30).default(0),
  days: z.number().int().min(0).max(31).default(0),
});
export type CompetitorItineraryRequest = z.infer<typeof competitorItineraryRequestSchema>;

export const competitorItineraryResultSchema = z.object({
  found: z.boolean().describe("이 상품의 날짜별 일정표를 메모에서 확인했으면 true"),
  days: z
    .array(
      z.object({
        day: z.number().describe("몇째 날"),
        title: z.string().describe("그날 요약 한 줄"),
        places: z.array(z.string()).describe("그날 방문지·관광지 이름 (방문 순서대로, 메모에 적힌 것만)"),
        breakfast: z.string().describe("조식: 호텔식/포함 식당·메뉴/불포함/자유식/없음. 모르면 빈 문자열"),
        lunch: z.string().describe("중식: 포함 식당·메뉴/불포함/자유식/기내식. 모르면 빈 문자열"),
        dinner: z.string().describe("석식: 포함 식당·메뉴/불포함/자유식. 모르면 빈 문자열"),
        hotel: z.string().describe("그날 숙박 호텔 이름·등급. 없거나 모르면 빈 문자열"),
        free: z.boolean().describe("그날이 자유일정이면 true"),
        otherRegion: z.string().describe("요청한 여행지 밖 지역을 도는 날이면 그 지역 이름 (예: 홍콩). 아니면 빈 문자열"),
      }),
    )
    .describe("날짜별 일정 (첫날부터 순서대로). 일정표를 못 찾았으면 빈 배열"),
  mealCount: z.number().describe("포함된 식사 횟수 (조식 제외, 중식+석식). 모르면 0"),
  tipNote: z.string().describe("가이드·기사 경비(팁) 조건 원문 짧게. 모르면 빈 문자열"),
  sourceName: z.string().describe("일정표를 확인한 사이트 이름. 없으면 빈 문자열"),
});

/** 검증된 응답을 앱 형태로 — 방문지·날짜 수를 줄이고 빈 날은 버린다 */
export function toCompetitorItinerary(raw: z.infer<typeof competitorItineraryResultSchema>, searched: boolean): CompetitorItinerary {
  const t = (s: string, n: number) => s.trim().slice(0, n);
  const days = raw.days
    .filter((d) => d.day > 0)
    .slice(0, 20)
    .map((d) => ({
      day: Math.round(d.day),
      title: t(d.title, 80),
      places: d.places.map((p) => t(p, 60)).filter(Boolean).slice(0, 15),
      meals: { breakfast: t(d.breakfast, 40), lunch: t(d.lunch, 40), dinner: t(d.dinner, 40) },
      hotel: t(d.hotel, 60),
      free: d.free,
      otherRegion: t(d.otherRegion, 30),
    }));
  return {
    found: searched && raw.found && days.length > 0,
    days,
    mealCount: Math.max(0, Math.round(raw.mealCount)),
    tipNote: t(raw.tipNote, 80),
    sourceName: t(raw.sourceName, 60),
    checkedAt: new Date().toISOString(),
  };
}
