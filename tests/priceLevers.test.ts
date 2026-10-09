import { describe, expect, it } from "vitest";
import { calculateQuote } from "@/lib/cost";
import { buildPriceLevers, combinedLevers, salePrice } from "@/lib/priceLevers";
import type { Competitor, TripInput } from "@/types";
import { input, item, linearDay } from "./fixtures";

const days = [
  linearDay(1, [item("a", { name: "바나힐", entryFee: 50000 }), item("m", { name: "점심", type: "meal", mealCost: 20000 }), item("d", { name: "랍스터 특식", type: "meal", mealCost: 60000 })]),
  linearDay(2, [item("b", { name: "호이안 올드타운", entryFee: 20000 }), item("m2", { name: "점심", type: "meal", mealCost: 20000 })]),
];
const land = { guide: true, meals: true, admission: true, vehicle: true, hotel: false, flight: false };
const comp = (id: string, price: number): Competitor => ({ id, name: `${id}투어 다낭 3일`, price, includes: land, shopping: "none", optionTour: "none", note: "" });

function setup(patch: Partial<TripInput>) {
  const i = input({ targetMarginRate: 20, cardFeeRate: 0, ...patch });
  const q = calculateQuote(i, days, {});
  if (!q.ok) throw new Error(q.error);
  return { i, q };
}

describe("가격 낮추기 (경쟁 상품 기준)", () => {
  it("우리 원가 견적: 유료 일정 빼기·특식 낮추기를 바로 적용할 수 있고, 판매가·경쟁 순위 변화를 계산한다", () => {
    const { i, q } = setup({ competitors: [comp("A", 400000), comp("B", 900000)] });
    const r = buildPriceLevers(i, days, {}, q, null)!;
    expect(r.basePrice).toBe(salePrice(i, days, {}));
    const remove = r.levers.find((l) => l.label === "DAY 1 바나힐 빼기")!;
    expect(remove).toMatchObject({ mode: "apply" });
    expect(remove.saving).toBeGreaterThan(50000); // 원가 5만 원 → 판매가는 마진을 붙여 더 줄어든다
    expect(r.levers.find((l) => l.label.includes("랍스터 특식 → 일반 식사"))).toBeTruthy();
    // 인원 늘리기는 안내
    expect(r.levers.find((l) => l.id === `group-${i.travelers + 2}`)?.mode).toBe("info");
    // 함께 적용: 판매가가 두 방법 절감보다 조금 덜 또는 같게 줄고, 일정에서 바나힐이 빠진다
    const both = combinedLevers(i, days, {}, q, null, [remove.id, r.levers.find((l) => l.label.includes("랍스터"))!.id]);
    expect(both.price!).toBeLessThan(remove.newPrice);
    expect(both.days[0].items.map((x) => x.id)).not.toContain("a");
  });

  it("업체 공급가 견적: 일정 조정은 업체 요청(request) — 받아들이면 공급가가 줄어든다고 보고 판매가를 미리 계산", () => {
    const { i, q } = setup({ pricingMode: "supplier", supplierPricePerPerson: 500000, tipPerPerson: 30000 });
    const r = buildPriceLevers(i, days, {}, q, null)!;
    const remove = r.levers.find((l) => l.label === "DAY 1 바나힐 빼기")!;
    expect(remove).toMatchObject({ mode: "request", cutId: "item-a" });
    expect(remove.saving).toBeGreaterThan(0);
    // 팁을 현지 지불로: 표시 가격만 내려가고 강점을 잃는다
    const tip = r.levers.find((l) => l.id === "tip-local")!;
    expect(tip.mode).toBe("apply");
    expect(tip.lose).toContain("'노팁' 강점이 사라짐");
  });
});

describe("경쟁 상품 따라 하기", () => {
  const three = [
    linearDay(1, [item("a", { name: "바나힐", entryFee: 50000 }), item("m1", { name: "점심", type: "meal", mealCost: 20000 })]),
    linearDay(2, [item("b", { name: "오행산", entryFee: 10000 }), item("m2", { name: "랍스터 저녁", type: "meal", mealCost: 60000 }), item("m3", { name: "점심", type: "meal", mealCost: 20000 })]),
    linearDay(3, [item("c", { name: "호이안", entryFee: 20000 }), item("m4", { name: "점심", type: "meal", mealCost: 20000 })]),
  ];
  const light: Competitor = {
    ...comp("L", 500000),
    itinerary: {
      found: true,
      days: [1, 2, 3].map((d) => ({ day: d, title: "", places: [], meals: { breakfast: "", lunch: "", dinner: "" }, hotel: "", free: d === 2, otherRegion: "" })),
      mealCount: 1,
      tipNote: "",
      sourceName: "",
      checkedAt: "",
    },
  };

  it("그 상품처럼 가운데 날을 자유일로, 남는 식사는 비싼 것부터 자유식으로 — 바로 적용하면 일정이 바뀐다", () => {
    const i = input({ targetMarginRate: 20, cardFeeRate: 0, competitors: [light] });
    const q = calculateQuote(i, three, {});
    if (!q.ok) throw new Error(q.error);
    const r = buildPriceLevers(i, three, {}, q, null)!;
    const match = r.levers.find((l) => l.id === "match-L")!;
    expect(match.label).toContain("자유일 +1일 (DAY 2)");
    expect(match.label).toContain("포함 식사 −3회");
    expect(match.mode).toBe("apply");
    expect(match.saving).toBeGreaterThan(0);
    const applied = combinedLevers(i, three, {}, q, null, ["match-L"]);
    expect(applied.days[1].items.map((x) => x.type)).toEqual(["free_time"]);
    expect(applied.days.flatMap((d) => d.items).filter((x) => x.type === "meal" && x.payment !== "local")).toHaveLength(1);
  });
});

describe("출발 요일별 판매가", () => {
  it("업체 요일별 공급가로 판매가·수익률과 그 요일의 가까운 출발일 3개", async () => {
    const { weekdayPriceRows } = await import("@/lib/priceLevers");
    const i = input({
      pricingMode: "supplier",
      supplierPricePerPerson: 500000,
      nights: 2,
      departureDate: "2026-11-05",
      supplierQuote: {
        originalPrice: 500000, originalCurrency: "KRW", rate: 1, pricePerPerson: 500000, basisTravelers: 4, roomBasis: "twin", singleSupplement: 0, tiers: [], lines: [], includes: [], excludes: [], shopping: "", options: "", notes: "", readAt: "",
        datePrices: [
          { nights: 2, weekdays: [0, 1], label: "일, 월", pricePerPerson: 450000 },
          { nights: 2, weekdays: [4], label: "목", pricePerPerson: 500000 },
        ],
        picked: { price: 500000, label: "2박 목 출발 요금" },
      },
    });
    const rows = weekdayPriceRows(i, days, {});
    expect(rows).toHaveLength(2);
    expect(rows[0].salePrice!).toBeLessThan(rows[1].salePrice!);
    expect(rows[0].nextDates).toEqual(["2026-11-08", "2026-11-09", "2026-11-15"]);
    expect(rows[1].isCurrent).toBe(true);
  });
});

describe("등급별 여러 안", () => {
  it("3성~5성 각 안의 1박 요금(한 등급 약 30%)·판매가 — 등급이 높을수록 비싸다", async () => {
    const { gradeOptions } = await import("@/lib/priceLevers");
    const i = input({ packageType: "land_hotel", lodgingType: "hotel", hotelGrade: "4", lodgingRatePerNight: 100000, nights: 2, targetMarginRate: 20, cardFeeRate: 0 });
    const q = calculateQuote(i, days, {});
    if (!q.ok) throw new Error(q.error);
    const rows = gradeOptions(i, days, {}, q, null);
    expect(rows.map((r) => r.label)).toEqual(["3성급", "3~4성급", "4성급", "4~5성급", "5성급"]);
    expect(rows.find((r) => r.grade === "4")).toMatchObject({ ratePerNight: 100000, isCurrent: true });
    expect(rows.find((r) => r.grade === "3")!.ratePerNight).toBe(70000);
    const prices = rows.map((r) => r.salePrice!);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });
});
