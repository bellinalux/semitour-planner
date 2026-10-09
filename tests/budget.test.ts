import { describe, expect, it } from "vitest";
import { budgetPlan } from "@/lib/budget";
import { calculateQuote, lodgingRoomsFor } from "@/lib/cost";
import { composition, singleSupplement } from "@/lib/pricing";
import type { QuoteData, TripInput } from "@/types";
import { input, item, linearDay } from "./fixtures";

const days = [linearDay(1, [item("a", { entryFee: 10000 }), item("m", { type: "meal", mealCost: 20000 })])];
const quote = (i: TripInput): QuoteData => {
  const q = calculateQuote(i, days, {});
  if (!q.ok) throw new Error(q.error);
  return q;
};
const hotel = (patch: Partial<TripInput> = {}) => input({ packageType: "land_hotel", nights: 2, lodgingRatePerNight: 100000, guestsPerUnit: 2, ...patch });

describe("2인 1실 기준 방 배정", () => {
  it("짝수 인원은 인원 ÷ 2실", () => {
    expect(lodgingRoomsFor(4, hotel())).toEqual({ costRooms: 2, bookedRooms: 2, singles: 0, extraBeds: 0 });
  });
  it("홀수: 기본은 남는 1명 싱글차지 따로 — 1인 요금에는 반 실만", () => {
    expect(lodgingRoomsFor(5, hotel())).toEqual({ costRooms: 2.5, bookedRooms: 3, singles: 1, extraBeds: 0 });
  });
  it("홀수 + 3인 1실 선택이면 엑스트라베드", () => {
    expect(lodgingRoomsFor(5, hotel({ oddRoomPolicy: "triple" }))).toEqual({ costRooms: 2, bookedRooms: 2, singles: 0, extraBeds: 1 });
  });
  it("홀수 + 나눠 반영이면 예전처럼 올림", () => {
    expect(lodgingRoomsFor(5, hotel({ oddRoomPolicy: "share" })).costRooms).toBe(3);
  });

  it("5명이어도 1인 숙박 원가는 4명일 때와 같다(2인 1실 기준), 싱글차지는 1명에게 따로", () => {
    const q4 = quote(hotel({ travelers: 4 }));
    const q5 = quote(hotel({ travelers: 5 }));
    const lodging = (q: QuoteData) => q.lines.find((l) => l.key === "lodging")!.amount / q.travelers;
    expect(lodging(q5)).toBe(lodging(q4)); // 100,000 × 2박 ÷ 2 = 100,000
    expect(q5.lines.find((l) => l.key === "lodging")!.note).toContain("1명 싱글차지 별도");
    expect(q5.lodgingUnits).toBe(3);
    expect(singleSupplement(q5, hotel({ travelers: 5 }))).toMatchObject({ cost: 100000, travelers: 1 });
  });

  it("3인 1실이면 엑스트라베드 요금이 원가에 들어간다", () => {
    const q = quote(hotel({ travelers: 5, oddRoomPolicy: "triple", extraBedPerNight: 30000 }));
    expect(q.lines.find((l) => l.key === "lodging-extrabed")?.amount).toBe(60000);
  });

  it("노베드 아동은 노베드 요금을 받고, 그만큼 숙박 원가가 빠진다", () => {
    const i = hotel({ travelers: 4, childNoBedCount: 1, childNoBedPriceRate: 70 });
    const c = composition(quote(i), i)!;
    expect(c.childrenNoBed).toBe(1);
    expect(c.childNoBedPrice).toBe(Math.round((c.adultPrice * 0.7) / 1000) * 1000);
    expect(c.cost).toBe(quote(i).scenario.baseCost - 100000); // 1인분 숙박비(2박 × 100,000 ÷ 2)
  });
});

describe("견적 시작 방법", () => {
  it("B2B 도매가: 그 가격으로 받고 카드 수수료 없이 이익, 거래처 권장 소비자가", () => {
    const q = quote(input({ pricingMode: "wholesale", wholesalePricePerPerson: 100000, partnerMarginRate: 20 }));
    expect(q.scenario.pricePerPerson).toBe(100000);
    expect(q.scenario.cardFee).toBe(0);
    expect(q.scenario.profit).toBe(400000 - 270000);
    expect(q.partnerConsumerPrice).toBe(125000);
  });

  it("랜드사 공급가: 공급가 한 줄이 원가, 목표 마진으로 판매가", () => {
    const q = quote(input({ pricingMode: "supplier", supplierPricePerPerson: 500000, targetMarginRate: 20, cardFeeRate: 3, tipPerPerson: 0, insurancePerPerson: 0 }));
    expect(q.lines.map((l) => l.key)).toEqual(["supplier", "other", "tip", "insurance"]);
    expect(q.scenario.costPerPerson).toBe(500000);
    expect(q.scenario.pricePerPerson).toBe(650000); // 500,000 ÷ 0.77 = 649,351 → 650,000
  });

  it("가격이 없으면 알려 준다", () => {
    expect(calculateQuote(input({ pricingMode: "wholesale" }), days, {}).ok).toBe(false);
    expect(calculateQuote(input({ pricingMode: "supplier" }), days, {}).ok).toBe(false);
  });
});

describe("원가 예산 (판매가에서 시작)", () => {
  it("판매가 − 플랫폼 수수료 − 회사 수익 = 1인 원가 예산", () => {
    const i = input({
      pricingMode: "fixed_price",
      fixedPricePerPerson: 1_000_000,
      targetMarginRate: 15,
      documentChannelId: "klook",
      channels: [{ id: "klook", name: "클룩", commissionRate: 20, fixedFeePerPerson: 0, paymentFeeSeparate: false, share: 0 }],
    });
    const plan = budgetPlan(i, null)!;
    expect(plan.channelName).toBe("클룩");
    expect(plan.feePerPerson).toBe(200000);
    expect(plan.profitPerPerson).toBe(150000);
    expect(plan.budgetPerPerson).toBe(650000);
  });

  it("아는 비용은 그대로, 모르는 숙박은 남은 예산에서 나눠 1실 1박 상한(2인 1실)을 만든다", () => {
    const i = input({ pricingMode: "fixed_price", fixedPricePerPerson: 1_000_000, targetMarginRate: 15, cardFeeRate: 0, packageType: "land_hotel", nights: 3, lodgingRatePerNight: 0, contingencyRate: 0, tipPerPerson: 0, insurancePerPerson: 0 });
    const plan = budgetPlan(i, null, 4)!;
    const ground = plan.categories.find((c) => c.key === "ground")!;
    expect(ground).toMatchObject({ known: true, budget: (150000 * 4) / 4 }); // 차량 100,000 + 가이드 50,000 × 4일 ÷ 4명
    const lodging = plan.categories.find((c) => c.key === "lodging")!;
    expect(lodging.known).toBe(false);
    expect(plan.caps.roomPerNight).toBe(Math.floor((lodging.budget * 2) / 3));
    expect(plan.categories.reduce((s, c) => s + c.budget, 0)).toBeCloseTo(plan.budgetPerPerson);
  });

  it("견적이 예산을 넘으면 필요한 최소 판매가를 알려 준다", () => {
    const i = input({ pricingMode: "fixed_price", fixedPricePerPerson: 80000, targetMarginRate: 20, cardFeeRate: 3 });
    const plan = budgetPlan(i, quote(i))!;
    expect(plan.actualPerPerson).toBe(67500);
    expect(plan.gap!).toBeLessThan(0);
    expect(plan.minPriceNeeded).toBe(88000); // 67,500 ÷ 0.77
  });

  it("도매가: 수수료 없이 회사 수익만 뺀다", () => {
    const plan = budgetPlan(input({ pricingMode: "wholesale", wholesalePricePerPerson: 500000, targetMarginRate: 10 }), null)!;
    expect(plan).toMatchObject({ channelName: "거래처(B2B)", feePerPerson: 0, budgetPerPerson: 450000 });
  });

  it("원가에서 시작하는 견적은 예산이 없다", () => {
    expect(budgetPlan(input(), null)).toBeNull();
  });
});
