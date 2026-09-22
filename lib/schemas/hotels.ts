import { z } from "zod";
import type { HotelCandidate } from "@/types";

/** ---------- 클라이언트 → 서버 요청 ---------- */

export const hotelRequestSchema = z.object({
  destination: z.string().trim().min(1, "여행지를 입력해 주세요.").max(100),
  grade: z.enum(["any", "3", "4", "5", "resort"]),
  lodgingType: z.enum(["hotel", "bnb", "resort"]),
  preferences: z.array(z.enum(["transit", "airport", "korean", "breakfast", "value"])).max(5),
  currency: z.enum(["KRW", "USD", "EUR", "JPY", "GBP", "CNY", "THB", "VND", "SGD", "AUD"]),
});

export type HotelRequest = z.infer<typeof hotelRequestSchema>;

/** ---------- LLM 응답 (모델에게 보여주는 스키마이기도 하다) ---------- */

export const hotelResponseSchema = z.object({
  hotels: z
    .array(
      z.object({
        name: z.string().describe("숙소의 정확한 상호. 영문 원문(한글 표기)"),
        grade: z.string().describe("등급 표기 (예: 4성급, 5성급, 리조트, 아파트먼트)"),
        area: z.string().describe("구/지역 이름"),
        nearestStation: z.string().describe("가장 가까운 지하철·기차역 이름. 없으면 빈 문자열"),
        walkMinutes: z.number().describe("그 역까지 도보 분. 모르면 0"),
        nightlyLow: z.number().describe("1박 요금 하한 (요청 통화). 모르면 추정값"),
        nightlyHigh: z.number().describe("1박 요금 상한 (요청 통화). 모르면 추정값"),
        priceBasis: z.enum(["searched", "estimated"]).describe("검색에서 요금을 확인했으면 searched, 못 했으면 estimated"),
        koreanFriendly: z
          .boolean()
          .describe("한국어 후기·기사·여행 커뮤니티에서 한국인 이용이 확인된 경우에만 true. 확인이 안 되면 false"),
        koreanNote: z.string().describe("한국인 이용이 확인된 근거 한 줄. 확인이 안 되면 빈 문자열"),
        highlights: z.string().describe("이 숙소를 추천하는 이유 한 줄 (위치, 교통, 시설)"),
      }),
    )
    .describe("추천 숙소 4~5곳"),
});

type Parsed = z.infer<typeof hotelResponseSchema>;

const nonNeg = (n: number) => Math.max(0, Math.round(n * 100) / 100);

/** 구글 지도에서 이 숙소를 검색하는 링크 */
export function mapSearchUrl(name: string, destination: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${destination}`)}`;
}

/** 검증된 LLM 응답을 앱 내부 타입으로 다듬는다 (요금 순서 보정, 지도 링크 생성). */
export function toHotelCandidates(parsed: Parsed, destination: string): HotelCandidate[] {
  return parsed.hotels
    .filter((h) => h.name.trim() !== "")
    .map((h) => {
      const low = Math.min(nonNeg(h.nightlyLow), nonNeg(h.nightlyHigh));
      const high = Math.max(nonNeg(h.nightlyLow), nonNeg(h.nightlyHigh));
      return {
        name: h.name.trim(),
        grade: h.grade.trim(),
        area: h.area.trim(),
        nearestStation: h.nearestStation.trim(),
        walkMinutes: Math.max(0, Math.round(h.walkMinutes)),
        nightlyLow: low,
        nightlyHigh: high,
        priceBasis: h.priceBasis,
        koreanFriendly: h.koreanFriendly && h.koreanNote.trim() !== "",
        koreanNote: h.koreanFriendly ? h.koreanNote.trim() : "",
        highlights: h.highlights.trim(),
        mapUrl: mapSearchUrl(h.name.trim(), destination),
      };
    });
}
