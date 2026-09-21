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
