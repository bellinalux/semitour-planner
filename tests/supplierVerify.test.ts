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

  it("업체 몫 추정 = 1인 공급가 − 우리 시세 원가, 호텔 이름으로 찾은 숙박 시세 수", () => {
    const hotelRates = [
      { name: "A 호텔", rateLow: 90000, rateHigh: 110000, found: true, sourceName: "Agoda" },
      { name: "B 호텔", rateLow: 0, rateHigh: 0, found: false, sourceName: "" },
    ];
    const v = verify(base({ supplierQuote: sq({ hotelRates }) }));
    expect(v.supplierShare).toMatchObject({ amount: 35000, hotelsFound: 1 });
    expect(v.supplierShare!.rate).toBeCloseTo((35000 / 300000) * 100);
    expect(verify(base({ vehicleCostPerDay: 0, guideCostPerDay: 0 })).supplierShare).toBeNull();
  });

  it("업체 요금에 든 숙박·가이드 시세가 비어 있으면 반쪽 원가로 판정하지 않는다 (업체 몫도 내지 않음)", () => {
    const v = verify(base({ guideCostPerDay: 0 }));
    expect(v.total.level).toBe("unknown");
    expect(v.total.note).toContain("가이드 시세가 없어 비교가 불완전합니다");
    expect(v.supplierShare).toBeNull();
    const noHotel = verify(base({ lodgingRatePerNight: 0 }));
    expect(noHotel.total.note).toContain("숙박 (2인 1실) 시세가 없어");
  });

  it("포함 사항에 숙박이 없어도 상품에 호텔이 적혀 있으면 숙박 포함으로 본다 (묻지 않는다)", () => {
    const v = verify(base({ supplierQuote: sq({ includes: ["차량", "가이드"], hotels: "골든드래곤 호텔(4성) 등 중 하나" }) }));
    expect(v.checklist.find((c) => c.key === "lodging")).toMatchObject({ state: "included" });
    expect(v.questions.some((q) => q.startsWith("숙박이 포함인지"))).toBe(false);
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

describe("업체 견적 검증표 — 요금 없음·옵션 요금·최소 인원·미확정 호텔", () => {
  it("빼 둔 옵션 요금, 최소 인원 미달, 미확정 호텔, 요금 문의를 알린다", () => {
    const v = verify(
      base({
        travelers: 3,
        supplierPricePerPerson: 0,
        pricingMode: "target_margin",
        supplierQuote: sq({
          pricePerPerson: 0,
          originalPrice: 0,
          suspectPrice: 180,
          originalCurrency: "USD",
          minTravelers: 4,
          hotels: "골든드래곤(4성), 리젠시 아트(5성) 중 하나",
        }),
      }),
    );
    expect(v.calcIssues.join(" ")).toContain("180 USD는 불포함·선택관광 요금으로 보여 공급가로 넣지 않았습니다");
    expect(v.calcIssues.join(" ")).toContain("최소 출발 인원은 4명인데 지금 3명");
    expect(v.questions).toEqual(
      expect.arrayContaining([
        "이 상품의 1인 요금(2인 1실 기준)을 알려 주세요.",
        "3명으로 출발할 수 있는지, 가능하면 그때 1인 요금을 알려 주세요 (최소 4명 조건).",
        "호텔이 확정되지 않았습니다 (골든드래곤(4성), 리젠시 아트(5성) 중 하나). 확정 호텔 이름을 알려 주세요.",
      ]),
    );
  });
});

describe("업체 견적 검증표 — 요일별 요금·항공 포함 여부", () => {
  it("메모에 요일별 요금이 있으면 확인을 알리고, 코스에 항공편이 있는데 포함 여부가 없으면 묻는다", () => {
    const withFlight = [linearDay(1, [item("f", { name: "인천 출발", type: "flight" }), item("a", { name: "바나힐", entryFee: 50000 })]), ...days.slice(1)];
    const i = base({ supplierQuote: sq({ notes: "3박 4일(일,월,화 4780HKD / 수 4880HKD / 토 4980HKD)" }) });
    const q = calculateQuote(i, withFlight, {});
    if (!q.ok) throw new Error(q.error);
    const v = verifySupplierQuote(i, withFlight, {}, q);
    expect(v.calcIssues.join(" ")).toContain("요일·시즌별 요금이 따로 있습니다");
    expect(v.questions).toContain("출발일(요일·시즌)에 맞는 1인 요금을 확정해 주세요.");
    expect(v.questions).toContain("코스의 항공편(항공권)이 요금에 포함인가요, 불포함인가요?");
  });
});
