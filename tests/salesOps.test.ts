import { describe, expect, it } from "vitest";
import { bookingChecklist } from "@/lib/bookingChecklist";
import { calculateQuote } from "@/lib/cost";
import { englishMoney, englishPeriod, englishTexts } from "@/lib/englishDoc";
import { applyFxPatch, fxDrift } from "@/lib/fxDrift";
import type { Booking } from "@/lib/bookings";
import type { QuoteLogEntry } from "@/lib/quoteLog";
import { salesStats, wonByPlanName } from "@/lib/salesStats";
import { buildSharedItinerary, sharedItinerarySchema } from "@/lib/shareItinerary";
import { addSupplierRecord, recordFromQuote, sameDestination, supplierNameFromFile, supplierTrends } from "@/lib/supplierHistory";
import type { CompanyProfile, SupplierQuote, TripInput } from "@/types";
import { input, item, linearDay } from "./fixtures";

const sq = (patch: Partial<SupplierQuote> = {}): SupplierQuote => ({
  originalPrice: 4780,
  originalCurrency: "HKD",
  rate: 175,
  pricePerPerson: 836500,
  basisTravelers: 0,
  roomBasis: "twin",
  singleSupplement: 0,
  tiers: [],
  lines: [],
  includes: ["호텔", "차량"],
  excludes: ["가이드 경비"],
  shopping: "",
  options: "",
  notes: "",
  readAt: "2026-10-05T00:00:00.000Z",
  ...patch,
});

describe("환율 변동", () => {
  const i = input({ pricingMode: "supplier", currency: "KRW", supplierPricePerPerson: 836500, supplierQuote: sq({ datePrices: [{ nights: 3, weekdays: [4], label: "목", pricePerPerson: 836500 }], picked: { price: 836500, label: "3박 목" } }) });

  it("받을 때 환율보다 오르면 변화율과 바뀐 공급가", () => {
    const d = fxDrift(i, 180)!;
    expect(d.code).toBe("HKD");
    expect(d.changePct).toBe(2.9);
    expect(d.priceNow).toBe(Math.round(836500 * (180 / 175)));
  });

  it("원화 견적·환율 모름·같은 통화는 보지 않는다", () => {
    expect(fxDrift({ ...i, supplierQuote: sq({ rate: null }) }, 180)).toBeNull();
    expect(fxDrift({ ...i, supplierQuote: sq({ originalCurrency: "KRW" }) }, 1)).toBeNull();
    expect(fxDrift({ ...i, pricingMode: "target_margin" }, 180)).toBeNull();
  });

  it("지금 환율로 공급가·요일별 요금·고른 요금을 함께 바꾼다", () => {
    const p = applyFxPatch(i, 180);
    expect(p.supplierPricePerPerson).toBe(860400);
    expect(p.supplierQuote!.rate).toBe(180);
    expect(p.supplierQuote!.datePrices![0].pricePerPerson).toBe(860400);
    expect(p.supplierQuote!.picked!.price).toBe(860400);
    expect(fxDrift({ ...i, ...p } as TripInput, 180)!.changePct).toBe(0);
  });
});

describe("업체 견적 기록", () => {
  it("파일 이름에서 업체 이름", () => {
    expect(supplierNameFromFile("261005 노노 패키지(마카오) 인베스트 투어.docx")).toBe("인베스트 투어");
    expect(supplierNameFromFile("하나로여행 견적.pdf")).toBe("하나로여행 견적");
  });

  it("같은 여행지를 모으고, 같은 업체의 지난 요금과 견준다 (원문 통화 기준)", () => {
    const base = { destination: "마카오", nights: 3, days: 4, currency: "KRW" as const, supplierPricePerPerson: 0 };
    const a = { ...recordFromQuote(sq({ originalPrice: 4580, pricePerPerson: 801500 }), base, "인베스트 투어.docx", "마카오 노노", new Date("2026-09-01")), id: "a" };
    const b = { ...recordFromQuote(sq(), base, "0105 인베스트 투어.docx", "마카오 노노", new Date("2026-10-05")), id: "b" };
    const c = { ...recordFromQuote(sq({ originalPrice: 5000 }), { ...base, destination: "다낭" }, "다낭 견적.docx", "", new Date("2026-10-06")), id: "c" };
    const list = [c, b, a];
    expect(sameDestination(list, "마카오, 홍콩").map((r) => r.id)).toEqual(["b", "a"]);
    const trend = supplierTrends(sameDestination(list, "마카오"));
    expect(trend).toHaveLength(1);
    expect(trend[0]).toMatchObject({ supplier: "인베스트 투어", changePct: 4.4 });
    expect(b.pricePerPerson).toBe(836500);
  });

  it("같은 파일·같은 요금을 다시 읽으면 바꿔 넣는다", () => {
    const base = { destination: "마카오", nights: 3, days: 4, currency: "KRW" as const, supplierPricePerPerson: 0 };
    const r1 = recordFromQuote(sq(), base, "x.docx", "");
    const r2 = recordFromQuote(sq(), base, "x.docx", "");
    expect(addSupplierRecord(addSupplierRecord([], r1), r2)).toHaveLength(1);
  });
});

const days = [
  linearDay(1, [item("a", { name: "세나도 광장" }), item("m", { name: "점심 딤섬", type: "meal", mealCost: 20000 }), item("t", { name: "마카오 타워", entryFee: 30000, caution: "사전 예약 필요" })], { overnightCity: "마카오" }),
  linearDay(2, [item("b", { name: "콜로안 빌리지" }), item("l", { name: "현지식", type: "meal", mealCost: 15000, payment: "local" })]),
];

describe("예약 확인 체크리스트", () => {
  it("숙소·식당·입장권·보험을 기한(출발 D-n)과 함께, 현지 지불 식사는 빼고", () => {
    const i = input({ departureDate: "2026-11-05", packageType: "land_hotel", nights: 1, days: 2, vehicleCostPerDay: 100000, insurancePerPerson: 5000 });
    const list = bookingChecklist(i, days, {}, 6);
    const labels = list.map((c) => c.label);
    expect(labels.some((l) => l.startsWith("마카오 숙소 객실 확정"))).toBe(true);
    expect(labels).toContain("DAY 1 점심 딤섬 6명 예약");
    expect(labels.some((l) => l.includes("현지식"))).toBe(false);
    const tower = list.find((c) => c.label.includes("마카오 타워"))!;
    expect(tower).toMatchObject({ dueDays: 14 });
    expect(tower.due).toBe("2026.10.22(목)");
    expect(labels).toContain("여행자보험 6명 가입");
    // 기한이 먼 것부터
    expect(list[0].dueDays).toBeGreaterThanOrEqual(list[list.length - 1].dueDays);
  });
});

const quote = (patch: Partial<QuoteLogEntry>): QuoteLogEntry => ({
  id: Math.random().toString(36),
  at: "2026-10-01T00:00:00Z",
  author: "",
  action: "print",
  document: "견적서",
  destination: "마카오",
  departureDate: "2026-11-05",
  days: 4,
  nights: 3,
  travelers: 4,
  currency: "KRW",
  pricePerPerson: 900000,
  totalPrice: 3600000,
  marginRate: 18,
  channel: "직판",
  ...patch,
});
const booking = (patch: Partial<Booking>): Booking => ({
  id: Math.random().toString(36),
  createdAt: "",
  updatedAt: "",
  owner: "",
  ownerId: "",
  customerName: "고객",
  phone: "",
  email: "",
  destination: "마카오",
  departureDate: "2026-11-05",
  days: 4,
  nights: 3,
  travelers: 4,
  currency: "KRW",
  totalPrice: 3600000,
  depositAmount: 0,
  paidAmount: 0,
  depositDue: "",
  balanceDue: "",
  status: "quoted",
  planName: "",
  memo: "",
  history: [],
  ...patch,
});

describe("견적 성과", () => {
  it("여행지별·가격대별 성약률과 성약 건 마진 (문의 단계는 빼고)", () => {
    const s = salesStats(
      [quote({}), quote({ destination: "다낭", travelers: 6, pricePerPerson: 600000, marginRate: 25 })],
      [booking({ status: "paid", planName: "마카오 노노" }), booking({ status: "cancelled" }), booking({ status: "inquiry" }), booking({ destination: "다낭", travelers: 6, totalPrice: 3600000, status: "contracted" })],
    );
    expect(s).toMatchObject({ totalQuotes: 2, totalDecided: 3, totalWon: 2, winRate: 66.7, avgQuoteMargin: 21.5 });
    const macau = s.byDestination.find((r) => r.key === "마카오")!;
    expect(macau).toMatchObject({ decided: 2, won: 1, winRate: 50, avgWonPrice: 900000, avgWonMargin: 18 });
    expect(s.byPriceBand.find((r) => r.key === "50~100만 원")).toMatchObject({ won: 2 });
    expect(wonByPlanName([booking({ status: "paid", planName: "마카오 노노" }), booking({ status: "quoted", planName: "마카오 노노" })]).get("마카오 노노")).toBe(1);
  });
});

const company = { name: "스케치북트래블", phone: "02-123-4567", email: "a@b.c" } as CompanyProfile;

describe("고객용 웹 일정표·영문 문서", () => {
  const i = input({ destination: "마카오", departureDate: "2026-11-05", days: 2, nights: 1, travelers: 4, vehicleCostPerDay: 100000 });
  const q = calculateQuote(i, days, {});
  if (!q.ok) throw new Error(q.error);

  it("고객에게 나가는 것만 담고 형식 검사를 통과한다 (요금 숨기기 가능)", () => {
    const s = buildSharedItinerary({ input: i, days, pmChoice: {}, quote: q, meta: null, company }, false);
    expect(sharedItinerarySchema.safeParse(s).success).toBe(true);
    expect(s.priceLine).toBe("");
    expect(s.days[0].items.map((x) => x.name)).toEqual(["세나도 광장", "점심 딤섬", "마카오 타워"]);
    // 둘째 날은 호텔 미팅 줄이 먼저 온다 (첫 장소 = 미팅 + 이동)
    expect(s.days[1].items[0].name).toBe("호텔 로비 미팅 후 출발");
    expect(s.days[1].items.find((x) => x.name === "현지식")!.note).toContain("현지 지불");
    expect(JSON.stringify(s)).not.toMatch(/원가|마진|margin/);
    expect(buildSharedItinerary({ input: i, days, pmChoice: {}, quote: q, meta: null, company }, true).priceLine).toMatch(/^1인 /);
  });

  it("영문 문서는 한글이 든 글만 번역 대상으로, 날짜·금액은 영어 표기", () => {
    const texts = englishTexts({ input: i, days, pmChoice: {}, quote: q, meta: null, company });
    expect(texts).toContain("세나도 광장");
    expect(texts).toContain("스케치북트래블");
    expect(new Set(texts).size).toBe(texts.length);
    expect(englishPeriod(i)).toBe("Thu, Nov 5, 2026 – Fri, Nov 6, 2026");
    expect(englishMoney(1234567, "KRW")).toBe("₩1,234,567");
  });
});
