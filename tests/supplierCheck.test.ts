import { describe, expect, it } from "vitest";
import { calculateQuote } from "@/lib/cost";
import { toSupplierQuote } from "@/lib/schemas/course";
import { supplierAfterCuts, supplierCuts, supplierTarget } from "@/lib/supplierCheck";
import { conversionRate, quotePriceFor, supplierQuotePatch, toAppQuote } from "@/lib/supplierQuote";
import type { Competitor, TripInput } from "@/types";
import { input, item, linearDay } from "./fixtures";

const days = [
  linearDay(1, [
    item("a", { name: "바나힐", entryFee: 60000 }),
    item("b", { name: "코코넛 배", type: "experience", entryFee: 15000 }),
    item("m1", { name: "점심", type: "meal", mealCost: 15000 }),
  ]),
  linearDay(2, [
    item("c", { name: "오행산", entryFee: 10000 }),
    item("m2", { name: "랍스터 디너", type: "meal", mealCost: 60000 }),
    item("m3", { name: "저녁", type: "meal", mealCost: 15000 }),
    item("x", { name: "현지 지불 마사지", type: "massage", entryFee: 30000, payment: "local" }),
  ]),
];

const base = (patch: Partial<TripInput> = {}) =>
  input({ pricingMode: "supplier", supplierPricePerPerson: 500000, targetMarginRate: 15, cardFeeRate: 0, tipPerPerson: 0, insurancePerPerson: 0, ...patch });

function quoteOf(i: TripInput) {
  const q = calculateQuote(i, days, {});
  if (!q.ok) throw new Error(q.error);
  return q;
}

const land = { guide: true, meals: true, admission: true, vehicle: true, hotel: false, flight: false };
const comp = (places: string[]): Competitor => ({
  id: places.join(),
  name: "A",
  price: 600000,
  includes: land,
  shopping: "none",
  optionTour: "none",
  note: "",
  places,
});

describe("업체 공급가 상한", () => {
  it("목표 판매가 − 수수료 − 회사 수익 − 공급가 밖 원가 = 상한", () => {
    const i = base({ supplierTargetPrice: 600000, cardFeeRate: 3, tipPerPerson: 10000 });
    const t = supplierTarget(i, quoteOf(i), null)!;
    // 600,000 − 18,000 − 90,000 − 팁 10,000 = 482,000
    expect(t.maxSupplierPerPerson).toBeCloseTo(482000);
    expect(t.over).toBeCloseTo(18000);
    expect(t.targetSource).toBe("manual");
  });

  it("목표 판매가가 0이면 경쟁 상품 하위 25%, 그것도 없으면 계산하지 않는다", () => {
    const i = base();
    expect(supplierTarget(i, quoteOf(i), 612345)).toMatchObject({ targetSource: "competitors", targetPrice: 612000 });
    expect(supplierTarget(i, quoteOf(i), null)).toBeNull();
    expect(supplierTarget({ ...i, pricingMode: "target_margin" }, quoteOf(i), 600000)).toBeNull();
  });
});

describe("빼면 좋은 일정", () => {
  it("경쟁 상품에 없는 유료 일정 → 그 밖 → 경쟁 상품 대부분이 넣는 일정 → 대표 일정 순, 현지 지불은 빼고 비싼 식사는 낮추기", () => {
    const i = base({ competitors: [comp(["바나힐", "호이안"]), comp(["바나힐 테마파크", "오행산"])] });
    const meta = { packageName: "다낭 오행산 3일", cities: [], noShopping: false, noOption: false, hotelGrade: "", highlights: [] };
    const cuts = supplierCuts(i, days, {}, meta, 50000);
    expect(cuts.map((c) => c.name)).toEqual(["코코넛 배", "랍스터 디너", "바나힐", "오행산"]);
    expect(cuts[0]).toMatchObject({ rank: 1, reason: "경쟁 상품 2곳 모두 넣지 않은 일정" });
    expect(cuts[1]).toMatchObject({ kind: "meal-down", savingPerPerson: 45000 }); // 60,000 − 보통 15,000
    expect(cuts[3].rank).toBe(4); // 상품명에 들어간 대표 일정
    // 50,000을 채울 때까지 앞에서부터 추천
    expect(cuts.filter((c) => c.recommended).map((c) => c.name)).toEqual(["코코넛 배", "랍스터 디너"]);
  });

  it("고른 것을 빼면 예상 공급가와 상한 도달 여부", () => {
    const i = base({ supplierTargetPrice: 600000 }); // 상한 510,000, 지금 500,000 → 여유
    const t = supplierTarget(i, quoteOf(i), null)!;
    const tight = { ...t, maxSupplierPerPerson: 440000, over: 60000 };
    const cuts = supplierCuts(i, days, {}, null, tight.over);
    const r = supplierAfterCuts(tight, cuts, new Set(cuts.filter((c) => c.recommended).map((c) => c.id)));
    expect(r.saving).toBe(60000); // 금액 큰 바나힐 하나로 60,000을 채운다
    expect(r.after).toBe(440000);
    expect(r.reaches).toBe(true);
  });
});

describe("업체 견적서 금액 읽기", () => {
  const raw = toSupplierQuote({
    found: true,
    currency: "usd",
    pricePerPerson: 0,
    basisTravelers: 4,
    roomBasis: "twin",
    singleSupplement: 120,
    tiers: [
      { travelers: 2, pricePerPerson: 520 },
      { travelers: 4, pricePerPerson: 400 },
      { travelers: 6, pricePerPerson: 350 },
    ],
    lines: [{ label: "차량", amount: 300, unit: "per_day" }],
    includes: ["호텔", "차량"],
    excludes: ["가이드 팁"],
    shopping: "노쇼핑",
    options: "",
    notes: "",
  })!;

  it("요금이 없으면 null, 1인 요금이 없으면 요금표 첫 칸", () => {
    expect(toSupplierQuote(undefined)).toBeNull();
    expect(raw).toMatchObject({ currency: "USD", pricePerPerson: 520 });
  });

  it("통화를 바꾸고, 인원에 맞는 요금표 칸을 고른다", async () => {
    const rate = await conversionRate("USD", "KRW", async (code) => (code === "USD" ? 1400 : null));
    expect(rate).toBe(1400);
    const q = toAppQuote(raw, rate, "2026-10-09T00:00:00Z");
    expect(quotePriceFor(q, 5)).toEqual({ price: 400 * 1400, tier: 4 });
    expect(quotePriceFor(q, 1)).toEqual({ price: 520 * 1400, tier: 2 });
    expect(q.singleSupplement).toBe(168000);
  });

  it("통화를 못 바꾸면 공급가는 비워 두고, 업체 공급가 모드로 바꾸며 쓰던 판매가를 목표로", async () => {
    const i = input({ pricingMode: "fixed_price", fixedPricePerPerson: 700000, travelers: 4, currency: "KRW" });
    const patch = await supplierQuotePatch(raw, i, async () => null);
    expect(patch).toMatchObject({ pricingMode: "supplier", supplierTargetPrice: 700000, supplierQuote: { rate: null } });
    expect(patch.supplierPricePerPerson).toBeUndefined();
    const ok = await supplierQuotePatch(raw, i, async () => 1400);
    expect(ok.supplierPricePerPerson).toBe(560000);
  });
});
