import { describe, expect, it } from "vitest";
import { ourPolicy } from "@/lib/competitorDiff";
import { calculateQuote } from "@/lib/cost";
import { buildPriceTiers, composition, departurePrices, documentQuote, fxSensitivity, singleSupplement } from "@/lib/pricing";
import type { QuoteData, TripInput } from "@/types";
import { input, item, linearDay } from "./fixtures";

const days = [linearDay(1, [item("a", { entryFee: 10000 }), item("m", { type: "meal", mealCost: 20000 })])];

function quote(i: TripInput): QuoteData {
  const q = calculateQuote(i, days, {});
  if (!q.ok) throw new Error(q.error);
  return q;
}

describe("추천 판매가 3단계", () => {
  it("최저(최소 마진) < 권장(목표 마진), 경쟁사가 비싸면 경쟁력 가격 = 권장가", () => {
    const i = input({ minMarginRate: 10, competitors: [{ id: "k", name: "A", price: 150000, includes: { guide: true, meals: true, admission: true, vehicle: true, hotel: false, flight: false }, shopping: "none", optionTour: "none", note: "" }] });
    const q = quote(i);
    const t = buildPriceTiers(q, i, ourPolicy(days, {}, i, null));
    const [floor, rec, comp] = t.tiers;
    expect(floor.price).toBe(78000); // 270,000 / 0.87 / 4 = 77,586
    expect(rec.price).toBe(88000);
    expect(comp.price).toBe(88000);
    expect(t.stats?.min).toBe(150000);
  });

  it("경쟁사 하위 가격이 최저 판매가보다 낮으면 경고 표시", () => {
    const i = input({ competitors: [{ id: "k", name: "A", price: 50000, includes: { guide: true, meals: true, admission: true, vehicle: true, hotel: false, flight: false }, shopping: "none", optionTour: "none", note: "" }] });
    const q = quote(i);
    expect(buildPriceTiers(q, i, ourPolicy(days, {}, i, null)).competitiveBelowFloor).toBe(true);
  });
});

describe("1인실 추가요금", () => {
  it("한 방을 둘이 쓰던 숙박비의 절반을 목표 마진·수수료로 환산", () => {
    const i = input({ packageType: "land_hotel", lodgingRatePerNight: 80000, guestsPerUnit: 2, nights: 2 });
    expect(singleSupplement(quote(i), i)).toMatchObject({ cost: 80000, price: 104000 });
  });
  it("숙박이 없는 구성이면 null", () => {
    const i = input();
    expect(singleSupplement(quote(i), i)).toBeNull();
  });
});

describe("아동·유아 요금", () => {
  it("구성별 판매액과 이익", () => {
    const i = input({ childCount: 1, infantCount: 1, childPriceRate: 80, infantPriceRate: 10 });
    const c = composition(quote(i), i)!;
    expect([c.adults, c.childPrice, c.infantPrice]).toEqual([3, 70000, 9000]);
    expect(c.revenue).toBe(343000);
    expect(c.profit).toBeCloseTo(343000 * 0.97 - 270000);
  });
});

describe("환율 민감도", () => {
  it("환율이 오르면 원화 이익이 줄고, 손익분기 상승폭을 계산한다", () => {
    const i = input({ currency: "USD", exchangeRateToKrw: 1300 });
    const fx = fxSensitivity(quote(i), i)!;
    const up = fx.rows.find((r) => r.shift === 10)!;
    const now = fx.rows.find((r) => r.shift === 0)!;
    expect(up.profitKrw).toBeLessThan(now.profitKrw);
    expect(fx.breakEvenShift).toBeGreaterThan(fx.targetShift);
  });
  it("원화 견적이면 null", () => {
    const i = input();
    expect(fxSensitivity(quote(i), i)).toBeNull();
  });
});

describe("출발일별 권장가", () => {
  it("항공료가 싼 출발일이 권장가도 낮다", () => {
    const i = input({
      packageType: "full",
      flightPricePerPerson: 300000,
      flightDeals: [
        { departDate: "2026-11-17", returnDate: "", price: 400000, transfers: 0, airline: "VJ", expiresAt: "" },
        { departDate: "2026-11-10", returnDate: "", price: 200000, transfers: 0, airline: "VJ", expiresAt: "" },
      ],
    });
    const rows = departurePrices(quote(i), i);
    expect(rows.map((r) => r.deal.departDate)).toEqual(["2026-11-10", "2026-11-17"]);
    expect(rows[0].pricePerPerson!).toBeLessThan(rows[1].pricePerPerson!);
  });
});

describe("고객 문서용 견적", () => {
  it("선택한 채널의 소비자가로 가격만 바꾼다", () => {
    const i = input({ documentChannelId: "c1", channels: [{ id: "c1", name: "클룩", commissionRate: 20, fixedFeePerPerson: 0, paymentFeeSeparate: false, share: 0 }] });
    const q = quote(i);
    const d = documentQuote(q, i);
    expect(d.scenario.pricePerPerson).toBe(113000);
    expect(d.scenario.totalPrice).toBe(452000);
    expect(q.scenario.pricePerPerson).toBe(88000);
  });
});
