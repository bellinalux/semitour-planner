import { z } from "zod";

const CURRENCIES = ["KRW", "USD", "EUR", "JPY", "GBP", "CNY", "THB", "VND", "SGD", "AUD"] as const;
const CATEGORY_IDS = ["city", "night", "museum", "daytrip", "cruise", "cooking", "show", "activity"] as const;

/** 항공 시세 조회 요청 */
export const flightRequestSchema = z.object({
  /** 출발지: 도시 이름(한글 가능) 또는 IATA 코드 */
  origin: z.string().trim().min(1, "출발지를 입력해 주세요.").max(60),
  destination: z.string().trim().min(1, "여행지를 입력해 주세요.").max(100),
  /** 총 여행 일수. 귀국일 − 출발일은 이 값 − 1일로 조회한다 */
  days: z.number().int().min(2, "왕복 항공은 여행 일수가 2일 이상이어야 합니다.").max(30, "여행 일수는 30일 이하로 입력해 주세요."),
  currency: z.enum(CURRENCIES),
  /** 오늘부터 몇 개월 뒤까지 찾을지 */
  months: z.number().int().min(1).max(6).default(4),
});

export type FlightRequest = z.infer<typeof flightRequestSchema>;

/** Viator 판매 상품 조회 요청 */
export const viatorRequestSchema = z.object({
  destination: z.string().trim().min(1, "여행지를 입력해 주세요.").max(100),
  categories: z.array(z.enum(CATEGORY_IDS)).min(1, "투어 종류를 하나 이상 선택해 주세요.").max(8),
  currency: z.enum(CURRENCIES),
});

export type ViatorRequest = z.infer<typeof viatorRequestSchema>;

/** 입장료·체험료 웹 확인 요청 */
export const verifyFeesRequestSchema = z.object({
  destination: z.string().trim().min(1, "여행지를 입력해 주세요.").max(100),
  currency: z.enum(CURRENCIES),
  /** 1 견적통화 = ? KRW (견적 통화가 원화면 무시) */
  exchangeRateToKrw: z.number().min(0).max(1_000_000).default(0),
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(60),
        name: z.string().trim().min(1).max(120),
        /** 그 항목이 속한 숙박 도시 (여러 도시를 도는 코스에서 같은 이름의 장소를 구분하는 데 쓴다) */
        city: z.string().trim().max(60).optional(),
      }),
    )
    .min(1, "확인할 항목이 없습니다.")
    .max(40, "한 번에 40개까지 확인할 수 있습니다."),
});

export type VerifyFeesRequest = z.infer<typeof verifyFeesRequestSchema>;

/** 확인 결과 한 건 (클라이언트로 내려가는 형태) */
export interface FeeCheckResult {
  id: string;
  status: "confirmed" | "free" | "unverified";
  /** 현지 통화(ISO 4217)와 1인 금액. unverified면 0 */
  localCurrency: string;
  localAmount: number;
  /** 견적 통화로 환산한 1인 금액. 환산하지 못하면 null */
  amountInQuote: number | null;
  sourceName: string;
  note: string;
  /** 웹에서 확인한 통상적인 체류·관람 시간(분). 확인하지 못했으면 0 */
  recommendedStayMinutes: number;
}

export interface VerifyFeesResponse {
  results: FeeCheckResult[];
  sources: { title: string; url: string }[];
  searched: boolean;
  checkedAt: string;
  /** 환산에 쓴 환율 (1 단위 = ? 원) */
  fx: { currency: string; krwPerUnit: number; updatedAt: string }[];
}
