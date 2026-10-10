import { describe, expect, it } from "vitest";
import { bookingAlerts, type Booking } from "@/lib/bookings";
import { buildListing, listingCsv, listingText } from "@/lib/channelExport";
import { calculateQuote } from "@/lib/cost";
import { dayTourShare, type DayTourCostInput, type DayTourSettings } from "@/lib/dayTour";
import { assignRooms, dueChecklist, roomingTsv, settle, type Participant } from "@/lib/opsStore";
import { reviewIdsIn, summarizeReviews } from "@/lib/reviews";
import { ruleNotices, seriesDates, seriesRows, seriesTsv, type PriceRule } from "@/lib/seriesPricing";
import { buildSharedItinerary, sharedItinerarySchema } from "@/lib/shareItinerary";
import { mergeSupplierRecords, type SupplierRecord } from "@/lib/supplierHistory";
import type { CompanyProfile } from "@/types";
import { input, item, linearDay } from "./fixtures";

const days = [
  linearDay(1, [item("a", { name: "세나도 광장" }), item("m", { name: "점심 딤섬", type: "meal", mealCost: 20000 })], { overnightCity: "마카오" }),
  linearDay(2, [item("b", { name: "콜로안 빌리지", entryFee: 10000 })]),
];
const company = { name: "스케치북트래블", phone: "02-1", email: "a@b.c" } as CompanyProfile;

describe("시리즈 출발·할인 규칙", () => {
  it("기간 안 고른 요일의 출발일", () => {
    expect(seriesDates("2026-11-01", "2026-11-30", [4])).toEqual(["2026-11-05", "2026-11-12", "2026-11-19", "2026-11-26"]);
    expect(seriesDates("2026-11-01", "2026-11-30", [])).toEqual([]);
  });

  it("업체 요일별 요금으로 회차마다 판매가, 연휴 표시, 조기 예약 할인가와 마감일", () => {
    const i = input({
      pricingMode: "supplier",
      supplierPricePerPerson: 500000,
      nights: 1,
      days: 2,
      targetMarginRate: 20,
      supplierQuote: {
        originalPrice: 500000, originalCurrency: "KRW", rate: 1, pricePerPerson: 500000, basisTravelers: 0, roomBasis: "twin", singleSupplement: 0, tiers: [], lines: [], includes: [], excludes: [], shopping: "", options: "", notes: "", readAt: "",
        datePrices: [
          { nights: 1, weekdays: [4], label: "목", pricePerPerson: 500000 },
          { nights: 1, weekdays: [5], label: "금", pricePerPerson: 600000 },
        ],
      },
    });
    const rules: PriceRule[] = [{ id: "e", kind: "early", days: 60, rate: 5 }];
    const rows = seriesRows(i, days, {}, ["2026-12-24", "2026-12-25"], rules, [{ date: "2026-12-25", name: "Christmas Day" }]);
    expect(rows[0]).toMatchObject({ weekday: "목", returnDate: "2026-12-25", priceLabel: "1박 목 출발 요금" });
    expect(rows[1].salePrice!).toBeGreaterThan(rows[0].salePrice!);
    expect(rows[0].holidays).toEqual(["Christmas Day"]);
    expect(rows[0].discounts[0]).toMatchObject({ until: "2026-10-25" });
    expect(rows[0].discounts[0].price).toBe(Math.floor((rows[0].salePrice! * 0.95) / 1000) * 1000);
    expect(seriesTsv(rows).split("\n")[0]).toBe("출발일\t요일\t귀국일\t1인 판매가\t조기 5%가 (~60일 전)\t연휴");
    expect(ruleNotices(rules)).toEqual(["조기 예약 할인: 출발 60일 전까지 예약하면 5% 할인"]);
  });
});

const person = (id: string, gender: Participant["gender"], kind: Participant["kind"] = "adult"): Participant => ({ id, name: id, kind, gender, note: "", room: 0 });

describe("명단·룸리스트·체크리스트·정산", () => {
  it("같은 성별끼리 2인 1실, 유아는 앞 보호자 방", () => {
    const r = assignRooms([person("A", "F"), person("B", "M"), person("C", "F"), person("baby", "", "infant"), person("D", "M"), person("E", "")]);
    const room = (id: string) => r.find((p) => p.id === id)!.room;
    expect(room("A")).toBe(room("C"));
    expect(room("B")).toBe(room("D"));
    expect(room("A")).not.toBe(room("B"));
    expect(room("baby")).toBe(room("C"));
    expect(new Set(r.filter((p) => p.kind !== "infant").map((p) => p.room)).size).toBe(3);
    expect(roomingTsv(r).split("\n")[0]).toBe("객실\t이름\t구분\t성별\t특이사항");
  });

  it("기한 지남·3일 안 (완료한 것은 빼고)", () => {
    const items = [
      { group: "숙소" as const, label: "객실", dueDays: 30, due: "2026.10.01(목)" },
      { group: "식당" as const, label: "식당", dueDays: 7, due: "2026.10.12(월)" },
      { group: "항공" as const, label: "항공", dueDays: 21, due: "2026.09.01(화)" },
    ];
    const r = dueChecklist(items, { 항공: { done: true, who: "", ref: "" } }, new Date(2026, 9, 10));
    expect(r.overdue.map((i) => i.label)).toEqual(["객실"]);
    expect(r.soon.map((i) => i.label)).toEqual(["식당"]);
  });

  it("견적 원가와 실제 지출로 실제 손익", () => {
    const lines = [
      { key: "vehicle", label: "차량", amount: 300000 },
      { key: "lodging", label: "숙박", amount: 500000 },
      { key: "undecided", label: "미정", amount: 100000, excluded: true },
    ];
    const r = settle(lines, 1000000, 200000, { actual: { vehicle: 350000 }, extras: [{ id: "x", label: "팁", amount: 20000 }], revenue: 0, memo: "" });
    expect(r.rows.map((x) => x.diff)).toEqual([50000, 0]);
    expect(r).toMatchObject({ quotedCost: 800000, actualCost: 870000, revenue: 1000000, profit: 130000, marginRate: 13 });
  });
});

describe("견적 후속 알림", () => {
  const b = (patch: Partial<Booking>): Booking => ({ id: "1", createdAt: "", updatedAt: "2026-10-05T09:00:00Z", owner: "", ownerId: "", customerName: "고객", phone: "", email: "", destination: "마카오", departureDate: "", days: 3, nights: 2, travelers: 4, currency: "KRW", totalPrice: 0, depositAmount: 0, paidAmount: 0, depositDue: "", balanceDue: "", status: "quoted", planName: "", memo: "", history: [], ...patch });
  it("견적 뒤 3일 답 없으면 연락, 14일 지나면 다시 견적", () => {
    expect(bookingAlerts(b({}), new Date(2026, 9, 6)).some((a) => a.text.includes("고객 연락"))).toBe(false);
    expect(bookingAlerts(b({}), new Date(2026, 9, 9)).map((a) => a.text)).toContain("견적 후 4일 답 없음 — 고객 연락");
    expect(bookingAlerts(b({}), new Date(2026, 9, 20)).some((a) => a.text.includes("다시 견적"))).toBe(true);
    expect(bookingAlerts(b({ status: "contracted" }), new Date(2026, 9, 20)).some((a) => a.text.includes("견적"))).toBe(false);
  });
});

describe("고객 후기", () => {
  it("평균 별점·항목 점수·최근 한마디, 메모의 링크 아이디", () => {
    const s = summarizeReviews("id", { title: "마카오", planName: "", company: "", createdAt: "" }, [
      { at: "1", rating: 5, scores: { guide: 5 }, comment: "좋아요", name: "김" },
      { at: "2", rating: 4, scores: { guide: 4, meal: 3 }, comment: "", name: "" },
    ]);
    expect(s).toMatchObject({ count: 2, average: 4.5, scores: { guide: 4.5, meal: 3 } });
    expect(s.comments).toEqual([{ at: "1", rating: 5, comment: "좋아요", name: "김" }]);
    expect(reviewIdsIn("메모\n후기 링크: https://x.app/r/AbCdEfGhIjKlMnOpQr12\n")).toEqual(["AbCdEfGhIjKlMnOpQr12"]);
  });
});

describe("업체 견적 기록 팀 합치기", () => {
  it("같은 id는 한 번, 최근 순", () => {
    const r = (id: string, at: string) => ({ id, at }) as SupplierRecord;
    expect(mergeSupplierRecords([r("a", "2026-10-01"), r("b", "2026-10-03")], [r("a", "2026-10-01"), r("c", "2026-10-02")]).map((x) => x.id)).toEqual(["b", "c", "a"]);
  });
});

describe("판매 채널 등록·웹 일정표", () => {
  const i = input({ destination: "마카오", departureDate: "2026-11-05", days: 2, nights: 1, travelers: 4, vehicleCostPerDay: 100000, minTravelers: 4 });
  const q = calculateQuote(i, days, {});
  if (!q.ok) throw new Error(q.error);

  it("상품명·특징·일정·포함·유의사항·태그, CSV는 한 줄 (원가 없음)", () => {
    const l = buildListing({ input: i, days, pmChoice: {}, quote: q, meta: { packageName: "마카오 핵심 2일", cities: ["마카오"], noShopping: true, noOption: false, hotelGrade: "", highlights: [] }, usps: [{ title: "노쇼핑", reason: "쇼핑 없이 관광만" }] });
    const text = listingText(l);
    expect(text).toContain("【상품명】 마카오 핵심 2일");
    expect(text).toContain("DAY 1: 세나도 광장 → 점심 딤섬(식사)");
    expect(text).toContain("#노쇼핑");
    expect(text).toContain("최소 출발 인원 4명");
    expect(text).not.toMatch(/원가|마진/);
    expect(listingCsv(l).trim().split("\n")).toHaveLength(2);
  });

  it("영문 웹 일정표: 번역표로 바꾸고 영어 날짜·요금", () => {
    const en = buildSharedItinerary({ input: i, days, pmChoice: {}, quote: q, meta: null, company }, true, new Date(), [], { "세나도 광장": "Senado Square" });
    expect(sharedItinerarySchema.safeParse(en).success).toBe(true);
    expect(en.lang).toBe("en");
    expect(en.days[0].items[0].name).toBe("Senado Square");
    expect(en.period).toBe("Thu, Nov 5, 2026 – Fri, Nov 6, 2026 (1N 2D)");
    expect(en.priceLine).toMatch(/^Per person ₩/);
  });

  it("근교 투어도 웹 일정표 형식으로 (형식 검사 통과)", () => {
    const settings = { vehicleMethod: "distance", fuelPrice: 1600, kmPerL: 0, deadheadKm: 0, driverDay: 200000, driverMeal: 0, overtimePerHour: 0, vehicleFixedDay: 0, charterDay: 0, charterHalf: 0, charterToll: false, charterParking: false, guideDay: 0, guideHalf: 0, guideMeal: 0, insurancePerPerson: 0, marginRate: 20 } as DayTourSettings;
    const c: DayTourCostInput = {
      stops: [{ name: "남이섬", area: "가평", kind: "sight", lat: 0, lng: 0, stayMinutes: 120, entryFee: 16000, parkingFee: 0, note: "" }],
      legs: [
        { mode: "vehicle", km: 60, minutes: 80, route: "", transitFare: 0, toll: 0, basis: "searched" },
        { mode: "vehicle", km: 60, minutes: 80, route: "", transitFare: 0, toll: 0, basis: "searched" },
      ],
      baseName: "서울역",
      start: "09:00",
      length: "half",
      transport: "vehicle",
      travelers: 10,
      guide: false,
      currency: "KRW",
      settings,
    };
    const s = dayTourShare(c, "남이섬 반일", "소개", { lines: [], vehicle: null, guides: 0, groupTotal: 0, personTotal: 0, totalCost: 0, costPerPerson: 0, salePrice: 59000, profitPerPerson: 0, vehicleCompare: null, overtimeHours: { driver: 0, guide: 0 } }, company, true);
    expect(sharedItinerarySchema.safeParse(s).success).toBe(true);
    expect(s.days[0].items.map((x) => x.name)).toEqual(["서울역 출발", "차량으로 남이섬", "남이섬", "차량으로 서울역"]);
    expect(s.priceLine).toBe("1인 59,000 KRW");
  });
});
