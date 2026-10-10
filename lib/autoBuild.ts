import { budgetPlan } from "@/lib/budget";
import { midpoint } from "@/lib/travelEstimate";
import type { CostSource, HotelCandidate, SelectedHotel, TourCandidate, TripInput } from "@/types";

/**
 * 자동 구성에서 쓰는 고르기 규칙 — 인원별 차종, 예산 안의 숙소, 예산 안의 추천 투어.
 * AI는 후보를 찾아 오고, 무엇을 넣을지는 여기 규칙으로 정한다(늘 같은 결과, 테스트 가능).
 */

/** 인원별 일반적인 전용 차량 (여행사 지상 수배 기준) */
const VEHICLES: { max: number; label: string }[] = [
  { max: 3, label: "승용차·SUV (4인승)" },
  { max: 6, label: "7인승 SUV·MPV" },
  { max: 12, label: "미니밴 (15~16인승)" },
  { max: 25, label: "중형버스 (25~29인승)" },
  { max: Infinity, label: "대형버스 (45인승)" },
];

export function vehicleClassFor(travelers: number): string {
  const n = Math.max(1, Math.round(travelers));
  return VEHICLES.find((v) => n <= v.max)!.label;
}

/** 숙소를 찾을 지역 — 일정의 숙박 도시들(2곳 이상이면 도시마다), 아니면 여행지 하나 */
export function hotelCities(input: Pick<TripInput, "destination">, stays: { city: string; nights: number }[]): string[] {
  const cities = stays.map((s) => s.city.trim()).filter(Boolean);
  return cities.length >= 2 ? [...new Set(cities)] : [input.destination.trim()].filter(Boolean);
}

export interface HotelPick {
  hotel: HotelCandidate;
  /** 1실 1박 요금 (요금 범위의 가운데) */
  rate: number;
  /** 예산 상한을 넘는 후보밖에 없어 가장 싼 곳을 고른 경우 */
  overBudget: boolean;
}

/**
 * 후보 중 하나를 고른다.
 *  - 상한(1실 1박)이 있으면 그 안에서: 검색으로 요금을 확인한 곳 → 한국인 이용 확인 → 상한에 가까운(가장 좋은) 순
 *  - 상한 안에 없으면 가장 싼 곳(예산 초과 표시)
 *  - 상한이 없으면 요금이 가운데쯤인 곳
 */
export function pickHotel(candidates: HotelCandidate[], capPerNight: number | null): HotelPick | null {
  const priced = candidates.filter((h) => h.nightlyLow > 0 || h.nightlyHigh > 0).map((hotel) => ({ hotel, rate: midpoint(hotel.nightlyLow, hotel.nightlyHigh) }));
  if (priced.length === 0) return null;
  // 요금 확인(+2)·한국인 이용(+1)·국내 여행사 패키지 사용(+1, 2곳 이상 +2)·회사 요금표 근거(+1)
  const score = (p: { hotel: HotelCandidate; rate: number }) =>
    (p.hotel.priceBasis === "searched" ? 2 : 0) + (p.hotel.koreanFriendly ? 1 : 0) + Math.min(2, p.hotel.agencies?.length ?? 0) + (p.hotel.rateBasis ? 1 : 0);
  if (capPerNight !== null && capPerNight > 0) {
    const within = priced.filter((p) => p.rate <= capPerNight);
    if (within.length === 0) {
      const cheapest = [...priced].sort((a, b) => a.rate - b.rate)[0];
      return { ...cheapest, overBudget: true };
    }
    const best = [...within].sort((a, b) => score(b) - score(a) || b.rate - a.rate)[0];
    return { ...best, overBudget: false };
  }
  const byRate = [...priced].sort((a, b) => a.rate - b.rate);
  const middle = byRate[Math.floor((byRate.length - 1) / 2)];
  const sameBand = byRate.filter((p) => Math.abs(p.rate - middle.rate) <= middle.rate * 0.15);
  return { ...[...sameBand].sort((a, b) => score(b) - score(a))[0], overBudget: false };
}

export function toSelectedHotel(hotel: HotelCandidate): SelectedHotel {
  const { name, grade, area, nearestStation, walkMinutes, nightlyLow, nightlyHigh, priceBasis, mapUrl } = hotel;
  return { name, grade, area, nearestStation, walkMinutes, nightlyLow, nightlyHigh, priceBasis, mapUrl };
}

/** 고른 숙소를 견적에 넣는 패치 (도시가 여럿이면 도시별 요금, 하나면 기본 1박 요금) */
export function hotelPatch(input: TripInput, picks: Record<string, HotelPick>, multiCity: boolean): Partial<TripInput> {
  const entries = Object.entries(picks);
  if (entries.length === 0) return {};
  const at = new Date().toISOString();
  const selectedHotels = { ...input.selectedHotels };
  const lodgingCityRates = { ...input.lodgingCityRates };
  for (const [city, pick] of entries) {
    selectedHotels[city] = toSelectedHotel(pick.hotel);
    if (multiCity) lodgingCityRates[city] = pick.rate;
  }
  const first = entries[0][1];
  const source: CostSource = { kind: "hotel", at, note: entries.map(([, p]) => p.hotel.name).join(", ").slice(0, 80) };
  return {
    selectedHotels,
    ...(multiCity ? { lodgingCityRates } : { lodgingRatePerNight: first.rate }),
    costStatus: { ...input.costStatus, lodging: "estimated" },
    costSource: { ...input.costSource, lodging: source },
  };
}

/** 숙박 요금을 사람이 이미 정했는지 (그러면 자동 구성이 숙소를 바꾸지 않는다) */
export const lodgingDecided = (input: TripInput) =>
  input.costStatus.lodging === "confirmed" && (input.lodgingRatePerNight > 0 || Object.values(input.lodgingCityRates).some((v) => v > 0));

/**
 * 추천 투어 — 요금이 확인된 것 중, 예산이 있으면 1인 남은 입장·투어 예산 안의 것만, 평점·검색 확인 순으로 최대 3개.
 * remaining이 null이면(원가에서 시작) 가격 제한 없이 고른다.
 */
export function pickTours(tours: TourCandidate[], remainingPerPerson: number | null, max = 3): TourCandidate[] {
  const priced = tours.filter((t) => t.priceLow > 0 || t.priceHigh > 0);
  const within = remainingPerPerson === null ? priced : priced.filter((t) => midpoint(t.priceLow, t.priceHigh) <= remainingPerPerson);
  const score = (t: TourCandidate) => (t.priceBasis === "market" ? 3 : t.priceBasis === "searched" ? 2 : 0) + (t.koreanGuide ? 1 : 0) + (t.market?.rating ?? 0) / 5;
  return [...within].sort((a, b) => score(b) - score(a)).slice(0, max);
}

/**
 * 코스를 만들 때 AI에 건네는 예산 안내 (판매가·도매가에서 시작한 견적만).
 * 입장·체험 합계와 식사 1끼 수준을 알려 주어, 예산 안의 명소·식당을 고르게 한다.
 */
export function itineraryBudgetNote(input: TripInput): string {
  const plan = budgetPlan(input, null);
  if (!plan) return "";
  const meals = Math.max(1, input.days * 2);
  const unit = input.currency === "KRW" ? 1000 : 1;
  const round = (v: number) => Math.max(0, Math.floor(v / unit) * unit);
  return `1인 유료 입장·체험료 합계 ${round(plan.caps.admissionPerPerson)} ${input.currency} 이내(무료 명소·외관 관람을 섞어 맞춤), 식사는 1인 1끼 약 ${round(plan.caps.mealPerPerson / meals)} ${input.currency} 수준`;
}
