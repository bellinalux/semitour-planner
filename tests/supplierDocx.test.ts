import { describe, expect, it } from "vitest";
import { needsInsurance, needsTip } from "@/lib/autoQuoteRequests";
import { supplierOptions } from "@/lib/options";
import { parseWeekdays, toSupplierQuote } from "@/lib/schemas/course";
import { toLodgingWebEstimate } from "@/lib/schemas/lodgingSearch";
import { quotePriceFor, repickSupplierPrice, supplierQuotePatch } from "@/lib/supplierQuote";
import { input } from "./fixtures";

// 실제 업체 코스표(마카오 인베스트 투어): 요일별 1인 요금(HKD), 호텔 후보 4곳, 불포함 홍콩 데이투어 1인 180 USD(최소 8인)
const raw = () =>
  toSupplierQuote({
    found: true,
    currency: "HKD",
    pricePerPerson: 0,
    basisTravelers: 0,
    minTravelers: 4,
    hotels: "골든드래곤 호텔(4성), 그랜드드래곤 호텔(4성), 리젠시 아트 호텔(5성), 호텔 리비에라 마카오(5성) 중 하나",
    roomBasis: "twin",
    singleSupplement: 0,
    tiers: [],
    datePrices: [
      { nights: 3, weekdays: "일, 월, 화", pricePerPerson: 4780 },
      { nights: 3, weekdays: "수", pricePerPerson: 4880 },
      { nights: 3, weekdays: "목, 금", pricePerPerson: 5080 },
      { nights: 3, weekdays: "토", pricePerPerson: 4980 },
      { nights: 2, weekdays: "일, 월, 화, 수", pricePerPerson: 4280 },
      { nights: 2, weekdays: "목", pricePerPerson: 4380 },
      { nights: 2, weekdays: "금", pricePerPerson: 4680 },
      { nights: 2, weekdays: "토", pricePerPerson: 4480 },
    ],
    hotelNames: ["골든드래곤 호텔", "그랜드드래곤 호텔", "리젠시 아트 호텔", "호텔 리비에라 마카오"],
    optionPrices: [{ name: "홍콩 데이투어", amount: 180, currency: "USD", perGroup: false, minTravelers: 8 }],
    lines: [],
    includes: ["차량", "가이드", "단체 식사", "마카오 타워", "에그타르트"],
    excludes: ["홍콩 데이투어 (최소 8인, 인당 180USD)"],
    shopping: "",
    options: "",
    notes: "",
  })!;
const rates = async (code: string) => ({ HKD: 180, USD: 1400 })[code] ?? null;

describe("요일 표기 읽기", () => {
  it("쉼표·범위·주말·평일", () => {
    expect(parseWeekdays("일, 월, 화")).toEqual([0, 1, 2]);
    expect(parseWeekdays("목~토")).toEqual([4, 5, 6]);
    expect(parseWeekdays("금~월")).toEqual([0, 1, 5, 6]);
    expect(parseWeekdays("주말")).toEqual([0, 6]);
    expect(parseWeekdays("평일")).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("업체 코스표 — 출발 요일별 요금·옵션·호텔", () => {
  it("대표 요금이 없으면 가장 낮은 요일 요금, 호텔 이름과 옵션 금액을 남긴다", () => {
    const q = raw();
    expect(q.pricePerPerson).toBe(4280);
    expect(q.hotelNames).toHaveLength(4);
    expect(q.optionPrices[0]).toMatchObject({ name: "홍콩 데이투어", currency: "USD", minTravelers: 8 });
  });

  it("출발일 요일과 박수에 맞는 요금을 고르고, 출발일이 없으면 가장 낮은 요금(출발일 미정)", async () => {
    const i = input({ currency: "KRW", nights: 3, days: 4, departureDate: "2026-11-01" }); // 일요일
    const patch = await supplierQuotePatch(raw(), i, rates);
    expect(patch).toMatchObject({ pricingMode: "supplier", supplierPricePerPerson: 4780 * 180, minTravelers: 4 });
    expect(patch.supplierQuote?.picked?.label).toContain("일, 월, 화");
    const q = patch.supplierQuote!;
    expect(quotePriceFor(q, 4, { departureDate: "2026-11-05", nights: 3 }).price).toBe(5080 * 180); // 목
    expect(quotePriceFor(q, 4, { departureDate: "2026-11-05", nights: 2 }).price).toBe(4380 * 180);
    expect(quotePriceFor(q, 4, { nights: 3 })).toMatchObject({ price: 4780 * 180, dateLabel: expect.stringContaining("출발일 미정") });
  });

  it("출발일을 바꾸면 공급가를 다시 고르되, 사람이 고친 공급가는 그대로 둔다", async () => {
    const i = input({ currency: "KRW", nights: 3, days: 4, departureDate: "2026-11-01" });
    const patched = { ...i, ...(await supplierQuotePatch(raw(), i, rates)) };
    const sat = { ...patched, departureDate: "2026-11-07" };
    expect(repickSupplierPrice(sat)).toMatchObject({ supplierPricePerPerson: 4980 * 180 });
    expect(repickSupplierPrice({ ...sat, supplierPricePerPerson: 800000 })).toBeNull();
  });

  it("금액이 적힌 불포함 일정은 선택 옵션으로 (USD를 앱 통화로 바꿔 원가, 최소 인원)", async () => {
    const i = input({ currency: "KRW", nights: 3, options: [] });
    const patch = await supplierQuotePatch(raw(), i, rates);
    const [opt] = supplierOptions(patch.supplierQuote!, i);
    expect(opt).toMatchObject({ name: "홍콩 데이투어", costPerPerson: 180 * 1400, minParticipants: 8 });
    expect(opt.pricePerPerson).toBeGreaterThan(opt.costPerPerson);
    // 이미 같은 이름이 있으면 다시 넣지 않는다
    expect(supplierOptions(patch.supplierQuote!, { ...i, options: [opt] })).toEqual([]);
  });
});

describe("호텔 이름으로 숙박 시세", () => {
  it("호텔별 범위를 남기고, 전체 범위는 요금을 찾은 호텔들의 최저~최고", () => {
    const est = toLodgingWebEstimate(
      {
        rateLow: 1,
        rateHigh: 2,
        basis: "searched",
        cityTaxPerPersonPerNight: 0,
        areaNote: "",
        sourceName: "Agoda",
        priceNote: "",
        hotels: [
          { name: "골든드래곤 호텔", rateLow: 90000, rateHigh: 120000, found: true, sourceName: "Agoda" },
          { name: "리젠시 아트 호텔", rateLow: 0, rateHigh: 0, found: false, sourceName: "" },
          { name: "호텔 리비에라 마카오", rateLow: 110000, rateHigh: 150000, found: true, sourceName: "Booking.com" },
        ],
      },
      { destination: "마카오", lodgingType: "hotel", hotelGrade: "4", currency: "KRW", hotelNames: ["골든드래곤 호텔", "리젠시 아트 호텔", "호텔 리비에라 마카오"] },
    );
    expect(est).toMatchObject({ rateLow: 90000, rateHigh: 150000 });
    expect(est.hotels?.map((h) => h.found)).toEqual([true, false, true]);
  });
});

describe("팁·보험 자동 채우기 대상", () => {
  it("비어 있으면 채우고, 업체 견적서가 팁을 따로 적었거나 보험 포함이면 넣지 않는다", async () => {
    const i = input({ tipPerPerson: 0, insurancePerPerson: 0, tripScope: "overseas", supplierQuote: null });
    expect(needsTip(i)).toBe(true);
    expect(needsInsurance(i)).toBe(true);
    expect(needsTip({ ...i, tripScope: "domestic" })).toBe(false);
    const patch = await supplierQuotePatch({ ...raw(), excludes: ["가이드 팁"], includes: ["여행자보험"] }, i, rates);
    const withQuote = { ...i, ...patch };
    expect(needsTip(withQuote)).toBe(false);
    expect(needsInsurance(withQuote)).toBe(false);
  });
});

describe("차량·가이드 일수", () => {
  it("자유 일정만 있는 날(가이드/차량 미포함)은 세지 않는다", async () => {
    const { groundDays } = await import("@/lib/itinerary");
    const { item, linearDay } = await import("./fixtures");
    const days = [
      linearDay(1, [item("f", { type: "flight", name: "도착", stayMinutes: 0 }), item("a", { name: "세나도 광장" }), item("h", { type: "hotel", name: "호텔" })]),
      linearDay(2, [item("free", { type: "free_time", name: "자유 일정 (가이드/차량 미포함)", stayMinutes: 600 })]),
      linearDay(3, [item("t", { type: "transfer", name: "공항 이동" }), item("f2", { type: "flight", name: "출발", stayMinutes: 0 })]),
    ];
    expect(groundDays(days, {})).toBe(2);
  });
});
