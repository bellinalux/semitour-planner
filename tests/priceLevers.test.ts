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
