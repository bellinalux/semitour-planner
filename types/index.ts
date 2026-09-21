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
  hotel: boolean;
  flight: boolean;
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

/** 판매 구성: 랜드(현지 프로그램)만 / 랜드+숙박 / 항공까지 포함한 풀패키지 */
export type PackageType = "land" | "land_hotel" | "full";
/** 비용 확정도: 확정(입력값) / 추정(대략) / 미정(아직 모름 — 기본 가격에서 제외) */
export type Certainty = "confirmed" | "estimated" | "undecided";
/** 확정도를 지정하는 비용 항목 */
export type CostKey = "vehicle" | "guide" | "other" | "lodging" | "flight";
export type LodgingType = "hotel" | "bnb";
/** 호텔 등급: 전체(3~5성) / 3성 / 4성 / 5성 / 리조트 */
export type HotelGrade = "any" | "3" | "4" | "5" | "resort";
export type HotelPreference = "transit" | "airport" | "korean" | "breakfast" | "value";
/** target_margin: 목표 마진으로 판매가 계산 / fixed_price: 판매가를 넣고 마진 확인 */
export type PricingMode = "target_margin" | "fixed_price";

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

  packageType: PackageType;
  lodgingType: LodgingType;
  hotelGrade: HotelGrade;
  hotelPreferences: HotelPreference[];
  /** 호텔 찾기에서 고른 숙소 (없으면 null) */
  selectedHotel: SelectedHotel | null;
  /** 1실(호텔) 또는 1유닛(BnB)의 1박 요금 */
  lodgingRatePerNight: number;
  /** 1실/1유닛에 묵는 인원. 필요한 방 수 = ceil(인원 ÷ 이 값) */
  guestsPerUnit: number;
  /** BnB 청소비 (유닛당 1회) */
  cleaningFeePerUnit: number;
  /** 숙박세 (1인 1박) */
  cityTaxPerPersonPerNight: number;
  /** 왕복 항공료 (1인, 세금 포함) */
  flightPricePerPerson: number;
  costStatus: Record<CostKey, Certainty>;

  pricingMode: PricingMode;
  /** pricingMode === "fixed_price"일 때 1인 판매가 */
  fixedPricePerPerson: number;

  /** 1인당 비용 */
  tipPerPerson: number;
  insurancePerPerson: number;

  /** 비율 (%) — 마진율은 판매가 대비 */
  targetMarginRate: number;
  contingencyRate: number;
  cardFeeRate: number;

  competitors: Competitor[];

  /** 기본 견적 밖의 선택 옵션 */
  options: TourOption[];
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
  /** 참고 링크 (예: 투어 예약처 검색) */
  link?: string;
  /** 투어 카탈로그에서 추가한 항목 */
  fromCatalog?: boolean;
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
  /** 확정도. 항목이 확정도 대상이 아니면 없음 */
  status?: Certainty;
  /** 미정이라 기본 가격 계산에서 뺀 항목 */
  excluded?: boolean;
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
  packageType: PackageType;
  pricingMode: PricingMode;
  /** 필요한 숙소 수(방/유닛). 숙박이 없으면 0 */
  lodgingUnits: number;
  lines: CostLine[];
  /** 미정 항목(금액이 있는 것)을 포함했을 때의 시나리오. 미정 항목이 없으면 null */
  withUndecided: QuoteScenario | null;
  undecidedLabels: string[];
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

/** AI가 추정한 항공/숙박 시세 (실시간 요금이 아님) */
export interface TravelEstimate {
  flight: {
    roundTripLow: number;
    roundTripHigh: number;
    outboundHours: number;
    inboundHours: number;
    direct: boolean;
    note: string;
  };
  /** 도착지 − 출발지 시차 (시간) */
  timeDifferenceHours: number;
  lodging: {
    hotelLow: number;
    hotelHigh: number;
    bnbLow: number;
    bnbHigh: number;
    cityTaxPerPersonPerNight: number;
    note: string;
  };
  seasonNote: string;
}

/** 웹 검색으로 찾은 호텔 후보 */
export interface HotelCandidate {
  name: string;
  /** 등급 표기 (예: "4성급", "리조트") */
  grade: string;
  /** 구/지역 */
  area: string;
  nearestStation: string;
  /** 가까운 역까지 도보 분. 모르면 0 */
  walkMinutes: number;
  /** 1박 요금 범위 (견적 통화) */
  nightlyLow: number;
  nightlyHigh: number;
  /** searched: 검색에서 확인한 요금 / estimated: AI 추정 */
  priceBasis: "searched" | "estimated";
  /** 한국어 후기·기사 등에서 한국인 이용이 확인된 경우 */
  koreanFriendly: boolean;
  koreanNote: string;
  highlights: string;
  /** 구글 지도에서 검색하는 링크 */
  mapUrl: string;
}

export type SelectedHotel = Pick<
  HotelCandidate,
  "name" | "grade" | "area" | "nearestStation" | "walkMinutes" | "nightlyLow" | "nightlyHigh" | "priceBasis" | "mapUrl"
>;

/** 검색 결과의 출처 */
export interface SearchSource {
  title: string;
  url: string;
}

/** 지역 투어 카테고리 */
export type TourCategory = "city" | "night" | "museum" | "daytrip" | "cruise" | "cooking" | "show" | "activity";

/** 웹 검색으로 찾은 지역 투어 후보 */
export interface TourCandidate {
  name: string;
  category: TourCategory;
  description: string;
  /** 소요 시간(분). 모르면 0 */
  durationMinutes: number;
  /** 1인 요금 범위 (견적 통화) */
  priceLow: number;
  priceHigh: number;
  /** searched: 검색에서 확인한 요금 / estimated: AI 추정 */
  priceBasis: "searched" | "estimated";
  /** 요금에 포함되는 것 (입장권, 가이드, 식사 등) */
  includes: string;
  /** 예약 필요 여부, 집합 장소 등 */
  booking: string;
  /** 한국어 가이드나 한국어 후기가 확인된 경우 */
  koreanGuide: boolean;
  koreanNote: string;
  highlights: string;
  /** 예약처를 구글에서 검색하는 링크 */
  searchUrl: string;
}

/** 일정에 넣을 위치: am(오전), pm:A / pm:B(오후 코스), day(하루 종일 일정) */
export type TourSlot = "am" | "pm:A" | "pm:B" | "day";

/** 기본 견적 밖에서 고객이 고르는 선택 옵션 (선택관광) */
export interface TourOption {
  id: string;
  name: string;
  description: string;
  category?: TourCategory;
  /** 소요 시간(분). 모르면 0 */
  durationMinutes: number;
  /** 이 옵션을 진행하는 날 (DAY n). 0이면 날짜 미지정 */
  dayNo: number;
  /** 1인당 우리 원가 */
  costPerPerson: number;
  /** 고객에게 받는 1인 옵션 요금 */
  pricePerPerson: number;
  /** 이 인원 이상 신청해야 진행된다 */
  minParticipants: number;
  /** 전체 인원 중 신청할 것으로 예상하는 비율 (%) */
  participationRate: number;
  link?: string;
  note: string;
}
