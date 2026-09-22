import { z } from "zod";
import type { FlightWebEstimate } from "@/types";

const CURRENCIES = ["KRW", "USD", "EUR", "JPY", "GBP", "CNY", "THB", "VND", "SGD", "AUD"] as const;

/** ---------- 클라이언트 → 서버 요청 ---------- */

export const flightWebRequestSchema = z.object({
  origin: z.string().trim().min(1, "출발지를 입력해 주세요.").max(60),
  destination: z.string().trim().min(1, "여행지를 입력해 주세요.").max(100),
  /** 여행 일수 (귀국일 계산용) */
  days: z.number().int().min(2).max(31),
  currency: z.enum(CURRENCIES),
});

export type FlightWebRequest = z.infer<typeof flightWebRequestSchema>;

/** ---------- LLM 응답 ---------- */

export const flightWebResponseSchema = z.object({
  roundTripLow: z.number().describe("왕복 이코노미 1인 요금 하한 (요청 통화, 세금·유류할증료 포함 기준)"),
  roundTripHigh: z.number().describe("왕복 이코노미 1인 요금 상한 (요청 통화)"),
  basis: z.enum(["searched", "estimated"]).describe("검색 결과 페이지에서 실제 금액을 확인했으면 searched, 아니면 estimated"),
  direct: z.boolean().describe("직항 노선이 있으면 true"),
  airlines: z.string().describe("이 노선을 운항하는 주요 항공사 (예: 대한항공, 아시아나항공, 베트남항공). 확인 못하면 빈 문자열"),
  cheapestNote: z.string().describe("저렴한 시기·요일 경향 등 검색에서 확인한 메모 한 줄. 확인 못하면 빈 문자열"),
  sourceName: z.string().describe("요금을 확인한 사이트 이름 (예: 네이버 항공권, Google Flights, 스카이스캐너). 확인 못하면 빈 문자열"),
  priceNote: z.string().describe("유의사항 한 줄 (유류할증료·제세공과금 포함 여부, 경유 포함 최저가인지 등). 없으면 빈 문자열"),
});

type Parsed = z.infer<typeof flightWebResponseSchema>;

const nonNeg = (n: number) => Math.max(0, Math.round(n));
const ordered = (a: number, b: number): [number, number] => [Math.min(nonNeg(a), nonNeg(b)), Math.max(nonNeg(a), nonNeg(b))];

/** 예약처를 구글 항공권에서 다시 검색하는 링크 */
export function flightWebSearchUrl(origin: string, destination: string): string {
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${origin} to ${destination}`)}`;
}

/** 검증된 LLM 응답을 앱 내부 타입으로 다듬는다 */
export function toFlightWebEstimate(parsed: Parsed, req: FlightWebRequest): FlightWebEstimate {
  const [low, high] = ordered(parsed.roundTripLow, parsed.roundTripHigh);
  return {
    roundTripLow: low,
    roundTripHigh: high,
    basis: low > 0 ? parsed.basis : "estimated",
    direct: parsed.direct,
    airlines: parsed.airlines.trim(),
    cheapestNote: parsed.cheapestNote.trim(),
    sourceName: parsed.sourceName.trim(),
    priceNote: parsed.priceNote.trim(),
    searchUrl: flightWebSearchUrl(req.origin.trim(), req.destination.trim()),
    checkedAt: new Date().toISOString(),
  };
}
