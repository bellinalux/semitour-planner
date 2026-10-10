import { describe, expect, it } from "vitest";
import { auditPlan, currenciesOf } from "@/lib/costAudit";
import { DEFAULT_COMPANY } from "@/lib/company";
import { calculateQuote } from "@/lib/cost";
import { departureView, departureNoticeText, weeklyDates, type DayTourCostInput } from "@/lib/dayTour";
import { departureNotice } from "@/lib/departureNotice";
import { DICT, foreignDuration, foreignMoney } from "@/lib/foreignDoc";
import { buildGuideSheet, fieldReport, guideLogSchema, guideSheetSchema } from "@/lib/guideSheet";
import { inquiryDate, inquirySchema } from "@/lib/inquiry";
import { packingList, packingText } from "@/lib/packingList";
import { changeNotice, diffVersions, makeVersion } from "@/lib/quoteVersions";
import { monthlyStats } from "@/lib/salesStats";
import type { Booking } from "@/lib/bookings";
import type { QuoteLogEntry } from "@/lib/quoteLog";
import type { QuoteData } from "@/types";
import { input, item, linearDay } from "./fixtures";

const won = (v: number) => `${v.toLocaleString("ko-KR")}원`;
const days = [
  linearDay(1, [item("오행산", { admission: "enter", entryFee: 10000 }), item("미케 비치 수영", { stayMinutes: 90 })]),
  linearDay(2, [item("린응사 사원", { admission: "enter" }), item("점심", { type: "meal", mealCost: 15000 })]),
  linearDay(3, [item("한 시장")]),
];
const quoteOf = (i = input()) => calculateQuote(i, days, {}) as QuoteData;

describe("준비물", () => {
  it("해외·일정 내용·날씨로 고른다", () => {
    const g = packingList(input({ tripScope: "overseas" }), days, {}, { voltage: "220V A·C타입", currency: "베트남 동(VND)", visa: "45일 무비자", weather: "낮 32도 우기", timeDifference: "", emergency: "", embassy: "", searched: true } as never);
    const all = g.flatMap((x) => x.items).join("\n");
    expect(all).toContain("여권");
    expect(all).toContain("멀티 어댑터");
    expect(all).toContain("수영복");
    expect(all).toContain("어깨·무릎");
    expect(all).toContain("우산");
    expect(all).toContain("선크림");
    expect(packingText(g)).toMatch(/^\[서류\]\n☐ 여권/);
  });

  it("국내는 신분증·어댑터 없음", () => {
    const all = packingList(input({ tripScope: "domestic" }), days, {}).flatMap((x) => x.items);
    expect(all).toContain("신분증");
    expect(all.some((x) => x.includes("어댑터"))).toBe(false);
  });
});

describe("출발 전 안내문", () => {
  it("일정·현지 미팅·비상연락·준비물이 들어간다", () => {
    const i = input({ customerName: "김철수", departureDate: "2026-11-10", nights: 2, days: 3 });
    const text = departureNotice({ input: i, days, pmChoice: {}, meta: null, company: { ...DEFAULT_COMPANY, name: "세미투어", emergencyContact: "010-1234-5678" } });
    expect(text).toContain("[세미투어] 김철수님");
    expect(text).toContain("2박 3일");
    expect(text).toContain("호텔 로비에서 미팅");
    expect(text).toContain("010-1234-5678");
    expect(text).toContain("☐");
  });
});

describe("견적 버전", () => {
  it("가격·인원·일정·선택관광 차이를 줄로 보여 준다", () => {
    const i1 = input({ travelers: 4 });
    const a = makeVersion({ input: i1, days, pmChoice: {}, quote: quoteOf(i1), meta: null }, "처음");
    const i2 = input({ travelers: 6, options: [{ id: "o", name: "야경 투어", dayNo: 1, pricePerPerson: 30000, costPerPerson: 20000, minParticipants: 2, durationMinutes: 120 } as never] });
    const days2 = days.map((d, k) => (k === 2 ? linearDay(3, [item("한 시장"), item("용다리")]) : d));
    const b = makeVersion({ input: i2, days: days2, pmChoice: {}, quote: calculateQuote(i2, days2, {}) as QuoteData, meta: null }, "수정");
    const d = diffVersions(a, b, won);
    expect(d.lines.some((l) => l.startsWith("인원: 4명 → 6명"))).toBe(true);
    expect(d.lines).toContain("선택관광 추가: 야경 투어 (1인 30,000원)");
    expect(d.lines).toContain("DAY 3: 추가 용다리");
    expect(changeNotice(a, b, won, "김철수")).toContain("[견적 변경 안내] 김철수님");
  });

  it("같은 내용이면 차이 없음", () => {
    const a = makeVersion({ input: input(), days, pmChoice: {}, quote: quoteOf(), meta: null }, "a");
    expect(diffVersions(a, { ...a, id: "x", label: "b" }, won).lines).toEqual([]);
  });
});

describe("외국어 일정표", () => {
  it("일본어·중국어 사전과 시간·금액 표기", () => {
    expect(Object.keys(DICT.ja)).toEqual(Object.keys(DICT.en));
    expect(Object.keys(DICT.zh)).toEqual(Object.keys(DICT.en));
    expect(foreignDuration("ja", 90)).toMatch(/1時間30分/);
    expect(foreignDuration("zh", 90)).toMatch(/1小时30分/);
    expect(foreignMoney("en", 1000, "KRW")).toContain("1,000");
  });
});

describe("가이드 운영 페이지", () => {
  it("일정표 표와 같은 줄로 만들고 스키마를 통과한다", () => {
    const i = input({ customerName: "김철수 가족" });
    const sheet = buildGuideSheet({ input: i, days, pmChoice: {}, quote: quoteOf(i), meta: null, company: { ...DEFAULT_COMPANY, name: "세미투어" } }, [{ name: "김철수", room: 3, note: "" } as never]);
    expect(guideSheetSchema.safeParse(sheet).success).toBe(true);
    expect(sheet.days).toHaveLength(3);
    expect(sheet.days[1].rows[0].title).toContain("호텔 로비 미팅");
    expect(sheet.names[0]).toMatchObject({ name: "김철수", room: 3 });
    expect(sheet.notes.find((n) => n.label === "고객·단체")?.value).toBe("김철수 가족");
  });

  it("현장 기록 → 보고서", () => {
    expect(guideLogSchema.safeParse({ type: "모름", text: "x" }).success).toBe(false);
    const log = guideLogSchema.parse({ type: "일정 변경", text: "비로 오행산 → 박물관", day: 2, consent: "yes", by: "가이드 박" });
    const r = fieldReport({ title: "다낭 3일", period: "11.10~11.12" }, { progress: { a: "x" }, logs: [{ ...log, at: "2026-11-11T05:00:00Z" }] });
    expect(r).toContain("진행 체크 1건 · 기록 1건");
    expect(r).toContain("DAY 2 [일정 변경] 비로 오행산 → 박물관 (고객 동의) — 가이드 박");
  });
});

describe("견적 요청 접수", () => {
  it("필수 칸과 자동 입력 막기", () => {
    expect(inquirySchema.safeParse({ name: "김", contact: "010-1111-2222", destination: "다낭", travelers: 4 }).success).toBe(true);
    expect(inquirySchema.safeParse({ name: "김", contact: "010-1111-2222", destination: "다낭", travelers: 4, website: "spam" }).success).toBe(false);
    expect(inquirySchema.safeParse({ name: "", contact: "010", destination: "다낭", travelers: 0 }).success).toBe(false);
    expect(inquiryDate("2026-12-01")).toBe("2026-12-01");
    expect(inquiryDate("12월 초")).toBe("");
  });
});

describe("월별 실적", () => {
  const q = (at: string, marginRate: number) => ({ id: at, at, author: "", action: "print", document: "견적서", destination: "다낭", departureDate: "", days: 3, nights: 2, travelers: 4, currency: "KRW", pricePerPerson: 1, totalPrice: 4, marginRate, channel: "직판" }) as QuoteLogEntry;
  const b = (createdAt: string, status: Booking["status"], totalPrice: number) => ({ id: createdAt + status, createdAt, updatedAt: createdAt, status, currency: "KRW", totalPrice }) as Booking;
  it("빈 달은 0, 성약은 계약 이후 상태만", () => {
    const rows = monthlyStats([q("2026-09-03T00:00:00Z", 20), q("2026-09-20T00:00:00Z", 10), q("2026-10-01T00:00:00Z", 15)], [b("2026-09-10T00:00:00Z", "paid", 3000000), b("2026-09-11T00:00:00Z", "cancelled", 9), b("2026-10-02T00:00:00Z", "quoted", 9)], 3, new Date(2026, 9, 10));
    expect(rows.map((r) => r.month)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(rows[0]).toMatchObject({ quotes: 0, won: 0, revenue: 0, avgMargin: null });
    expect(rows[1]).toMatchObject({ quotes: 2, won: 1, revenue: 3000000, avgMargin: 15 });
    expect(rows[2]).toMatchObject({ quotes: 1, won: 0 });
  });
});

describe("원가 점검", () => {
  const today = new Date("2026-10-10T09:00:00Z");
  it("환율 2% 넘게 오르면 경고, 원가 30일 지나면 경고, 지난 출발일", () => {
    const i = input({ currency: "USD", exchangeRateToKrw: 1300, departureDate: "2026-10-01", costSource: { vehicle: { at: "2026-08-01T00:00:00Z" } } as never });
    expect(currenciesOf(i)).toEqual(["USD"]);
    const flags = auditPlan(i, { USD: 1350 }, today).map((f) => f.text);
    expect(flags[0]).toMatch(/^USD 환율 \+3\.8%/);
    expect(flags.some((t) => t.startsWith("원가 확인 70일 지남 (차량)"))).toBe(true);
    expect(flags.some((t) => t.startsWith("출발일이 지났습니다"))).toBe(true);
  });

  it("변동이 작고 최신이면 없음", () => {
    expect(auditPlan(input({ currency: "KRW", departureDate: "2026-12-01" }), {}, today)).toEqual([]);
  });
});

describe("합류형 근교 투어", () => {
  const c = {
    stops: [{ name: "남이섬", area: "", kind: "sight", lat: 0, lng: 0, stayMinutes: 120, entryFee: 16000, parkingFee: 0, note: "" }],
    legs: [
      { mode: "vehicle", km: 63, minutes: 80, route: "", transitFare: 0, toll: 4000, basis: "searched" },
      { mode: "vehicle", km: 63, minutes: 80, route: "", transitFare: 0, toll: 4000, basis: "searched" },
    ],
    baseName: "서울",
    start: "09:00",
    length: "full",
    transport: "vehicle",
    travelers: 10,
    guide: true,
    currency: "KRW",
    settings: { vehicleMethod: "charter", fuelPrice: 0, kmPerL: 0, deadheadKm: 0, driverDay: 0, driverMeal: 0, overtimePerHour: 0, vehicleFixedDay: 0, charterDay: 400000, charterHalf: 250000, charterToll: true, charterParking: true, guideDay: 200000, guideHalf: 120000, guideMeal: 0, insurancePerPerson: 0, marginRate: 20 },
  } as DayTourCostInput;
  const today = new Date(2026, 9, 10);

  it("요일 반복 출발일", () => {
    expect(weeklyDates("2026-10-10", 2, [6, 0])).toEqual(["2026-10-10", "2026-10-11", "2026-10-17", "2026-10-18"]);
    expect(weeklyDates("bad", 2, [6])).toEqual([]);
  });

  it("모집 중 / 확정 / 마감 / 2일 전 미달 / 지난 출발", () => {
    const v = (date: string, sold: number) => departureView(c, 80000, { date, sold }, 6, 12, today);
    expect(v("2026-10-20", 3).status).toBe("모집 중");
    expect(v("2026-10-20", 6).status).toBe("출발 확정");
    expect(v("2026-10-20", 12).status).toBe("마감");
    expect(v("2026-10-12", 3)).toMatchObject({ status: "취소 안내 필요", daysLeft: 2 });
    expect(v("2026-10-09", 8).status).toBe("지난 출발");
    // 인원이 많을수록 이익이 커진다 (고정비를 나눔)
    expect(v("2026-10-20", 10).profit).toBeGreaterThan(v("2026-10-20", 6).profit);
    expect(v("2026-10-20", 0).profit).toBe(0);
  });

  it("확정·취소 안내 글", () => {
    const d = departureView(c, 80000, { date: "2026-10-12", sold: 3 }, 6, 12, today);
    expect(departureNoticeText("남이섬 투어", d, 6, false)).toContain("최소 인원 6명에 못 미쳐");
    expect(departureNoticeText("남이섬 투어", d, 6, true)).toContain("[출발 확정] 남이섬 투어 2026-10-12");
  });
});
