import { z } from "zod";
import type { TravelEstimate } from "@/types";

/** ---------- 클라이언트 → 서버 요청 ---------- */

export const travelRequestSchema = z.object({
  origin: z.string().trim().min(1, "출발지를 입력해 주세요.").max(60),
  destination: z.string().trim().min(1, "여행지를 입력해 주세요.").max(100),
  currency: z.enum(["KRW", "USD", "EUR", "JPY", "GBP", "CNY", "THB", "VND", "SGD", "AUD"]),
  nights: z.number().int().min(0).max(30),
  hotelGrade: z.enum(["any", "3", "4", "5", "resort"]).default("4"),
});

export type TravelRequest = z.infer<typeof travelRequestSchema>;

/** ---------- LLM 응답 (모델에게 보여주는 스키마이기도 하다) ---------- */

export const travelResponseSchema = z.object({
  flight: z.object({
    roundTripLow: z.number().describe("왕복 이코노미 1인 요금 하한 (요청 통화, 세금 포함)"),
    roundTripHigh: z.number().describe("왕복 이코노미 1인 요금 상한 (요청 통화, 세금 포함)"),
    outboundHours: z.number().describe("출발지 → 도착지 비행 소요 시간 (시간 단위, 직항이 있으면 직항 기준)"),
    inboundHours: z.number().describe("도착지 → 출발지 비행 소요 시간 (시간 단위)"),
    direct: z.boolean().describe("직항 노선이 있으면 true"),
    note: z.string().describe("항공 관련 한 줄 메모 (경유지, 항공사 성격 등). 없으면 빈 문자열"),
  }),
  timeDifferenceHours: z.number().describe("도착지 시각 − 출발지 시각 (시간). 도착지가 느리면 음수"),
  lodging: z.object({
    hotelLow: z.number().describe("요청한 등급 호텔 2인 1실 1박 요금 하한 (요청 통화)"),
    hotelHigh: z.number().describe("요청한 등급 호텔 2인 1실 1박 요금 상한 (요청 통화)"),
    bnbLow: z.number().describe("아파트/BnB 1유닛(4인 기준) 1박 요금 하한 (요청 통화)"),
    bnbHigh: z.number().describe("아파트/BnB 1유닛(4인 기준) 1박 요금 상한 (요청 통화)"),
    cityTaxPerPersonPerNight: z.number().describe("1인 1박 숙박세/관광세 (요청 통화). 없으면 0"),
    note: z.string().describe("숙박 관련 한 줄 메모 (추천 숙박 지역 등). 없으면 빈 문자열"),
  }),
  seasonNote: z.string().describe("성수기/비수기, 축제 등 요금에 영향을 주는 시기 한 줄 안내"),
});

type Parsed = z.infer<typeof travelResponseSchema>;

const nonNeg = (n: number) => Math.max(0, Math.round(n * 100) / 100);
const ordered = (a: number, b: number): [number, number] => [Math.min(nonNeg(a), nonNeg(b)), Math.max(nonNeg(a), nonNeg(b))];

/** 검증된 LLM 응답을 앱 내부 타입으로 다듬는다 (하한/상한 순서 보정, 음수 제거). */
export function toTravelEstimate(p: Parsed): TravelEstimate {
  const [fLow, fHigh] = ordered(p.flight.roundTripLow, p.flight.roundTripHigh);
  const [hLow, hHigh] = ordered(p.lodging.hotelLow, p.lodging.hotelHigh);
  const [bLow, bHigh] = ordered(p.lodging.bnbLow, p.lodging.bnbHigh);
  return {
    flight: {
      roundTripLow: fLow,
      roundTripHigh: fHigh,
      outboundHours: nonNeg(p.flight.outboundHours),
      inboundHours: nonNeg(p.flight.inboundHours),
      direct: p.flight.direct,
      note: p.flight.note.trim(),
    },
    timeDifferenceHours: Math.round(p.timeDifferenceHours * 10) / 10,
    lodging: {
      hotelLow: hLow,
      hotelHigh: hHigh,
      bnbLow: bLow,
      bnbHigh: bHigh,
      cityTaxPerPersonPerNight: nonNeg(p.lodging.cityTaxPerPersonPerNight),
      note: p.lodging.note.trim(),
    },
    seasonNote: p.seasonNote.trim(),
  };
}
