import { describe, expect, it } from "vitest";
import { calculateQuote } from "@/lib/cost";
import { categoryOf, linePerPerson, verifySupplierQuote } from "@/lib/supplierVerify";
import type { SupplierQuote, TripInput } from "@/types";
import { input, item, linearDay } from "./fixtures";

const days = [
  linearDay(1, [item("a", { name: "바나힐", entryFee: 50000 }), item("m", { name: "점심", type: "meal", mealCost: 20000 })]),
  linearDay(2, [item("b", { name: "호이안", entryFee: 20000 })]),
];

const sq = (patch: Partial<SupplierQuote> = {}): SupplierQuote => ({
  originalPrice: 400000,
  originalCurrency: "KRW",
  rate: 1,
  pricePerPerson: 400000,
  basisTravelers: 4,
  roomBasis: "twin",
  singleSupplement: 100000,
  tiers: [],
  lines: [],
  includes: ["호텔", "전용 차량", "가이드", "입장료", "일정 중 식사", "공항 픽업·샌딩", "여행자 보험"],
  excludes: ["가이드·기사 팁"],
  shopping: "",
  options: "",
  notes: "",
  readAt: "",
  ...patch,
});

// 시세: 차량 100,000 + 가이드 50,000 (2일) → 1인 75,000, 숙박 1실 100,000 × 2박 ÷ 2 = 100,000, 입장 70,000, 식사 20,000 → 265,000
const base = (patch: Partial<TripInput> = {}) =>
  input({
    pricingMode: "supplier",
    supplierPricePerPerson: 300000,
    packageType: "land_hotel",
    nights: 2,
    lodgingRatePerNight: 100000,
    travelers: 4,
    supplierQuote: sq(),
    ...patch,
  });

function verify(i: TripInput) {
  const q = calculateQuote(i, days, {});
  if (!q.ok) throw new Error(q.error);
  return verifySupplierQuote(i, days, {}, q);
}

describe("견적서 항목 금액", () => {
  it("단위별로 1인 금액으로 바꾸고, 이름으로 항목 분류", () => {
    const ctx = { travelers: 4, days: 2, nights: 2, guests: 2 };
    expect(linePerPerson({ label: "차량", amount: 100000, unit: "per_day" }, ctx)).toBe(50000);
    expect(linePerPerson({ label: "호텔", amount: 100000, unit: "per_room_night" }, ctx)).toBe(100000);
    expect(linePerPerson({ label: "가이드", amount: 200000, unit: "per_group" }, ctx)).toBe(50000);
    expect(linePerPerson({ label: "?", amount: 1, unit: "unknown" }, ctx)).toBeNull();
    expect(categoryOf("전용 차량 (16인승)")).toBe("vehicle");
    expect(categoryOf("Hotel 4*")).toBe("lodging");
  });
});

describe("업체 견적 검증표", () => {
  it("시세 원가와 비교 — 업체 마진 30%까지는 적정", () => {
    const v = verify(base());
    expect(v.marketReady).toBe(true);
    expect(v.total.market).toBeCloseTo(265000);
    expect(v.total.level).toBe("ok"); // 300,000 ÷ 265,000 ≈ 1.13
    expect(verify(base({ supplierPricePerPerson: 400000 })).total.level).toBe("high");
    const low = verify(base({ supplierPricePerPerson: 200000 }));
    expect(low.total.level).toBe("low");
    expect(low.questions).toContain("요금이 시세보다 낮은데, 쇼핑·선택관광이나 현지에서 따로 받는 경비가 있나요?");
  });

  it("차량·가이드 시세가 없으면 비교하지 않는다", () => {
    const v = verify(base({ vehicleCostPerDay: 0, guideCostPerDay: 0 }));
    expect(v.marketReady).toBe(false);
    expect(v.total.level).toBe("unknown");
  });

  it("항목별 금액이 있으면 항목마다 비교하고, 합계가 1인 요금과 다르면 알린다", () => {
    const v = verify(
      base({
        supplierQuote: sq({
          lines: [
            { label: "호텔", amount: 100000, unit: "per_room_night" },
            { label: "전용 차량", amount: 200000, unit: "per_day" },
          ],
        }),
      }),
    );
    expect(v.rows.find((r) => r.key === "vehicle")).toMatchObject({ supplier: 100000, level: "high" }); // 시세 1인 50,000
    expect(v.rows.find((r) => r.key === "lodging")).toMatchObject({ supplier: 100000, level: "ok" });
    expect(v.calcIssues[0]).toContain("항목별 금액을 1인으로 합치면 200,000인데 1인 요금은 300,000");
  });

  it("포함·불포함 체크와 질문: 안 적힌 것, 팁, 인원·객실 기준, 싱글차지", () => {
    const v = verify(
      base({ travelers: 6, supplierQuote: sq({ includes: ["호텔", "차량"], excludes: ["가이드 팁", "입장료"], roomBasis: "unknown", singleSupplement: 0 }) }),
    );
    const state = Object.fromEntries(v.checklist.map((c) => [c.key, c.state]));
    expect(state).toMatchObject({ lodging: "included", vehicle: "included", guide: "missing", admission: "excluded", tip: "excluded", insurance: "missing" });
    expect(v.rows.find((r) => r.key === "admission")?.note).toBe("견적서에 불포함 — 비교에서 뺐습니다");
    expect(v.calcIssues[0]).toContain("4명 기준인데 지금 6명");
    expect(v.questions).toEqual(
      expect.arrayContaining([
        "6명일 때 1인 요금을 알려 주세요 (지금 견적은 4명 기준).",
        "1인 요금이 2인 1실 기준인지 확인 부탁드립니다.",
        "싱글차지(1인실 추가요금)를 알려 주세요.",
        "가이드가 포함인지 불포함인지 알려 주세요.",
        "여행자 보험이 포함인지 불포함인지 알려 주세요.",
        "가이드·기사 팁(경비)은 1인 얼마이고, 고객이 현지에서 내는 건가요?",
        "입장료가 불포함이면 바나힐, 호이안 요금은 고객이 현지에서 내는 건가요?",
      ]),
    );
  });
});
