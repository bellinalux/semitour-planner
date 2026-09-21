import { z } from "zod";
import type { TourCandidate } from "@/types";

const CATEGORY_IDS = ["city", "night", "museum", "daytrip", "cruise", "cooking", "show", "activity"] as const;

/** ---------- 클라이언트 → 서버 요청 ---------- */

export const tourRequestSchema = z.object({
  destination: z.string().trim().min(1, "여행지를 입력해 주세요.").max(100),
  categories: z.array(z.enum(CATEGORY_IDS)).min(1, "투어 종류를 하나 이상 선택해 주세요.").max(8),
  currency: z.enum(["KRW", "USD", "EUR", "JPY", "GBP", "CNY", "THB", "VND", "SGD", "AUD"]),
});

export type TourRequest = z.infer<typeof tourRequestSchema>;

/** ---------- LLM 응답 (모델에게 보여주는 스키마이기도 하다) ---------- */

export const tourResponseSchema = z.object({
  tours: z
    .array(
      z.object({
        name: z.string().describe("투어 이름 (운영 업체가 쓰는 정확한 상품명)"),
        category: z.enum(CATEGORY_IDS).describe("요청한 투어 종류 중 이 투어에 해당하는 것"),
        description: z.string().describe("어떤 투어인지 1~2문장"),
        durationMinutes: z.number().describe("소요 시간(분). 모르면 0"),
        priceLow: z.number().describe("1인 요금 하한 (요청 통화)"),
        priceHigh: z.number().describe("1인 요금 상한 (요청 통화)"),
        priceBasis: z.enum(["searched", "estimated"]).describe("예약 사이트에서 요금을 확인했으면 searched, 아니면 estimated"),
        includes: z.string().describe("요금에 포함되는 것 (입장권, 가이드, 식사, 이동 등). 확인 못하면 빈 문자열"),
        booking: z.string().describe("예약 필요 여부, 집합 장소, 운영 요일 등 한 줄. 확인 못하면 빈 문자열"),
        koreanGuide: z.boolean().describe("한국어 가이드나 한국어 후기가 확인된 경우에만 true"),
        koreanNote: z.string().describe("한국어 가이드/후기 근거 한 줄. 확인 못하면 빈 문자열"),
        highlights: z.string().describe("이 투어를 추천하는 이유 한 줄"),
      }),
    )
    .describe("추천 투어 6~10개, 요청한 종류를 골고루"),
});

type Parsed = z.infer<typeof tourResponseSchema>;

const nonNeg = (n: number) => Math.max(0, Math.round(n * 100) / 100);

/** 예약처를 구글에서 검색하는 링크 */
export function tourSearchUrl(name: string, destination: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`${name} ${destination} 예약`)}`;
}

/** 검증된 LLM 응답을 앱 내부 타입으로 다듬는다 (요금 순서 보정, 검색 링크 생성, 중복 제거). */
export function toTourCandidates(parsed: Parsed, destination: string): TourCandidate[] {
  const seen = new Set<string>();
  return parsed.tours
    .filter((t) => {
      const key = t.name.trim().toLowerCase();
      if (key === "" || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((t) => ({
      name: t.name.trim(),
      category: t.category,
      description: t.description.trim(),
      durationMinutes: Math.max(0, Math.round(t.durationMinutes)),
      priceLow: Math.min(nonNeg(t.priceLow), nonNeg(t.priceHigh)),
      priceHigh: Math.max(nonNeg(t.priceLow), nonNeg(t.priceHigh)),
      priceBasis: t.priceBasis,
      includes: t.includes.trim(),
      booking: t.booking.trim(),
      koreanGuide: t.koreanGuide && t.koreanNote.trim() !== "",
      koreanNote: t.koreanGuide ? t.koreanNote.trim() : "",
      highlights: t.highlights.trim(),
      searchUrl: tourSearchUrl(t.name.trim(), destination),
    }));
}
