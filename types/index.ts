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
export type PlannerMode = "ai" | "paste";

export interface TripInput {
  /** ai: AI가 세미투어를 생성 / paste: 업체가 쓴 코스를 붙여넣어 구조화 */
  mode: PlannerMode;
  /** 붙여넣은 코스 원문 (mode === "paste") */
  courseText: string;

  destination: string;
  /** 출발지 (항공 이동일 표시용) */
  originCity: string;
  /** 총 일수 (항공 이동일 포함) */
  days: number;
  /** 숙박 수. "4박 6일"처럼 일수와 별개다 (귀국 항공이 심야/기내 숙박이면 일수 − 2) */
  nights: number;
  /** true면 첫날/마지막 날을 항공 이동일로 두고 그 사이만 AI가 관광 일정을 만든다 */
  includesFlights: boolean;
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
  /** 차량·가이드가 실제로 붙는 일수. 0이면 일정에서 자동 계산 */
  groundDaysOverride: number;

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

export type ItemType =
  | "flight"
  | "transfer"
  | "hotel"
  | "sightseeing"
  | "experience"
  | "meal"
  | "massage"
  | "shopping"
  | "free_time";

/** 입장 여부: 입장(enter) / 외부 조망만(view_only) / 입장 개념 없음(none) / 불명(unknown) */
export type Admission = "enter" | "view_only" | "none" | "unknown";

export interface ItineraryItem {
  id: string;
  /** 항목 유형. 없으면 관광(sightseeing)으로 본다 (AI 세미투어 항목) */
  type?: ItemType;
  admission?: Admission;
  /** 원문에 적힌 소요 시간 표기 (예: "약 30~40분") */
  timeNote?: string;
  name: string;
  description: string;
  /** 예상 체류 시간(분). 0이면 알 수 없음 */
  stayMinutes: number;
  /** 다음 장소까지 이동 시간(분). 모르면 null (마지막 장소 여부는 목록 위치로 판단한다) */
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
  /** semi: 오전 가이드 + 오후 반자유(A/B) / linear: 하루 전체를 순서대로 나열 (업체 코스, 이동일) */
  kind: "semi" | "linear";
  /** 그날 밤 숙박 도시. 숙박이 없으면(기내, 귀국일) 빈 값 */
  overnightCity?: string;
  /** 오전: 가이드 투어 (kind === "semi") */
  amGuided: ItineraryItem[];
  /** 오후: 반자유 일정 (kind === "semi", 고객이 고르는 추천 코스 A/B) */
  pmFreeOptions: PmFreeOption[];
  /** 하루 전체 일정 (kind === "linear") */
  items: ItineraryItem[];
}

/** 붙여넣은 코스에서 읽은 상품 정보 */
export interface CourseMeta {
  packageName: string;
  cities: string[];
  /** 원문이 "노쇼핑"/"노옵션"이라고 명시한 경우에만 true */
  noShopping: boolean;
  noOption: boolean;
  hotelGrade: string;
  highlights: string[];
}

export interface UspItem {
  title: string;
  reason: string;
}

/** ---- 견적 계산 결과 (lib/cost.ts) ---- */

export interface CostLine {
  key: string;
  label: string;
  amount: number;
  /** 계산 근거 (예: "3일 × 300,000") */
  note?: string;
}

/** 특정 인원수에서의 원가·판매가 시나리오 */
export interface QuoteScenario {
  travelers: number;
  /** 총 원가 (카드 수수료 제외) */
  baseCost: number;
  costPerPerson: number;
  cardFee: number;
  profit: number;
  totalPrice: number;
  pricePerPerson: number;
  /** 가격 올림 후 실제 마진율 (%, 판매가 대비, 카드 수수료 차감 후) */
  actualMarginRate: number;
}

export interface QuoteData {
  ok: true;
  travelers: number;
  /** 차량·가이드 비용을 계산한 일수 */
  groundDays: number;
  lines: CostLine[];
  scenario: QuoteScenario;
  matrix: QuoteScenario[];
  /** 권장가로 팔 때 손실이 없는 최소 출발 인원 (달성 불가면 null) */
  breakEvenTravelers: number | null;
  /** 권장가로 팔 때 목표 마진을 달성하는 최소 출발 인원 (달성 불가면 null) */
  targetMarginTravelers: number | null;
  /** 우리 상품의 포함 항목 (입력 비용과 일정에서 유추) */
  ourIncludes: CompetitorIncludes;
  warnings: string[];
}

export type QuoteResult = QuoteData | { ok: false; error: string };
