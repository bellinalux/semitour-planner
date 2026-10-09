import { describe, expect, it } from "vitest";
import { calculateQuote } from "@/lib/cost";
import { toSupplierQuote } from "@/lib/schemas/course";
import { competitorCaps, cutLabel, supplierAfterCuts, supplierCuts, supplierTarget } from "@/lib/supplierCheck";
import { conversionRate, gradeFromText, packageFromQuote, quotePriceFor, supplierIncludes, supplierQuotePatch, toAppQuote } from "@/lib/supplierQuote";
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
    // 손익분기: 회사 수익 0 → 600,000 − 18,000 − 10,000 = 572,000. 지금 500,000이면 수익 72,000 = 12%
    expect(t.breakEvenSupplierPerPerson).toBeCloseTo(572000);
    expect(t.marginAtCurrent).toBeCloseTo(12);
    expect(t.targetSource).toBe("manual");
  });

  it("목표 판매가가 0이면 경쟁 상품 하위 25%, 그것도 없으면 계산하지 않는다", () => {
    const i = base();
    expect(supplierTarget(i, quoteOf(i), 612345)).toMatchObject({ targetSource: "competitors", targetPrice: 612000 });
    expect(supplierTarget(i, quoteOf(i), null)).toBeNull();
    expect(supplierTarget({ ...i, pricingMode: "target_margin" }, quoteOf(i), 600000)).toBeNull();
  });
});

describe("경쟁 상품별 공급가 기준", () => {
  it("경쟁 가격에 맞출 때 공급가 상한·손익분기, 경쟁사 마진을 빼서 추정한 원가와 우리 업체 견적 비교", () => {
    const i = base({
      supplierPricePerPerson: 480000,
      supplierTargetPrice: 600000,
      competitors: [{ ...comp(["바나힐"]), id: "k", name: "A여행", price: 600000 }],
      competitorMarginRate: 20,
    });
    const [cap] = competitorCaps(i, days, {}, null, quoteOf(i));
    // 같은 조건 가격: 600,000 − 우리 일정의 현지 지불 30,000 = 570,000 → 상한 570,000 × 85% = 484,500
    // 경쟁사 원가 추정: 570,000 − 표시 가격 600,000의 20% = 450,000 → 우리 480,000은 비슷(10% 안)
    expect(cap).toMatchObject({ name: "A여행", scopedPrice: 570000, maxSupplier: 484500, breakEven: 570000, estimatedCost: 450000, level: "ok" });
    const pricey = base({ ...i, supplierPricePerPerson: 560000 });
    expect(competitorCaps(pricey, days, {}, null, quoteOf(pricey))[0].level).toBe("high");
    expect(competitorCaps({ ...i, pricingMode: "target_margin" }, days, {}, null, quoteOf(i))).toEqual([]);
  });
});

describe("빼면 좋은 일정", () => {
  it("자유일정 날 차량·가이드 빼기, 숙소 한 등급 낮추기 (시세가 있을 때)", () => {
    const withFree = [...days, linearDay(3, [item("f", { name: "자유시간", type: "free_time" }), item("h", { name: "호텔 휴식", type: "hotel" })])];
    const i = base({
      travelers: 4,
      vehicleCostPerDay: 100000,
      guideCostPerDay: 60000,
      packageType: "land_hotel",
      hotelGrade: "5",
      lodgingRatePerNight: 200000,
      nights: 2,
    });
    const cuts = supplierCuts(i, withFree, {}, null, 1_000_000);
    const ground = cuts.find((c) => c.kind === "ground-day")!;
    expect(ground).toMatchObject({ dayNo: 3, savingPerPerson: 40000, rank: 1 });
    expect(cutLabel(ground)).toBe("DAY 3 차량·가이드 빼기 (자유일정)");
    const hotel = cuts.find((c) => c.kind === "hotel-down")!;
    expect(hotel).toMatchObject({ name: "숙소 한 등급 낮추기 (5성 → 4성)", savingPerPerson: 60000, rank: 3 }); // 200,000 × 2박 ÷ 2 × 30%
    expect(
      supplierCuts(base({ hotelGrade: "3", packageType: "land_hotel", lodgingRatePerNight: 200000 }), days, {}, null, 1).some((c) => c.kind === "hotel-down"),
    ).toBe(false);
    // 업체가 이미 "가이드/차량 미포함"이라고 적은 자유일정 날은 제안하지 않는다 (절감을 두 번 세지 않는다)
    const offDay = [...days, linearDay(3, [item("f", { name: "자유 일정 (가이드/차량 미포함)", type: "free_time" })])];
    expect(supplierCuts(i, offDay, {}, null, 1_000_000).some((c) => c.kind === "ground-day")).toBe(false);
  });

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
    minTravelers: 0,
    hotels: "",
    roomBasis: "twin",
    singleSupplement: 120,
    tiers: [
      { travelers: 2, pricePerPerson: 520 },
      { travelers: 4, pricePerPerson: 400 },
      { travelers: 6, pricePerPerson: 350 },
    ],
    datePrices: [],
    hotelNames: [],
    optionPrices: [],
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

  it("통화를 못 바꾸면 견적 방식은 그대로 두고 견적서 내용만 남긴다 — 요금을 바꾸면 업체 공급가 모드, 쓰던 판매가는 목표로", async () => {
    const i = input({ pricingMode: "fixed_price", fixedPricePerPerson: 700000, travelers: 4, currency: "KRW" });
    const patch = await supplierQuotePatch(raw, i, async () => null);
    expect(patch).toMatchObject({ supplierTargetPrice: 700000, supplierQuote: { rate: null } });
    expect(patch.pricingMode).toBeUndefined();
    expect(patch.supplierPricePerPerson).toBeUndefined();
    const ok = await supplierQuotePatch(raw, i, async () => 1400);
    expect(ok).toMatchObject({ pricingMode: "supplier", supplierPricePerPerson: 560000 });
  });
});

describe("견적서 내용으로 판매 구성·확인할 것", () => {
  const quoteRaw = (patch: Record<string, unknown>) =>
    toSupplierQuote({
      found: true,
      currency: "USD",
      pricePerPerson: 0,
      basisTravelers: 0,
      minTravelers: 4,
      hotels: "골든드래곤 호텔(4성), 리젠시 아트 호텔(5성) 중 하나",
      roomBasis: "twin",
      singleSupplement: 0,
      tiers: [],
      datePrices: [],
      hotelNames: [],
      optionPrices: [],
      lines: [],
      includes: ["차량", "가이드", "단체 식사", "마카오 타워"],
      excludes: ["홍콩 데이투어 (최소 8인, 인당 180USD)"],
      shopping: "",
      options: "",
      notes: "",
      ...patch,
    })!;

  it("요금이 없어도 인원·객실·호텔·포함·불포함은 남기고, 불포함 옵션 요금을 상품 요금으로 읽었으면 뺀다", () => {
    expect(quoteRaw({})).toMatchObject({ pricePerPerson: 0, minTravelers: 4, roomBasis: "twin", suspectPrice: 0 });
    expect(quoteRaw({ pricePerPerson: 180 })).toMatchObject({ pricePerPerson: 0, suspectPrice: 180 });
    expect(quoteRaw({ pricePerPerson: 1800 })).toMatchObject({ pricePerPerson: 1800, suspectPrice: 0 });
  });

  it("호텔이 적혀 있으면 랜드+숙박, 4성·5성이 섞여 있으면 등급은 4~5성(섞어서)", async () => {
    const i = input({ packageType: "land", hotelGrade: "any", currency: "KRW" });
    const patch = await supplierQuotePatch(quoteRaw({}), i, async () => 1400);
    expect(patch).toMatchObject({ packageType: "land_hotel", hotelGrade: "4-5" });
    expect(patch.pricingMode).toBeUndefined(); // 요금이 없으면 견적 방식은 그대로
  });
});

describe("견적서 표기 해석", () => {
  it("호텔 등급·판매 구성·포함 항목", () => {
    expect(gradeFromText("4·5성 호텔")).toBe("4-5");
    expect(gradeFromText("골든드래곤 호텔(4성), 리젠시 아트 호텔(5성) 중 하나")).toBe("4-5");
    expect(gradeFromText("4성급")).toBe("4");
    expect(gradeFromText("5성급 리조트")).toBe("5");
    expect(gradeFromText("풀빌라 리조트")).toBe("resort");
    expect(packageFromQuote({ includes: ["왕복 항공권", "호텔"], excludes: [] })).toBe("full");
    expect(packageFromQuote({ includes: ["제주항공 09:50 출발"], excludes: ["호텔"] })).toBe("land");
    const inc = supplierIncludes({ includes: ["호텔", "차량", "가이드"], excludes: ["입장료", "가이드 팁"] } as never, {
      guide: false,
      vehicle: false,
      admission: true,
      meals: true,
      hotel: false,
      flight: false,
    });
    expect(inc).toEqual({ guide: true, vehicle: true, admission: false, meals: true, hotel: true, flight: false });
  });
});
