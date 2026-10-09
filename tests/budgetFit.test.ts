import { describe, expect, it } from "vitest";
import { budgetPlan } from "@/lib/budget";
import { itemToOption, planBudgetFit, planUpgrades, type HotelChoiceLike } from "@/lib/budgetFit";
import { calculateQuote } from "@/lib/cost";
import type { HotelCandidate, TourCandidate, TripInput } from "@/types";
import { input, item, linearDay } from "./fixtures";

const hotel = (name: string, rate: number): HotelCandidate => ({
  name,
  grade: "",
  area: "",
  nearestStation: "",
  walkMinutes: 0,
  nightlyLow: rate,
  nightlyHigh: rate,
  priceBasis: "searched",
  koreanFriendly: false,
  koreanNote: "",
  highlights: "",
  mapUrl: "",
});
const days = [
  linearDay(1, [item("a", { name: "바나힐", entryFee: 60000 }), item("b", { name: "박물관", entryFee: 10000 }), item("m", { type: "meal", mealCost: 20000 })]),
  linearDay(2, [item("c", { name: "케이블카", entryFee: 30000 })]),
];
const base = (patch: Partial<TripInput> = {}) =>
  input({
    pricingMode: "fixed_price",
    targetMarginRate: 20,
    cardFeeRate: 0,
    contingencyRate: 0,
    tipPerPerson: 0,
    insurancePerPerson: 0,
    packageType: "land_hotel",
    nights: 2,
    lodgingRatePerNight: 100000,
    ...patch,
  });

function setup(i: TripInput) {
  const q = calculateQuote(i, days, {});
  if (!q.ok) throw new Error(q.error);
  return { q, plan: budgetPlan(i, q, q.groundDays)! };
}

describe("예산 맞추기 — 넘을 때", () => {
  it("모자라는 만큼을 한 번에 채우는 가장 작은 유료 체험을 선택 옵션으로", () => {
    // 1인 원가: 차량 100,000 + 가이드 50,000 = 150,000 × 2일 ÷ 4명 = 75,000, 숙박 100,000, 입장 100,000, 식사 20,000 → 295,000
    const i = base({ fixedPricePerPerson: 350000 }); // 예산 280,000 → 15,000 초과
    const { plan } = setup(i);
    const fit = planBudgetFit(i, days, {}, plan, [])!;
    expect(fit.deficit).toBe(15000);
    expect(fit.actions).toEqual([expect.objectContaining({ kind: "to-option", name: "케이블카", savingPerPerson: 30000 })]);
    expect(fit.enough).toBe(true);
  });

  it("체험만으로 모자라면 숙소를 한 단계 싼 후보로", () => {
    const i = base({ fixedPricePerPerson: 220000 }); // 예산 176,000 → 119,000 초과, 체험 전부 100,000
    const { plan } = setup(i);
    const choices: HotelChoiceLike[] = [
      { city: "다낭", candidates: [hotel("좋은", 100000), hotel("보통", 70000), hotel("싼", 40000)], picked: { hotel: hotel("좋은", 100000), rate: 100000 } },
    ];
    const fit = planBudgetFit(i, days, {}, plan, choices)!;
    const hotelAction = fit.actions.find((a) => a.kind === "hotel");
    expect(hotelAction).toMatchObject({ hotel: { name: "보통" }, savingPerPerson: 30000 }); // (100,000 − 70,000) × 2박 ÷ 2
    expect(fit.enough).toBe(true);
  });

  it("대표 일정(상품명·하이라이트)은 다른 방법을 다 쓴 뒤에만 뺀다", () => {
    const i = base({ fixedPricePerPerson: 350000 }); // 15,000 초과 — 보통이면 케이블카
    const { plan } = setup(i);
    const meta = { packageName: "다낭 3일", cities: [], noShopping: false, noOption: false, hotelGrade: "", highlights: ["케이블카 타고 바다 전망"] };
    const fit = planBudgetFit(i, days, {}, plan, [], meta)!;
    expect(fit.actions).toEqual([expect.objectContaining({ name: "바나힐", signature: false })]);
    // 대표 일정 말고는 모자라면 마지막에 대표 일정까지
    const tight = base({ fixedPricePerPerson: 170000 });
    const all = planBudgetFit(tight, days, {}, setup(tight).plan, [], meta)!;
    expect(all.actions.at(-1)).toMatchObject({ name: "케이블카", signature: true });
  });

  it("숙소를 낮춘 절감에도 예비비 비율을 같이 넣는다", () => {
    const i = base({ fixedPricePerPerson: 220000, contingencyRate: 10 });
    const { plan } = setup(i);
    const choices: HotelChoiceLike[] = [
      { city: "다낭", candidates: [hotel("좋은", 100000), hotel("보통", 70000)], picked: { hotel: hotel("좋은", 100000), rate: 100000 } },
    ];
    const hotelAction = planBudgetFit(i, days, {}, plan, choices)!.actions.find((a) => a.kind === "hotel");
    expect(hotelAction?.savingPerPerson).toBeCloseTo(33000); // 30,000 × 1.1
  });

  it("줄일 것이 모자라면 enough=false", () => {
    const i = base({ fixedPricePerPerson: 150000 });
    const { plan } = setup(i);
    expect(planBudgetFit(i, days, {}, plan, [])!.enough).toBe(false);
  });

  it("예산 안이면 null", () => {
    const i = base({ fixedPricePerPerson: 500000 });
    expect(planBudgetFit(i, days, {}, setup(i).plan, [])).toBeNull();
  });
});

describe("예산 맞추기 — 남을 때", () => {
  it("남은 금액 안에서 숙소 한 단계 위·추천 투어", () => {
    const i = base({ fixedPricePerPerson: 450000 }); // 예산 360,000 → 65,000 남음
    const { plan } = setup(i);
    const choices: HotelChoiceLike[] = [
      {
        city: "다낭",
        candidates: [hotel("지금", 100000), hotel("위", 150000), hotel("너무 비쌈", 300000)],
        picked: { hotel: hotel("지금", 100000), rate: 100000 },
      },
    ];
    const tour = { name: "야경 크루즈", priceLow: 30000, priceHigh: 30000 } as TourCandidate;
    const ups = planUpgrades(i, days, plan, choices, [tour], []);
    expect(ups.map((u) => (u.kind === "hotel" ? u.hotel.name : u.tour.name))).toEqual(["위", "야경 크루즈"]);
  });
});

it("일정 항목을 선택 옵션으로 옮기면 원가는 그 요금, 요금은 목표 마진 권장가", () => {
  const o = itemToOption(item("x", { name: "케이블카", entryFee: 30000, stayMinutes: 90 }), 2, { targetMarginRate: 20, cardFeeRate: 3, currency: "KRW" });
  expect(o).toMatchObject({ name: "케이블카", dayNo: 2, costPerPerson: 30000, pricePerPerson: 39000, durationMinutes: 90 });
});
