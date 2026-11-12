import { z } from "zod";

const CURRENCIES = ["KRW", "USD", "EUR", "JPY", "GBP", "CNY", "THB", "VND", "SGD", "AUD"] as const;
export const TIER_IDS = ["car", "suv", "van", "midbus", "bus"] as const;

/** [전세버스·가이드 조회] 요청 — 예상 인원으로 차종·대수·가이드 수를 정하고 요금을 찾는다 */
export const groundLookupRequestSchema = z.object({
  destination: z.string().trim().min(1, "여행지를 입력해 주세요.").max(100),
  travelers: z.number().int().min(1).max(200),
  currency: z.enum(CURRENCIES),
  tripScope: z.enum(["domestic", "overseas"]).default("overseas"),
  /** 출발 달 (1~12, 모르면 0) — 요금표 업체 견적가 시즌 비교 */
  month: z.number().int().min(0).max(12).default(0),
  guideCapacity: z.number().int().min(1).max(200).default(45),
  /** 요금표에 값이 있어도 웹에서 새로 찾기 */
  refresh: z.boolean().default(false),
});
export type GroundLookupRequest = z.infer<typeof groundLookupRequestSchema>;

const range = (what: string) =>
  z.object({
    low: z.number().describe(`${what} 낮은 쪽 요금(요청 통화). 모르면 0`),
    typical: z.number().describe(`${what} 보통 요금(요청 통화). 모르면 0`),
    high: z.number().describe(`${what} 높은 쪽 요금(요청 통화). 모르면 0`),
  });

/** 웹 조사 메모 → 차종별 1대 1일 대절료 범위와 가이드 1명 1일 요금 범위 */
export const groundTierResearchSchema = z.object({
  car: range("승용차·SUV(4인승) 기사 포함 1대 1일 대절"),
  suv: range("7인승 SUV·MPV 기사 포함 1대 1일 대절"),
  van: range("미니밴(15~16인승) 기사 포함 1대 1일 대절"),
  midbus: range("중형버스(25~29인승) 기사 포함 1대 1일 대절"),
  bus: range("대형버스(45인승) 기사 포함 1대 1일 대절"),
  vehicleConditions: z.string().describe("차량 요금 조건 한 줄 (예: 10시간·유류비·기사 포함, 주차·통행료 별도). 없으면 빈 문자열"),
  guide: range("가이드 1명 1일(약 8시간)"),
  guideConditions: z.string().describe("가이드 조건 한 줄 (예: 한국어 가이드 8시간, 식사·숙박 별도). 없으면 빈 문자열"),
});
export type GroundTierResearch = z.infer<typeof groundTierResearchSchema>;

export type RateSource = "book-supplier" | "book-web" | "web" | "none";

export interface RateRange {
  low: number;
  mid: number;
  high: number;
  source: RateSource;
  /** 근거 한 줄 (예: "3주 전 ○○랜드사 견적가", "웹 시세") */
  basis: string;
}

export interface GroundLookupResponse {
  travelers: number;
  plan: { tier: (typeof TIER_IDS)[number]; tierLabel: string; count: number; guides: number; label: string };
  /** 차종별 1대 1일 요금 */
  tiers: Record<(typeof TIER_IDS)[number], RateRange>;
  guide: RateRange & { label: string };
  vehicleConditions: string;
  guideConditions: string;
  /** 웹 검색 근거로 확인했는지 (요금표만 썼으면 false여도 된다) */
  searched: boolean;
  usedWeb: boolean;
  sources: { title: string; url: string }[];
}
