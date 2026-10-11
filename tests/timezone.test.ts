import { describe, expect, it } from "vitest";
import { computeItemTimings, dayTourStart } from "@/lib/dayLoad";
import { dayWindow } from "@/lib/feasibility";
import { applyFlightWithMeals } from "@/lib/flightApply";
import { originMismatch, originOfCourse, renameOrigin } from "@/lib/flightOrigin";
import { diffText, flightMinutes, offsetOn, recalcFlightDay, zoneOf, zonesOfDay } from "@/lib/timezone";
import { flight, item, linearDay } from "./fixtures";

// 김해 출발 업체 코스 — 항공 시각 없이 AI가 비행 5시간 40분을 그대로 적은 모양 (시차 미반영)
const gimhaeDay1 = () =>
  linearDay(1, [
    item("dep", { type: "flight", name: "김해 국제 공항 출발", fixedTime: "19:50", stayMinutes: 0, travelMinutesToNext: 340 }),
    item("arr", { type: "flight", name: "방콕 수안나품 국제공항 도착", description: "B게이트 나와서 4번 출구 쪽 미팅피켓", stayMinutes: 40, travelMinutesToNext: 100 }),
    item("h", { type: "hotel", name: "호텔 새벽 체크인", stayMinutes: 0 }),
  ], { overnightCity: "파타야" });

describe("시차표·노선 비행시간", () => {
  it("공항·도시 이름으로 나라와 시차", () => {
    expect(zoneOf("김해 국제 공항 출발")).toMatchObject({ country: "한국", key: "김해" });
    expect(zoneOf("방콕 수안나품 국제공항 도착")).toMatchObject({ country: "태국", offset: 7 });
    expect(diffText(zoneOf("인천")!, zoneOf("방콕")!)).toBe("한국보다 2시간 느림");
    expect(diffText(zoneOf("인천")!, zoneOf("도쿄")!)).toBe("한국과 시차 없음");
    // 유럽 서머타임 (3월 마지막 일요일 ~ 10월 마지막 일요일)
    expect(offsetOn(zoneOf("파리")!, "2026-07-01")).toBe(2);
    expect(offsetOn(zoneOf("파리")!, "2026-12-01")).toBe(1);
  });

  it("노선 비행시간 — 김해는 동남아가 조금 짧고, 돌아오는 편은 편서풍으로 짧다", () => {
    expect(flightMinutes(zoneOf("인천")!, zoneOf("방콕")!)).toBe(360);
    expect(flightMinutes(zoneOf("김해")!, zoneOf("방콕")!)).toBe(340);
    expect(flightMinutes(zoneOf("방콕")!, zoneOf("김해")!)).toBe(320);
    expect(flightMinutes(zoneOf("파리")!, zoneOf("인천")!)).toBe(760);
    expect(flightMinutes(zoneOf("방콕")!, zoneOf("다낭")!)).toBeNull();
  });
});

describe("항공 다시 계산 — 비행시간 + 시차 = 현지 시각 차이", () => {
  it("김해 19:50 출발 → 방콕 현지 23:30 도착, 새벽 도착일로", () => {
    const d = recalcFlightDay(gimhaeDay1());
    expect(d.items[0]).toMatchObject({ travelMinutesToNext: 220, flightInfo: { minutes: 340, tzMinutes: -120, estimated: true } });
    expect(computeItemTimings(d.items, dayTourStart(d)).get("arr")?.start).toBe("23:30");
    expect(dayWindow(d, {}).kind).toBe("arrival-night");
  });

  it("일정표에서 공항을 바꾸면 그 노선으로 (김해 → 인천: 6시간, 현지 차이 4시간)", () => {
    const d = gimhaeDay1();
    const renamed = { ...d, items: d.items.map((i) => (i.id === "dep" ? { ...i, name: "인천 국제공항 출발" } : i)) };
    expect(recalcFlightDay(renamed, undefined, true).items[0]).toMatchObject({ travelMinutesToNext: 240, flightInfo: { minutes: 360, tzMinutes: -120 } });
  });

  it("시각 앞 나라 — 출발 전은 한국, 도착 뒤는 태국", () => {
    const d = gimhaeDay1();
    const z = zonesOfDay(d, d.items, "파타야");
    expect([...z.entries()].map(([id, zone]) => `${id}:${zone.country}`)).toEqual(["dep:한국", "arr:태국", "h:태국"]);
  });

  it("항공편 적용 — 일정이 김해인데 인천 항공편이면 이름을 인천으로, 실제 비행시간·시차를 남긴다", () => {
    const f = flight({ departAirport: "인천(ICN)", departTime: "19:50", arriveAirport: "방콕(BKK)", arriveTime: "23:50", returnDepartAirport: "방콕(BKK)", returnArriveAirport: "인천(ICN)" });
    const days = applyFlightWithMeals([gimhaeDay1(), linearDay(2, [item("a")])], f);
    expect(days[0].items[0].name).toBe("인천(ICN) 출발");
    expect(days[0].items[0]).toMatchObject({ travelMinutesToNext: 240, flightInfo: { minutes: 360, tzMinutes: -120, estimated: false } });
  });
});

describe("출발지 맞추기", () => {
  it("원문 출발 공항, 입력·항공편과 다르면 알리고, 일정 공항 이름을 바꾸면 다시 계산", () => {
    const days = [gimhaeDay1(), linearDay(2, [item("a")]), linearDay(3, [item("out", { type: "flight", name: "방콕 출발" }), item("in", { type: "flight", name: "김해 도착" })])];
    expect(originOfCourse(days)).toBe("김해");
    expect(originMismatch(days, "인천", null)?.text).toContain("일정 김해 출발 · 입력 출발지 인천");
    expect(originMismatch(days, "부산", null)).toBeNull();
    const renamed = renameOrigin(days, "인천");
    expect(renamed[0].items[0].name).toBe("인천 국제공항 출발");
    expect(renamed[2].items[1].name).toBe("인천 국제공항 도착");
    expect(renamed[0].items[0].flightInfo?.minutes).toBe(360);
    expect(originMismatch(renamed, "인천", null)).toBeNull();
  });
});
