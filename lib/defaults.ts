import type { Competitor, ThemeId, TravelType, TripInput } from "@/types";

export const THEMES: { id: ThemeId; label: string }[] = [
  { id: "history", label: "역사·문화" },
  { id: "food", label: "맛집·미식" },
  { id: "nature", label: "자연·경관" },
  { id: "shopping", label: "쇼핑" },
  { id: "photo", label: "사진 명소" },
  { id: "activity", label: "액티비티" },
  { id: "local", label: "로컬 체험" },
];

/**
 * 여행 유형. package·honeymoon·senior·accessible은 일정 생성 전에 웹 검색으로 유형별 특징(대표 코스,
 * 로맨틱 스팟, 무리 없는 동선, 이용 편의시설 등)을 조사해 일정에 반영한다(semi는 기존 방식 그대로).
 */
export const TRAVEL_TYPES: { id: TravelType; label: string; hint: string }[] = [
  { id: "semi", label: "세미투어", hint: "오전 가이드 + 오후 반자유 일정 (기본)" },
  { id: "package", label: "패키지투어", hint: "대형 여행사 공통 필수 코스 중심" },
  { id: "honeymoon", label: "신혼여행", hint: "로맨틱한 명소·커플 액티비티 중심" },
  { id: "senior", label: "시니어투어", hint: "무리 없는 동선, 효도관광 인기 코스" },
  { id: "accessible", label: "장애인투어", hint: "휠체어 이용 편의시설(화장실·엘리베이터·경사로) 확인" },
];

export const MAX_COMPETITORS = 5;

export const DEFAULT_INPUT: TripInput = {
  mode: "ai",
  courseText: "",

  destination: "",
  originCity: "인천",
  days: 3,
  nights: 2,
  includesFlights: false,
  travelers: 6,
  themes: [],
  notes: "",
  travelType: "semi",

  currency: "KRW",
  exchangeRateToKrw: 1,

  vehicleCostPerDay: 0,
  guideCostPerDay: 0,
  otherFixedCost: 0,
  groundDaysOverride: 0,

  packageType: "land",
  lodgingType: "hotel",
  hotelGrade: "any",
  hotelPreferences: [],
  selectedHotel: null,
  lodgingRatePerNight: 0,
  lodgingCityRates: {},
  guestsPerUnit: 2,
  cleaningFeePerUnit: 0,
  cityTaxPerPersonPerNight: 0,
  flightPricePerPerson: 0,
  costStatus: {
    vehicle: "confirmed",
    guide: "confirmed",
    other: "confirmed",
    lodging: "confirmed",
    flight: "confirmed",
  },

  pricingMode: "target_margin",
  fixedPricePerPerson: 0,

  tipPerPerson: 0,
  insurancePerPerson: 0,

  targetMarginRate: 25,
  contingencyRate: 5,
  cardFeeRate: 3,

  competitors: [],

  options: [],

  minTravelers: 0,
  departureDate: "",
  customerName: "",
  travelerNames: [],
  travelAlert: null,
  pickupNote: "",
  sendingNote: "",
  breakfastIncluded: true,
};

export function createCompetitor(): Competitor {
  return {
    id: crypto.randomUUID(),
    name: "",
    price: 0,
    includes: { guide: false, meals: false, admission: false, vehicle: false, hotel: false, flight: false },
    shopping: "unknown",
    optionTour: "unknown",
    note: "",
  };
}
