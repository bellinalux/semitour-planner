import { describe, expect, it } from "vitest";
import { closedIssues, weekdayOf } from "@/lib/closedDays";
import { addPlace, differentiate, samePlace } from "@/lib/differentiate";
import { freeSlots, optionFromCard, slotCandidates } from "@/lib/freeSlots";
import { dayIntensity, intensityText, tripIntensity } from "@/lib/intensity";
import { emptyCity, mergeResearch, type ResearchResult } from "@/lib/knowledge";
import { lineup } from "@/lib/lineup";
import { insertDays, renumber, shiftOptions, shortenOne } from "@/lib/nightsChange";
import { photoCredits, photoOf } from "@/lib/photo";
import { addHotel, emptyRates } from "@/lib/rateBook";
import type { Competitor, TourOption } from "@/types";
import { input, item, linearDay } from "./fixtures";

const kb = (places: Partial<ResearchResult["places"][number]>[]) =>
  mergeResearch(
    emptyCity("다낭"),
    { places: places.map((p) => ({ name: "", area: "", kind: "sight", popularity: 80, agencies: [], fits: [], likes: [], dislikes: [], tips: [], stayMinutes: 60, ...p })), courses: [], needs: [] } as ResearchResult,
    [],
  );

describe("휴무일 피하기", () => {
  it("출발 요일로 휴무를 찾아 문 여는 날로 옮긴다", () => {
    // 2026-11-02는 월요일 → DAY 1 월, DAY 2 화
    expect(weekdayOf({ departureDate: "2026-11-02" }, 1)).toBe(1);
    const museum = item("m", { name: "참 박물관", openHours: { mon: "closed", tue: "09:00-17:00" } });
    const days = [linearDay(1, [museum, item("a")]), linearDay(2, [item("b")])];
    const r = closedIssues({ departureDate: "2026-11-02" }, days, {});
    expect(r[0]).toMatchObject({ day: 1, name: "참 박물관", weekday: "월", toDay: 2 });
    expect(r[0].days![1].items.some((i) => i.id === "m")).toBe(true);
    expect(closedIssues({ departureDate: "" }, days, {})).toEqual([]);
  });

  it("문 여는 날이 없으면 이유", () => {
    const museum = item("m", { openHours: { mon: "closed", tue: "closed" } });
    const r = closedIssues({ departureDate: "2026-11-02" }, [linearDay(1, [museum]), linearDay(2, [item("b")])], {});
    expect(r[0].blocked).toContain("문을 여는 날");
  });
});

describe("활동 강도", () => {
  it("걷는 거리·계단으로 쉬움/보통/많이 걸음", () => {
    expect(dayIntensity(linearDay(1, [item("a", { stayMinutes: 60, travelMinutesToNext: 30 }), item("b", { stayMinutes: 60 })]), {}).level).toBe("easy");
    const walk = linearDay(1, Array.from({ length: 6 }, (_, k) => item(`w${k}`, { stayMinutes: 30, travelMinutesToNext: 5 })));
    expect(dayIntensity(walk, {}).level).toBe("moderate");
    expect(dayIntensity(linearDay(1, [item("h", { name: "오행산 등산", stayMinutes: 90 })]), {}).level).toBe("hard");
    const t = tripIntensity([walk, linearDay(2, [item("x")])], {});
    expect(t.level).toBe("moderate");
    expect(intensityText([walk], {})).toMatch(/^보통 · 하루 평균 약 \d/);
  });
});

describe("상품 등급 라인업", () => {
  it("실속·스탠다드·프리미엄 — 호텔 등급·식대·선택관광 포함, 요금표 평균", () => {
    const i = input({ packageType: "land_hotel", lodgingType: "hotel", hotelGrade: "4", nights: 2, days: 3, lodgingRatePerNight: 100000, options: [{ id: "o", name: "야경 크루즈", dayNo: 1, pricePerPerson: 50000, costPerPerson: 30000, minParticipants: 2, participationRate: 50, durationMinutes: 90, description: "", note: "" }] as TourOption[] });
    const days = [linearDay(1, [item("a"), item("l", { type: "meal", mealCost: 20000 })]), linearDay(2, [item("b")]), linearDay(3, [item("c")])];
    const book = addHotel(emptyRates("다낭"), { name: "5성 호텔", grade: "5성급" }, { at: new Date().toISOString(), month: 0, low: 200000, high: 200000, currency: "KRW", source: "supplier", by: "랜드사" });
    const t = lineup(i, days, {}, book);
    expect(t.map((x) => [x.key, x.grade])).toEqual([
      ["basic", "3"],
      ["standard", "4"],
      ["premium", "5"],
    ]);
    const prem = t[2];
    expect(prem.ratePerNight).toBe(200000);
    expect(prem.rateBasis).toBe("회사 요금표 1곳 평균");
    expect(prem.included).toEqual(["야경 크루즈"]);
    expect(prem.days[0].items[1].mealCost).toBe(28000);
    expect(t[0].salePrice!).toBeLessThan(t[1].salePrice!);
    expect(t[2].salePrice!).toBeGreaterThan(t[1].salePrice!);
  });
});

describe("박수 바꾸기", () => {
  it("줄이기: 가벼운 가운데 날을 빼고 장소는 다른 날로, 날 번호·선택관광 날짜를 맞춘다", () => {
    const days = [linearDay(1, [item("a")]), linearDay(2, [item("b", { reason: "인기 1위" }), item("c", { reason: "인기 2위" })]), linearDay(3, [item("d")]), linearDay(4, [item("e")])];
    const r = shortenOne(days, {})!;
    expect(r.removedDay).toBe(3);
    expect(r.days.map((d) => d.day)).toEqual([1, 2, 3]);
    expect(r.moved[0]).toMatch(/^d → DAY \d$/);
    const opts = shiftOptions([{ dayNo: 3 } as TourOption, { dayNo: 4 } as TourOption, { dayNo: 1 } as TourOption], 3, null);
    expect(opts.map((o) => o.dayNo)).toEqual([0, 3, 1]);
  });

  it("늘리기: 마지막 날이 항공이면 그 앞에 넣는다", () => {
    const days = [linearDay(1, [item("a")]), linearDay(2, [item("f", { type: "flight" })])];
    const r = insertDays(days, [linearDay(99, [item("n")])]);
    expect(r.insertedAt).toBe(2);
    expect(r.days.map((d) => d.items[0].id)).toEqual(["a", "n", "f"]);
    expect(renumber(r.days).map((d) => d.day)).toEqual([1, 2, 3]);
  });
});

describe("자유시간 선택관광", () => {
  it("쉬는 날·일찍 끝나는 날과 지식 창고 후보", () => {
    const days = [linearDay(1, [item("a", { stayMinutes: 120 })]), linearDay(2, [item("x")], { rest: "free" }), linearDay(3, [item("z")])];
    const slots = freeSlots(days, {});
    expect(slots.map((s) => [s.day, s.kind])).toEqual([
      [1, "일찍 끝나는 날 오후"],
      [2, "전일 자유"],
    ]);
    const doc = kb([{ name: "미케 비치 야시장", kind: "night", fits: ["couple"] }, { name: "x", kind: "activity" }, { name: "바나힐", kind: "sight" }]);
    const c = slotCandidates(doc, days, [], ["couple"]);
    expect(c[0].name).toBe("미케 비치 야시장");
    expect(c.map((p) => p.name)).not.toContain("x");
    expect(optionFromCard(c[0], 2)).toMatchObject({ name: "미케 비치 야시장", dayNo: 2, category: "night", pricePerPerson: 0 });
  });
});

describe("경쟁 상품 대비 차별화", () => {
  const comp = (agency: string, places: string[]) => ({ id: agency, name: `${agency} 다낭`, price: 1, includes: {}, shopping: "unknown", optionTour: "unknown", note: "", source: { agency, url: "", sourceName: "", basis: "searched", foundAt: "" }, itinerary: { found: true, days: [{ day: 1, title: "", places, meals: { breakfast: "", lunch: "", dinner: "" }, hotel: "", free: false }] } }) as unknown as Competitor;
  it("공통·우리만·빠진 인기와 USP, 넣기", () => {
    const days = [linearDay(1, [item("a", { name: "바나힐 (Ba Na Hills)" }), item("b", { name: "참 박물관" })])];
    const d = differentiate(days, {}, [comp("하나투어", ["바나힐", "오행산"]), comp("모두투어", ["바나힐", "오행산"])], null);
    expect(d.common.map((p) => [p.name, p.agencies.length])).toEqual([["바나힐 (Ba Na Hills)", 2]]);
    expect(d.oursOnly.map((p) => p.name)).toEqual(["참 박물관"]);
    expect(d.missing.map((p) => p.name)).toEqual(["오행산"]);
    expect(d.usp[0]).toContain("다른 여행사 상품에 없는 참 박물관");
    const r = addPlace(days, {}, d.missing[0], null)!;
    expect(r.days[0].items.at(-1)).toMatchObject({ name: "오행산", reason: "다른 여행사 2곳 포함" });
    expect(samePlace("오행산(마블마운틴)", "오행산")).toBe(true);
  });
});

describe("장소 사진", () => {
  it("올린 사진 먼저, 공용 사진은 위키미디어 주소만, 출처 모으기", () => {
    expect(photoOf({ photo: "data:image/png;base64,xx" })?.credit).toBe("");
    expect(photoOf({ photoUrl: "https://upload.wikimedia.org/a.jpg", photoCredit: "사진: A · CC BY-SA 4.0 · 위키미디어 공용" })?.src).toBe("https://upload.wikimedia.org/a.jpg");
    expect(photoOf({ photoUrl: "https://evil.example/a.jpg" })).toBeNull();
    const days = [linearDay(1, [item("a", { name: "바나힐", photoUrl: "https://upload.wikimedia.org/a.jpg", photoCredit: "사진: A · CC BY-SA 4.0" })])];
    expect(photoCredits(days, {})).toEqual(["바나힐: 사진: A · CC BY-SA 4.0"]);
  });
});
