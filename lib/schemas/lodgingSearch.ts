import { z } from "zod";
import type { LodgingWebEstimate } from "@/types";

const CURRENCIES = ["KRW", "USD", "EUR", "JPY", "GBP", "CNY", "THB", "VND", "SGD", "AUD"] as const;

/** ---------- 클라이언트 → 서버 요청 ---------- */

export const lodgingWebRequestSchema = z.object({
  destination: z.string().trim().min(1, "여행지를 입력해 주세요.").max(100),
  lodgingType: z.enum(["hotel", "bnb", "resort"]),
  hotelGrade: z.enum(["any", "3", "4", "5", "resort"]).default("4"),
  currency: z.enum(CURRENCIES),
});

export type LodgingWebRequest = z.infer<typeof lodgingWebRequestSchema>;

/** ---------- LLM 응답 ---------- */

export const lodgingWebResponseSchema = z.object({
  rateLow: z.number().describe("1박 요금 하한 (요청 통화). 호텔은 2인 1실, BnB는 1유닛(4인 기준)"),
  rateHigh: z.number().describe("1박 요금 상한 (요청 통화)"),
  basis: z.enum(["searched", "estimated"]).describe("검색 결과 페이지에서 실제 금액을 확인했으면 searched, 아니면 estimated"),
  cityTaxPerPersonPerNight: z.number().describe("1인 1박 숙박세·관광세 (요청 통화). 없거나 확인 못하면 0"),
  areaNote: z.string().describe("추천 숙박 지역/구역 한 줄 (예: 시내 중심가, 역 근처). 확인 못하면 빈 문자열"),
  sourceName: z.string().describe("요금을 확인한 사이트 이름 (예: Booking.com, Agoda, 네이버 호텔). 확인 못하면 빈 문자열"),
  priceNote: z.string().describe("유의사항 한 줄 (조식 포함 여부, 세금·봉사료 포함 여부 등). 없으면 빈 문자열"),
});

type Parsed = z.infer<typeof lodgingWebResponseSchema>;

const nonNeg = (n: number) => Math.max(0, Math.round(n));
const ordered = (a: number, b: number): [number, number] => [Math.min(nonNeg(a), nonNeg(b)), Math.max(nonNeg(a), nonNeg(b))];

/** 예약처를 다시 검색해 볼 수 있는 링크 */
export function lodgingWebSearchUrl(destination: string, lodgingType: "hotel" | "bnb" | "resort"): string {
  const q =
    lodgingType === "bnb"
      ? `${destination} 에어비앤비 아파트 숙소`
      : lodgingType === "resort"
        ? `${destination} 리조트 예약`
        : `${destination} 호텔 예약`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

/** 검증된 LLM 응답을 앱 내부 타입으로 다듬는다 */
export function toLodgingWebEstimate(parsed: Parsed, req: LodgingWebRequest): LodgingWebEstimate {
  const [low, high] = ordered(parsed.rateLow, parsed.rateHigh);
  return {
    rateLow: low,
    rateHigh: high,
    basis: low > 0 ? parsed.basis : "estimated",
    cityTaxPerPersonPerNight: nonNeg(parsed.cityTaxPerPersonPerNight),
    areaNote: parsed.areaNote.trim(),
    sourceName: parsed.sourceName.trim(),
    priceNote: parsed.priceNote.trim(),
    searchUrl: lodgingWebSearchUrl(req.destination.trim(), req.lodgingType),
    checkedAt: new Date().toISOString(),
  };
}
