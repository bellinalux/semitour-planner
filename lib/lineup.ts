import { mapDayItems, type PmChoice } from "@/lib/itinerary";
import { gradeText } from "@/lib/itemTypes";
import { inputWithGrade, salePrice } from "@/lib/priceLevers";
import { gradeMatches, hotelScore, pickRate, type CityRates } from "@/lib/rateBook";
import type { DayPlan, HotelGrade, TripInput } from "@/types";

/**
 * 상품 등급 라인업 — 같은 코스로 실속·스탠다드·프리미엄을 만들어 판매가를 나란히 본다 (패키지 판매의 기본 구성).
 *  - 호텔: 실속 한 단계 아래 · 프리미엄 한 단계 위 (회사 요금표에 그 등급 요금이 있으면 그 평균, 없으면 지금 요금에서 어림)
 *  - 식사: 실속 식대 80% · 프리미엄 140%(특식)
 *  - 선택관광: 프리미엄은 가장 비싼 선택관광 1개를 포함
 * 지금 입력이 스탠다드다.
 */

export type TierKey = "basic" | "standard" | "premium";
const TIERS: { key: TierKey; label: string; step: number; meal: number; includeOptions: number }[] = [
  { key: "basic", label: "실속", step: -1, meal: 0.8, includeOptions: 0 },
  { key: "standard", label: "스탠다드", step: 0, meal: 1, includeOptions: 0 },
  { key: "premium", label: "프리미엄", step: 1, meal: 1.4, includeOptions: 1 },
];
const STEPS: HotelGrade[] = ["3", "3-4", "4", "4-5", "5"];

export interface Tier {
  key: TierKey;
  label: string;
  grade: HotelGrade;
  gradeLabel: string;
  ratePerNight: number;
  rateBasis: string;
  hotels: string[];
  mealNote: string;
  included: string[];
  salePrice: number | null;
  diff: number | null;
  /** 이 등급으로 바꿀 입력·일정 */
  input: TripInput;
  days: DayPlan[];
}

function shiftGrade(g: HotelGrade, step: number): HotelGrade {
  const i = STEPS.indexOf(g);
  if (i < 0) return g;
  return STEPS[Math.max(0, Math.min(STEPS.length - 1, i + step * 2))];
}

export function lineup(input: TripInput, days: DayPlan[], pmChoice: PmChoice, book: CityRates | null): Tier[] {
  const hasHotel = input.packageType !== "land" && input.lodgingType === "hotel" && input.nights > 0 && input.lodgingRatePerNight > 0;
  const multiCity = Object.keys(input.lodgingCityRates ?? {}).length > 1;
  const tiers = TIERS.map((t) => {
    const grade = hasHotel ? shiftGrade(input.hotelGrade, t.step) : input.hotelGrade;
    let next: TripInput = hasHotel && grade !== input.hotelGrade ? inputWithGrade(input, grade) : { ...input };
    let rateBasis = hasHotel ? (grade === input.hotelGrade ? "지금 견적" : "지금 요금에서 등급 차이로 어림") : "";
    let hotels: string[] = [];
    // 회사 요금표에 그 등급 호텔 요금이 살아 있으면 그 평균 (도시가 하나일 때)
    if (hasHotel && book && !multiCity && grade !== input.hotelGrade) {
      const cards = book.hotels
        .filter((h) => gradeMatches(h.grade, grade))
        .map((h) => ({ h, p: pickRate(h.rates, input.currency, Number(input.departureDate.slice(5, 7)) || 0) }))
        .filter((x) => x.p !== null)
        .sort((a, b) => hotelScore(b.h) - hotelScore(a.h));
      if (cards.length > 0) {
        const mid = Math.round(cards.reduce((s, x) => s + x.p!.mid, 0) / cards.length);
        next = { ...next, lodgingRatePerNight: mid };
        rateBasis = `회사 요금표 ${cards.length}곳 평균`;
        hotels = cards.slice(0, 2).map((x) => x.h.name);
      }
    }
    // 식사
    const nextDays = t.meal === 1 ? days : days.map((d) => mapDayItems(d, (it) => (it.type === "meal" && it.payment !== "local" && it.mealCost > 0 ? { ...it, mealCost: Math.round((it.mealCost * t.meal) / 100) * 100 } : it)));
    // 선택관광 포함 (가장 비싼 것부터)
    const included: string[] = [];
    if (t.includeOptions > 0 && input.options.length > 0) {
      const top = [...input.options].sort((a, b) => b.pricePerPerson - a.pricePerPerson).slice(0, t.includeOptions);
      const travelers = Math.max(1, Math.round(input.travelers));
      next = {
        ...next,
        otherFixedCost: next.otherFixedCost + top.reduce((s, o) => s + o.costPerPerson * travelers, 0),
        options: next.options.filter((o) => !top.includes(o)),
      };
      included.push(...top.map((o) => o.name));
    }
    const price = salePrice(next, nextDays, pmChoice);
    return {
      key: t.key,
      label: t.label,
      grade,
      gradeLabel: hasHotel ? gradeText(grade) : "",
      ratePerNight: next.lodgingRatePerNight,
      rateBasis,
      hotels,
      mealNote: t.meal === 1 ? "지금 식사" : t.meal < 1 ? "현지식 위주 (식대 80%)" : "특식 포함 (식대 140%)",
      included,
      salePrice: price,
      diff: null as number | null,
      input: next,
      days: nextDays,
    };
  });
  const base = tiers.find((t) => t.key === "standard")?.salePrice ?? null;
  return tiers.map((t) => ({ ...t, diff: base !== null && t.salePrice !== null ? t.salePrice - base : null }));
}
