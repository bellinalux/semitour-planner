import { describe, expect, it } from "vitest";
import { calculateQuote } from "@/lib/cost";
import { DEFAULT_COMPANY } from "@/lib/company";
import { bookRequestSchema } from "@/lib/inquiry";
import { itineraryQuality } from "@/lib/itineraryQuality";
import { restAfter } from "@/lib/itineraryDoc";
import { computeItemTimings, dayTourStart } from "@/lib/dayLoad";
import { addGround, addHotel, emptyRates, findHotel, gradeMatches, hotelScore, pickRate, supplierObsFromQuote, type RateObs } from "@/lib/rateBook";
import { buildSharedItinerary } from "@/lib/shareItinerary";
import { bookingSummary, requestText, serviceLines } from "@/lib/supplierBookings";
import type { QuoteData } from "@/types";
import { input, item, linearDay } from "./fixtures";

const now = new Date("2026-10-10T00:00:00Z");
const obs = (p: Partial<RateObs>): RateObs => ({ at: "2026-10-01T00:00:00Z", month: 11, low: 80000, high: 100000, currency: "KRW", source: "web", by: "아고다", ...p });

describe("회사 요금표 — 쓸 요금 고르기", () => {
  it("업체 견적가(6개월·같은 시즌) → 웹 시세(30일) → 없음", () => {
    const supplier = obs({ source: "supplier", by: "○○랜드사", low: 70000, high: 70000, at: "2026-07-01T00:00:00Z", month: 11 });
    const web = obs({});
    expect(pickRate([web, supplier], "KRW", 12, now)?.obs.source).toBe("supplier");
    // 시즌이 다르면(5월) 업체가 대신 웹 시세
    expect(pickRate([web, supplier], "KRW", 5, now)?.obs.source).toBe("web");
    // 웹 시세가 30일 넘으면 없음
    expect(pickRate([obs({ at: "2026-08-01T00:00:00Z" })], "KRW", 0, now)).toBeNull();
    // 다른 통화는 쓰지 않는다
    expect(pickRate([web], "USD", 0, now)).toBeNull();
    expect(pickRate([supplier], "KRW", 0, now)?.basis).toBe("3개월 전 ○○랜드사 견적가");
  });

  it("호텔 카드 합치기·이름 찾기·점수", () => {
    let d = addHotel(emptyRates("다낭"), { name: "노보텔 다낭 (Novotel)", grade: "4성급", korean: true, agencies: ["하나투어"] }, obs({}), now);
    d = addHotel(d, { name: "노보텔 다낭", agencies: ["모두투어"] }, obs({ source: "supplier", by: "랜드사" }), now);
    expect(d.hotels).toHaveLength(1);
    const h = findHotel(d, "노보텔다낭")!;
    expect(h).toMatchObject({ grade: "4성급", korean: true, agencies: ["하나투어", "모두투어"] });
    expect(h.rates).toHaveLength(2);
    expect(hotelScore(h)).toBe(2 + 2 + 2);
    expect(gradeMatches("4성급", "4")).toBe(true);
    expect(gradeMatches("4성급", "3-4")).toBe(true);
    expect(gradeMatches("5성급", "3-4")).toBe(false);
    expect(gradeMatches("리조트", "resort")).toBe(true);
    expect(addGround(d, "vehicle", "16인승", obs({ high: 0 }))).toBe(d);
  });

  it("업체 견적서 항목 → 호텔 1박·차량/가이드 1일 기록", () => {
    const r = supplierObsFromQuote(
      {
        lines: [
          { label: "호텔 (2인 1실)", amount: 55, unit: "per_room_night" },
          { label: "16인승 차량", amount: 120, unit: "per_day" },
          { label: "한국어 가이드", amount: 60, unit: "per_day" },
          { label: "입장료", amount: 20, unit: "per_person" },
        ],
        hotelNames: ["골든 베이", "므엉탄"],
        originalCurrency: "usd",
      },
      "다낭 랜드사",
      11,
      now,
    );
    expect(r.hotels.map((h) => [h.name, h.obs.high, h.obs.currency, h.obs.source])).toEqual([
      ["골든 베이", 55, "USD", "supplier"],
      ["므엉탄", 55, "USD", "supplier"],
    ]);
    expect(r.ground.map((g) => [g.kind, g.obs.high])).toEqual([
      ["vehicle", 120],
      ["guide", 60],
    ]);
  });
});

describe("일찍 끝나는 날 — 오후 자유시간", () => {
  it("15시 전에 끝나면 18시까지 자유시간, 마지막 날·쉬는 날은 빼고", () => {
    const days = [linearDay(1, [item("a", { stayMinutes: 120 })]), linearDay(2, [item("b", { stayMinutes: 120 })]), linearDay(3, [item("c", { stayMinutes: 600 })])];
    const t = (i: number) => computeItemTimings(days[i].items, dayTourStart(days[i]));
    expect(restAfter(days, 0, {}, t(0))).toMatchObject({ id: "rest-pm", type: "free_time", name: "오후 자유시간 (호텔 휴식 또는 개별 관광)" });
    expect(restAfter([...days.slice(0, 2)], 1, {}, t(1))).toBeNull();
    expect(restAfter(days, 2, {}, t(2))).toBeNull();
    const rest = [linearDay(1, [item("a")], { rest: "pmfree" }), days[1]];
    expect(restAfter(rest, 0, {}, computeItemTimings(rest[0].items, dayTourStart(rest[0])))).toBeNull();
    const arrival = [linearDay(1, [item("f", { type: "flight", stayMinutes: 60 }), item("a", { stayMinutes: 60 })]), days[1]];
    expect(restAfter(arrival, 0, {}, computeItemTimings(arrival[0].items, dayTourStart(arrival[0])))?.name).toBe("호텔 체크인 및 휴식 (자유시간)");
  });
});

describe("업체 수배·확정", () => {
  const i = input({ travelers: 5, guestsPerUnit: 2, departureDate: "2026-10-20", vehicleCostPerDay: 100000, guideCostPerDay: 50000, selectedHotels: { 다낭: { name: "노보텔" } as never }, options: [{ id: "o1", name: "야경 투어", dayNo: 2, pricePerPerson: 30000, minParticipants: 4 } as never] });
  const days = [linearDay(1, [item("a"), item("l", { type: "meal", name: "점심 현지식", mealCost: 10000 })]), linearDay(2, [item("b")]), linearDay(3, [item("c")], { overnightCity: "" })];
  it("일정에서 수배할 것을 뽑는다", () => {
    const lines = serviceLines(i, days, {});
    expect(lines.map((l) => `${l.kind}:${l.label}`)).toEqual(["hotel:노보텔", "vehicle:전용 차량", "guide:한국어 가이드", "meal:점심 현지식", "option:야경 투어"]);
    expect(lines[0].detail).toBe("2026.10.20(화) 체크인 · 2박 · 3실 (5명)");
  });
  it("출발 14일 안 미확정 경고·업체별 요청 문구", () => {
    const lines = serviceLines(i, days, {});
    const s = bookingSummary(lines, { hotel: { supplier: "", state: "confirmed", requestedAt: "", confirmNo: "", note: "" } as never, [lines[0].key]: { supplier: "노보텔", state: "confirmed", requestedAt: "", confirmNo: "A1", note: "" } }, 10);
    expect(s.confirmed).toBe(1);
    expect(s.urgent.map((l) => l.kind)).toEqual(["vehicle", "guide", "meal", "option"]);
    expect(bookingSummary(lines, {}, 30).urgent).toEqual([]);
    expect(requestText("다낭 3일", "ABC랜드", lines.slice(1, 3), "세미투어")).toContain("· 차량: 전용 차량 — DAY 1~3 (3일) · 5명");
  });
});

describe("일정표 품질 점수", () => {
  it("항목 6개 합계와 올리는 방법", () => {
    const days = [linearDay(1, [item("a", { reason: "인기 1위", timeCheck: { basis: "area", checkedAt: "" } }), item("b")]), linearDay(2, [item("c")])];
    const q = itineraryQuality(input({ vehicleCostPerDay: 100000, costStatus: { ...input().costStatus, vehicle: "confirmed" } }), days, {}, [80]);
    expect(q.parts.map((p) => p.key)).toEqual(["reason", "route", "pace", "needs", "cost", "time"]);
    expect(q.parts.find((p) => p.key === "reason")!.score).toBeCloseTo(6.7, 1);
    expect(q.parts.find((p) => p.key === "needs")!.score).toBe(10);
    expect(q.total).toBe(Math.round(q.parts.reduce((s, p) => s + p.score, 0)));
    expect(q.parts.find((p) => p.key === "reason")!.fix).toBeTruthy();
  });
});

describe("고객 웹 일정표 — 일본어·예약 요청", () => {
  it("일본어 링크는 고정 글을 일본어로, 선택관광·예약 요청 칸", () => {
    const i = input({ departureDate: "2026-11-05", options: [{ id: "o", name: "야경 투어", dayNo: 1, pricePerPerson: 30000, minParticipants: 2 } as never] });
    const days = [linearDay(1, [item("a", { name: "세나도 광장" })]), linearDay(2, [item("b", { name: "마카오 타워" })])];
    const quote = calculateQuote(i, days, {}) as QuoteData;
    const s = buildSharedItinerary({ input: i, days, pmChoice: {}, quote, meta: null, company: DEFAULT_COMPANY }, true, now, [], { "세나도 광장": "セナド広場" }, "ja");
    expect(s.lang).toBe("ja");
    expect(s.days[0].items[0].name).toBe("セナド広場");
    expect(s.notices.at(-1)).toMatch(/[ぁ-んァ-ン一-龥]/);
    expect(s.priceLine).not.toMatch(/[가-힣]/);
    expect(s.bookable).toBe(true);
    expect(s.options[0]).toMatchObject({ name: "야경 투어", day: 1 });
    expect(bookRequestSchema.safeParse({ name: "김", contact: "010-1111-2222", travelers: 2, website: "x" }).success).toBe(false);
  });
});
