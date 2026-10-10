import { z } from "zod";

/** 여행 정보 — 일정표 「여행 정보」 칸 (시차·전압·통화·비자·긴급 연락처·날씨) */
export const travelInfoRequestSchema = z.object({
  destination: z.string().trim().min(1).max(100),
  /** 출발 달 "2026-11" (날씨용, 모르면 빈 문자열) */
  month: z.string().regex(/^(\d{4}-\d{2})?$/).default(""),
});
export type TravelInfoRequest = z.infer<typeof travelInfoRequestSchema>;

export const travelInfoResultSchema = z.object({
  timeDifference: z.string().describe("한국과 시차 한 줄 (예: 한국보다 1시간 느림). 모르면 빈 문자열"),
  voltage: z.string().describe("전압·플러그 한 줄 (예: 220V, G타입 — 멀티어댑터 필요). 모르면 빈 문자열"),
  currency: z.string().describe("통화·결제 한 줄 (예: 파타카(MOP), 홍콩달러 통용, 카드 대부분 가능). 모르면 빈 문자열"),
  visa: z.string().describe("한국 여권 기준 입국 조건 한 줄 (예: 90일 무비자, 여권 유효기간 6개월 이상). 모르면 빈 문자열"),
  emergency: z.string().describe("현지 긴급 전화번호 한 줄 (예: 경찰·구급 999). 모르면 빈 문자열"),
  embassy: z.string().describe("관할 한국 대사관·총영사관 이름과 대표·긴급 전화 한 줄. 모르면 빈 문자열"),
  weather: z.string().describe("요청한 달의 날씨·옷차림 한 줄. 달을 모르면 빈 문자열"),
});
export type TravelInfo = z.infer<typeof travelInfoResultSchema> & { searched: boolean };
