import type { Competitor, ThemeId, TripInput } from "@/types";

export const THEMES: { id: ThemeId; label: string }[] = [
  { id: "history", label: "역사·문화" },
  { id: "food", label: "맛집·미식" },
  { id: "nature", label: "자연·경관" },
  { id: "shopping", label: "쇼핑" },
  { id: "photo", label: "사진 명소" },
  { id: "activity", label: "액티비티" },
  { id: "local", label: "로컬 체험" },
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
  travelAlert: null,
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
