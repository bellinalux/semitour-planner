import { describe, expect, it } from "vitest";
import { compressWalkRuns, cuisineWord, dayMealIssues, fitCourse, isGenericMeal, mergeMeals, nearestOrder, pullMeals, slotMeals } from "@/lib/courseFit";
import { computeItemTimings, dayTourStart } from "@/lib/dayLoad";
import { tidyDays } from "@/lib/dayTidy";
import { heavyReasons } from "@/lib/pace";
import type { DayPlan, ItineraryItem } from "@/types";
import { item, linearDay } from "./fixtures";

// 마카오 노노 패키지 1일차 — 업체 원문을 코스 읽기로 읽은 그대로 (장소마다 20~30분, 저녁이 21:30)
const MACAU: [string, string, number, number][] = [
  ["flight", "인천국제공항 출발", 0, 180],
  ["flight", "마카오 공항 도착 및 가이드 미팅", 30, 20],
  ["meal", "점심 식사 (굴국수)", 50, 20],
  ["sightseeing", "탑석광장", 20, 10],
  ["sightseeing", "라자로 성당", 20, 0],
  ["sightseeing", "알베르게1601", 20, 10],
  ["sightseeing", "몬테요새", 30, 10],
  ["sightseeing", "성바울 성당", 30, 0],
  ["sightseeing", "육포거리", 20, 10],
  ["sightseeing", "성도미니크 성당", 20, 0],
  ["sightseeing", "세나도 광장", 30, 20],
  ["sightseeing", "카르모 성당", 20, 10],
  ["sightseeing", "타이파 빌리지", 30, 0],
  ["sightseeing", "쿤하 거리", 30, 10],
  ["sightseeing", "주택박물관", 30, 20],
  ["meal", "저녁 식사 (포르투갈식)", 70, 20],
  ["sightseeing", "윈팰리스 호텔 분수쇼 및 야경 투어", 40, 20],
  ["hotel", "호텔 투숙", 0, 0],
];
const macau = (restaurant = false): DayPlan[] => [
  linearDay(
    1,
    MACAU.map(([type, name, stay, next], k) =>
      item(`m${k}`, { type: (restaurant && name === "알베르게1601" ? "meal" : type) as ItineraryItem["type"], name, stayMinutes: stay, travelMinutesToNext: next, ...(restaurant && name === "알베르게1601" ? { cuisine: "포르투갈 요리" } : {}) }),
    ),
    { meetingTime: "09:50" },
  ),
  linearDay(2, [item("x")]),
];
const startOf = (d: DayPlan, name: string) => computeItemTimings(d.items, dayTourStart(d)).get(d.items.find((i) => i.name.startsWith(name))!.id)?.start;

describe("마카오 1일차 — 저녁 23시대 문제", () => {
  it("읽은 그대로면 저녁이 21:30, 점검이 늦은 저녁을 알린다", () => {
    const [d] = tidyDays(macau());
    expect(startOf(d, "저녁 식사")).toBe("21:30");
    expect(dayMealIssues(d, {})[0]).toMatch(/^저녁이 21:30 시작 — 너무 늦음/);
  });

  it("도보 구역(역사지구 8곳)을 2시간 30분으로 줄여 저녁이 20:10, 원래 순서는 그대로", () => {
    const fit = fitCourse(tidyDays(macau()), { walk: true });
    const d = tidyDays(fit.days)[0];
    expect(fit.changes[0].note).toContain("도보 구역 8곳(탑석광장~세나도 광장) 3시간 50분 → 2시간 30분");
    expect(startOf(d, "저녁 식사")).toBe("20:10");
    expect(dayMealIssues(d, {})).toEqual([]);
    expect(d.items.map((i) => i.name).indexOf("주택박물관")).toBeLessThan(d.items.map((i) => i.name).indexOf("저녁 식사 (포르투갈식)"));
  });

  it("알베르게1601이 포르투갈 식당으로 읽히면 저녁 식사 한 줄로 합친다", () => {
    const fit = fitCourse(tidyDays(macau(true)), { walk: true });
    const d = tidyDays(fit.days)[0];
    expect(d.items.filter((i) => i.name.includes("알베르게1601"))).toHaveLength(1);
    expect(d.items.find((i) => i.name.includes("알베르게1601"))?.name).toBe("저녁 식사 (포르투갈식) · 알베르게1601");
    expect(startOf(d, "저녁 식사")).toBe("19:50");
  });
});

describe("식사 다듬기 규칙", () => {
  it("일반 식사·음식 종류", () => {
    expect(isGenericMeal(item("a", { type: "meal", name: "저녁 식사 (포르투갈식)" }))).toBe(true);
    expect(isGenericMeal(item("b", { type: "meal", name: "알베르게1601" }))).toBe(false);
    expect(cuisineWord(item("a", { type: "meal", name: "저녁 식사 (포르투갈식)" }))).toBe("포르투갈");
    expect(cuisineWord(item("a", { type: "meal", name: "저녁 식사 (현지식)" }))).toBe("");
  });

  it("카페·디저트는 합치지 않는다", () => {
    const d = linearDay(1, [item("t", { type: "meal", name: "로드스토우 에그타르트 (포르투갈 디저트)", cuisine: "포르투갈" }), item("g", { type: "meal", name: "저녁 식사 (포르투갈식)" })]);
    expect(mergeMeals(d).note).toBeNull();
  });

  it("늦은 저녁은 구역 경계로만 당기고, 뒤에 2시간 넘게 남으면 당기지 않는다", () => {
    const sights = (n: number, stay: number, next: number) => Array.from({ length: n }, (_, k) => item(`s${k}`, { stayMinutes: stay, travelMinutesToNext: next }));
    // 08:00 시작 (190분+이동 30분) 3곳 → 19:00, 한 곳 더(80분+30분) → 저녁 20:50. 19:00 경계로 당기고 뒤 관광은 1시간 50분
    const day = linearDay(1, [...sights(3, 190, 30), item("last", { stayMinutes: 80, travelMinutesToNext: 30 }), item("d", { type: "meal", name: "저녁 식사", stayMinutes: 60 }), item("n", { name: "야경 투어" })], { meetingTime: "08:00" });
    const r = pullMeals(day);
    expect(r.note).toBe("저녁 20:50 → 19:00");
    expect(r.day.items.map((i) => i.id)).toEqual(["s0", "s1", "s2", "d", "last", "n"]);
    // 뒤에 남는 관광이 길면 그대로
    const long = linearDay(1, [...sights(3, 200, 30), ...sights(2, 150, 30).map((x, k) => ({ ...x, id: `t${k}` })), item("d", { type: "meal", name: "저녁 식사", stayMinutes: 60 })]);
    expect(pullMeals(long).note).toBeNull();
  });

  it("도보 구역이 짧으면 그대로", () => {
    const d = linearDay(1, Array.from({ length: 5 }, (_, k) => item(`w${k}`, { stayMinutes: 15, travelMinutesToNext: 5 })));
    expect(compressWalkRuns(d).note).toBeNull();
  });
});

describe("원문 시각·쉬는 시간", () => {
  it("원문 시각까지 기다려 시작하고, 못 지키면 점검", () => {
    const d = linearDay(1, [item("a", { stayMinutes: 30 }), item("m", { name: "가이드 미팅", fixedTime: "11:30", stayMinutes: 10 })], { meetingTime: "09:00" });
    expect(computeItemTimings(d.items, dayTourStart(d)).get("m")?.start).toBe("11:30");
    const late = linearDay(1, [item("a", { stayMinutes: 240 }), item("s", { name: "분수쇼", fixedTime: "11:00" })], { meetingTime: "09:00" });
    expect(dayMealIssues(late, {})[0]).toMatch(/^분수쇼: 원문 시각 11:00인데 13:00에 시작/);
  });

  it("식사를 기다리는 자유시간은 힘든 날 계산에서 뺀다", () => {
    const d = linearDay(2, [item("a", { stayMinutes: 300 }), item("f", { type: "free_time", stayMinutes: 200 }), item("b", { stayMinutes: 60 })]);
    expect(heavyReasons(d, {})).toEqual([]);
  });
});

describe("일자별 재정렬 — 식사 자리 맞추기·가까운 순서", () => {
  it("이른 점심은 뒤로(12:00 근처), 밤 일정은 저녁 뒤에", () => {
    const d = linearDay(
      1,
      [
        item("a", { name: "오행산", stayMinutes: 60, travelMinutesToNext: 30 }),
        item("l", { type: "meal", name: "점심 식사", stayMinutes: 60, travelMinutesToNext: 30 }),
        item("b", { name: "린응사", stayMinutes: 60, travelMinutesToNext: 30 }),
        item("c", { name: "한 시장", stayMinutes: 60, travelMinutesToNext: 30 }),
      ],
      { meetingTime: "08:00" },
    );
    const r = slotMeals(d);
    // 11:00(1시간 이름)보다 12:30(30분 늦음)이 12:00에 더 가깝다
    expect(r.note).toBe("점심 09:30 → 12:30");
    expect(r.day.items.filter((i) => !i.id.includes("-free-")).map((i) => i.id)).toEqual(["a", "b", "c", "l"]);
  });

  it("좌표로 가까운 곳부터 (식사는 제자리)", () => {
    const at = (id: string, lat: number, lng: number) => item(id, { lat, lng, travelMinutesToNext: 30 });
    const items = [at("far", 16.2, 108.3), at("near", 16.07, 108.22), at("mid", 16.12, 108.25), item("lunch", { type: "meal", name: "점심" })];
    const out = nearestOrder([at("start", 16.06, 108.22), ...items]);
    expect(out.map((i) => i.id)).toEqual(["start", "near", "mid", "far", "lunch"]);
  });
});
