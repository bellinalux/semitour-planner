import { z } from "zod";

const CURRENCIES = ["KRW", "USD", "EUR", "JPY", "GBP", "CNY", "THB", "VND", "SGD", "AUD"] as const;

/** 현지 차량·가이드 1일 요금 추정 요청 */
export const groundCostRequestSchema = z.object({
  destination: z.string().trim().min(1, "여행지를 입력해 주세요.").max(100),
  travelers: z.number().int().min(1).max(60),
  currency: z.enum(CURRENCIES),
  tripScope: z.enum(["domestic", "overseas"]).default("overseas"),
  /** 인원에 맞는 차종 (예: "미니밴 (15~16인승)"). 비우면 AI가 인원으로 판단 */
  vehicleClass: z.string().trim().max(40).default(""),
  /** 여행 일수 — 여행자보험 기간 */
  days: z.number().int().min(1).max(60).default(4),
});

export type GroundCostRequest = z.infer<typeof groundCostRequestSchema>;

export const groundCostResultSchema = z.object({
  vehicleCostPerDay: z.number().describe("인원에 맞는 전용 차량(기사 포함) 1일 대절 요금, 요청 통화 단위. 모르면 0"),
  vehicleNote: z.string().describe("차종·시간·포함 조건 한 줄 (예: 16인승 10시간, 유류비·기사 포함). 없으면 빈 문자열"),
  guideCostPerDay: z.number().describe("가이드 1일 요금(국내투어면 외국어 가이드, 해외면 한국어 가이드), 요청 통화 단위. 모르면 0"),
  guideNote: z.string().describe("가이드 조건 한 줄 (예: 한국어 가이드 8시간). 없으면 빈 문자열"),
  tipPerPersonPerDay: z.number().describe("가이드·기사 팁(가이드 경비)의 관례 금액, 여행자 1인 1일 기준, 요청 통화. 팁 문화가 없거나 모르면 0"),
  tipNote: z.string().describe("팁 근거 한 줄 (예: 한국 여행사 마카오 상품 가이드·기사 경비 1인 1일 10달러). 없으면 빈 문자열"),
  insurancePerPerson: z.number().describe("여행 기간 해외(국내투어면 국내) 여행자보험 1인 보험료(기본형), 요청 통화. 모르면 0"),
  insuranceNote: z.string().describe("보험료 근거 한 줄. 없으면 빈 문자열"),
});

export type GroundCostResult = z.infer<typeof groundCostResultSchema>;

export interface GroundCostResponse extends GroundCostResult {
  /** 웹 검색 근거로 확인했는지. false면 AI 추정이라 반드시 확인해야 한다 */
  searched: boolean;
  sources: { title: string; url: string }[];
}
