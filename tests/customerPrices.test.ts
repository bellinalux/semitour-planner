import { describe, expect, it } from "vitest";
import { calculateQuote } from "@/lib/cost";
import { planGrades, priceGrid, priceGridTsv, pricePlans } from "@/lib/customerPrices";
import { salePrice } from "@/lib/priceLevers";
import type { TripInput } from "@/types";
import { input, item, linearDay } from "./fixtures";

const days = [
  linearDay(1, [item("a", { name: "바나힐", entryFee: 50000 }), item("m", { name: "점심", type: "meal", mealCost: 20000 })]),
  linearDay(2, [item("b", { name: "호이안 올드타운", entryFee: 20000 })]),
];

function setup(patch: Partial<TripInput>) {
  const i = input({ targetMarginRate: 20, cardFeeRate: 0, packageType: "land_hotel", lodgingType: "hotel", hotelGrade: "4", lodgingRatePerNight: 100000, nights: 2, travelers: 6, ...patch });
  const q = calculateQuote(i, days, {});
  if (!q.ok) throw new Error(q.error);
  return { i, q };
}

describe("A/B/C안", () => {
  it("지금 등급을 가운데로 세 안", () => {
    expect(planGrades("4")).toEqual(["3", "4", "5"]);
    expect(planGrades("4-5")).toEqual(["4", "4-5", "5"]);
    expect(planGrades("3-4")).toEqual(["3", "3-4", "4"]);
    expect(planGrades("any")).toEqual([]);
  });

  it("4성 견적이면 A 3성·B 4성(추천)·C 5성 — 1인 요금·총액·추천안과 차액", () => {
    const { i, q } = setup({});
    const plans = pricePlans(i, days, {}, q, null);
    expect(plans.map((p) => `${p.key}:${p.label}`)).toEqual(["A:3성급", "B:4성급", "C:5성급"]);
    const b = plans[1];
    expect(b.isCurrent).toBe(true);
    expect(b.salePrice).toBe(salePrice(i, days, {}));
    expect(b.diff).toBe(0);
    expect(plans[0].diff).toBeLessThan(0);
    expect(plans[2].diff).toBeGreaterThan(0);
    expect(plans[2].totalPrice).toBe(plans[2].salePrice * 6);
  });

  it("숙소가 없는 랜드 견적은 안을 만들지 않는다", () => {
    const { i, q } = setup({ packageType: "land" });
    expect(pricePlans(i, days, {}, q, null)).toEqual([]);
  });
});

describe("인원별 요금표", () => {
  it("A/B/C안 열 × 인원 행, 인원이 늘면 1인 요금이 내려간다 (지금 인원 표시)", () => {
    const { i, q } = setup({ vehicleCostPerDay: 200000, guideCostPerDay: 100000 });
    const g = priceGrid(i, days, {}, q, null);
    expect(g.kind).toBe("plan");
    expect(g.columns).toEqual(["A안 3성급", "B안 4성급", "C안 5성급"]);
    expect(g.rows.map((r) => r.travelers)).toEqual([2, 4, 6, 8, 10, 12, 15, 20]);
    expect(g.rows.find((r) => r.travelers === 6)!.isCurrent).toBe(true);
    const b = g.rows.map((r) => r.prices[1]!);
    expect(b[0]).toBeGreaterThan(b[b.length - 1]);
    // 6명 7인승 → 8명은 미니밴: 차량비를 다시 확인 (4명은 같은 차)
    expect(g.rows.find((r) => r.travelers === 8)!.vehicleChange).toBe("미니밴 (15~16인승)");
    expect(g.rows.find((r) => r.travelers === 4)!.vehicleChange).toBe(null);
    expect(priceGridTsv(g).split("\n")[0]).toBe("인원\tA안 3성급\tB안 4성급\tC안 5성급");
  });

  it("업체 요일별 요금이 있으면 요일 열, 최소 출발 인원 미만 표시", () => {
    const { i, q } = setup({
      pricingMode: "supplier",
      supplierPricePerPerson: 500000,
      minTravelers: 4,
      supplierQuote: {
        originalPrice: 500000, originalCurrency: "KRW", rate: 1, pricePerPerson: 500000, basisTravelers: 4, roomBasis: "twin", singleSupplement: 0, tiers: [], lines: [], includes: [], excludes: [], shopping: "", options: "", notes: "", readAt: "",
        datePrices: [
          { nights: 2, weekdays: [0, 1], label: "일, 월", pricePerPerson: 450000 },
          { nights: 2, weekdays: [4], label: "목", pricePerPerson: 500000 },
        ],
      },
    });
    const g = priceGrid(i, days, {}, q, null);
    expect(g.kind).toBe("weekday");
    expect(g.columns).toEqual(["일, 월", "목"]);
    expect(g.rows[0]).toMatchObject({ travelers: 2, belowMin: true });
    const six = g.rows.find((r) => r.travelers === 6)!;
    expect(six.prices[0]!).toBeLessThan(six.prices[1]!);
  });
});
