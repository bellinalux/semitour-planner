export type CurrencyCode =
  | "KRW"
  | "USD"
  | "EUR"
  | "JPY"
  | "GBP"
  | "CNY"
  | "THB"
  | "VND"
  | "SGD"
  | "AUD";

export type ThemeId =
  | "history"
  | "food"
  | "nature"
  | "shopping"
  | "photo"
  | "activity"
  | "local";

export interface CompetitorIncludes {
  guide: boolean;
  meals: boolean;
  admission: boolean;
  vehicle: boolean;
}

export interface Competitor {
  id: string;
  name: string;
  /** 1인 판매가 (견적 통화 기준) */
  price: number;
  includes: CompetitorIncludes;
  note: string;
}

/** 좌측 입력 폼의 전체 상태 */
export interface TripInput {
  destination: string;
  days: number;
  travelers: number;
  themes: ThemeId[];
  notes: string;

  currency: CurrencyCode;
  /** 1 견적통화 = ? KRW (KRW 선택 시 사용하지 않음) */
  exchangeRateToKrw: number;

  /** 고정비 */
  vehicleCostPerDay: number;
  guideCostPerDay: number;
  otherFixedCost: number;

  /** 1인당 비용 */
  tipPerPerson: number;
  insurancePerPerson: number;

  /** 비율 (%) — 마진율은 판매가 대비 */
  targetMarginRate: number;
  contingencyRate: number;
  cardFeeRate: number;

  competitors: Competitor[];
}

export type RequestStatus = "idle" | "loading" | "error" | "success";

export interface AsyncState {
  status: RequestStatus;
  error?: string;
}

/** ---- AI 일정 결과 (Step 2에서 API 응답 검증에 사용) ---- */

export interface ItineraryItem {
  id: string;
  name: string;
  description: string;
  /** 예상 체류 시간(분) */
  stayMinutes: number;
  /** 다음 장소까지 이동 시간(분), 마지막 장소는 null */
  travelMinutesToNext: number | null;
  entryFee: number;
  mealCost: number;
  /** AI가 추정한 비용/시간이면 true — UI에서 "AI 추정" 뱃지 표시 */
  isEstimated: boolean;
  /** 휴관일/영업시간 등 확인 필요 사항 */
  caution?: string;
}

export interface PmFreeOption {
  id: "A" | "B";
  title: string;
  items: ItineraryItem[];
}

export interface DayPlan {
  day: number;
  theme: string;
  /** 오전: 가이드 투어 */
  amGuided: ItineraryItem[];
  /** 오후: 반자유 일정 (고객이 고르는 추천 코스 A/B) */
  pmFreeOptions: PmFreeOption[];
}

export interface UspItem {
  title: string;
  reason: string;
}
