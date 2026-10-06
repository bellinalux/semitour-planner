import { describe, expect, it } from "vitest";
import { channelMix, consumerPrices, discountOutcome, maxDiscountRate, requiredPricePerPerson, type FeeRow } from "@/lib/channels";
import type { ChannelResult } from "@/types";

const direct: FeeRow = { id: "direct", name: "직판", isDirect: true, rate: 0.03, fixedPerPerson: 0, share: 70 };
const ota: FeeRow = { id: "ota", name: "OTA", isDirect: false, rate: 0.2, fixedPerPerson: 0, share: 30 };
const params = { margin: 0.2, currency: "KRW" as const, pricingMode: "target_margin" as const, fixedPrice: 0, channelPriceMode: "per_channel" as const };

describe("requiredPricePerPerson", () => {
  it("정액 수수료까지 반영해 목표 마진 가격을 구한다", () => {
    expect(requiredPricePerPerson(270000, 4, { rate: 0.2, fixedPerPerson: 5000 }, 0.2, "KRW")).toBe(121000); // (67,500 + 5,000) / 0.6
  });
  it("수수료 + 마진이 100% 이상이면 null", () => {
    expect(requiredPricePerPerson(100, 1, { rate: 0.9, fixedPerPerson: 0 }, 0.2, "KRW")).toBeNull();
  });
});

describe("consumerPrices", () => {
  it("채널별 / 동일가 / 직접 입력", () => {
    expect(Object.fromEntries(consumerPrices([direct, ota], 4, 270000, params))).toEqual({ direct: 88000, ota: 113000 });
    expect(Object.fromEntries(consumerPrices([direct, ota], 4, 270000, { ...params, channelPriceMode: "parity" }))).toEqual({ direct: 113000, ota: 113000 });
    expect(Object.fromEntries(consumerPrices([direct, ota], 4, 270000, { ...params, pricingMode: "fixed_price", fixedPrice: 99000 }))).toEqual({ direct: 99000, ota: 99000 });
  });
});

const result = (price: number, feeRate: number): Pick<ChannelResult, "totalPrice" | "feeRate" | "fixedFeePerPerson"> => ({
  totalPrice: price * 4,
  feeRate,
  fixedFeePerPerson: 0,
});

describe("할인 시뮬레이션", () => {
  it("할인 후 결제액에 수수료가 붙는다", () => {
    const r = discountOutcome(result(100000, 3), 4, 270000, 10);
    expect(r.paid).toBe(360000);
    expect(r.profit).toBeCloseTo(360000 * 0.97 - 270000);
  });

  it("목표 마진을 지키는 최대 할인율", () => {
    // 최소 결제액 = 270,000 / (1 − 0.03 − 0.2) = 350,649 → 400,000 대비 12.3%
    expect(maxDiscountRate(result(100000, 3), 4, 270000, 0.2)).toBeCloseTo(12.34, 1);
    expect(maxDiscountRate(result(60000, 3), 4, 270000, 0.2)).toBe(0);
  });
});

describe("channelMix", () => {
  it("판매 비중대로 정산액을 섞고 원가는 한 번만 뺀다", () => {
    const rows = [
      { id: "direct", share: 70, totalPrice: 400000, settlement: 388000, feeRate: 3 },
      { id: "ota", share: 30, totalPrice: 400000, settlement: 320000, feeRate: 20 },
    ] as ChannelResult[];
    const mix = channelMix(rows, 4, 270000)!;
    expect(mix.weightedFeeRate).toBeCloseTo(8.1);
    expect(mix.totalProfit).toBeCloseTo(388000 * 0.7 + 320000 * 0.3 - 270000);
  });
  it("채널이 직판뿐이면 null", () => {
    expect(channelMix([{ share: 100 } as ChannelResult], 4, 1)).toBeNull();
  });
});
