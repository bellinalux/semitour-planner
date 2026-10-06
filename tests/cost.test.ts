import { describe, expect, it } from "vitest";
import { calculateQuote } from "@/lib/cost";
import type { QuoteData } from "@/types";
import { input, item, linearDay } from "./fixtures";

// 원가: 차량 100,000 + 가이드 50,000 + (입장 10,000 + 식대 20,000) × 4명 = 270,000
const days = [linearDay(1, [item("a", { entryFee: 10000 }), item("m", { type: "meal", mealCost: 20000 })])];
const pm = {};

function ok(q: ReturnType<typeof calculateQuote>): QuoteData {
  if (!q.ok) throw new Error(q.error);
  return q;
}

describe("calculateQuote — 목표 마진으로 판매가 역산", () => {
  it("판매가 = 원가 ÷ (1 − 마진 − 카드수수료), 1,000원 단위 올림", () => {
    const q = ok(calculateQuote(input(), days, pm));
    expect(q.scenario.baseCost).toBe(270000);
    expect(q.scenario.pricePerPerson).toBe(88000); // 270,000 / 0.77 / 4 = 87,662 → 88,000
    expect(q.scenario.actualMarginRate).toBeGreaterThanOrEqual(20);
  });

  it("판매가 직접 입력이면 그 가격으로 마진을 계산한다", () => {
    const q = ok(calculateQuote(input({ pricingMode: "fixed_price", fixedPricePerPerson: 100000 }), days, pm));
    expect(q.scenario.pricePerPerson).toBe(100000);
    expect(q.scenario.profit).toBeCloseTo(400000 * 0.97 - 270000);
  });

  it("마진 + 카드 수수료가 100% 이상이면 오류", () => {
    expect(calculateQuote(input({ targetMarginRate: 98 }), days, pm).ok).toBe(false);
  });
});

describe("calculateQuote — 판매 채널", () => {
  const channel = { id: "c1", name: "클룩", commissionRate: 20, fixedFeePerPerson: 0, paymentFeeSeparate: false, share: 30 };

  it("채널별 가격: 채널마다 목표 마진 가격", () => {
    const q = ok(calculateQuote(input({ channels: [channel] }), days, pm));
    const klook = q.channels.find((c) => c.id === "c1")!;
    expect(q.scenario.pricePerPerson).toBe(88000);
    expect(klook.pricePerPerson).toBe(113000); // 270,000 / 0.6 / 4 = 112,500 → 113,000
    expect(klook.marginRate).toBeGreaterThanOrEqual(20);
  });

  it("동일가: 수수료가 큰 채널 기준 가격이 직판가가 된다", () => {
    const q = ok(calculateQuote(input({ channels: [channel], channelPriceMode: "parity" }), days, pm));
    expect(q.scenario.pricePerPerson).toBe(113000);
    expect(q.channels.every((c) => c.pricePerPerson === 113000)).toBe(true);
  });

  it("결제 수수료를 따로 내는 채널은 카드 수수료를 더한다", () => {
    const q = ok(calculateQuote(input({ channels: [{ ...channel, paymentFeeSeparate: true }] }), days, pm));
    expect(q.channels.find((c) => c.id === "c1")!.feeRate).toBeCloseTo(23);
  });
});

describe("calculateQuote — 환율 버퍼", () => {
  it("원화가 아닌 견적은 원가 합계에 버퍼 비율을 더한다", () => {
    const q = ok(calculateQuote(input({ currency: "USD", exchangeRateToKrw: 1300, fxBufferRate: 10 }), days, pm));
    const buffer = q.lines.find((l) => l.key === "fx-buffer");
    expect(buffer?.amount).toBeCloseTo(27000);
    expect(q.scenario.baseCost).toBeCloseTo(297000);
  });

  it("원화 견적에는 버퍼를 넣지 않는다", () => {
    const q = ok(calculateQuote(input({ fxBufferRate: 10 }), days, pm));
    expect(q.lines.some((l) => l.key === "fx-buffer")).toBe(false);
  });
});
