import { describe, expect, it } from "vitest";
import { computeItemTimings, dayMeetingTime, dayTourStart, hotelLeadMinutes, morningFreeItems } from "@/lib/dayLoad";
import { tidyItems } from "@/lib/dayTidy";
import { dayStructureIssues, fixDayStructure, mergeFreeRuns } from "@/lib/dayStructure";
import { fitCourse } from "@/lib/courseFit";
import { dayTable } from "@/lib/itineraryDoc";
import { enforceMealWindows, isMealFiller, refitMealWindows } from "@/lib/mealTiming";
import { item, linearDay } from "./fixtures";

const breakfast = item("bf", { type: "meal", name: "호텔 조식", travelMinutesToNext: 10 });
const pool = item("pool", { type: "free_time", name: "자유시간", description: "호텔 수영장 및 부대시설 이용", stayMinutes: 150, travelMinutesToNext: 20 });
const lunch = item("lunch", { type: "meal", name: "점심 식사", stayMinutes: 60, travelMinutesToNext: 20 });
const sight = item("s", { name: "왓 야나 상완", stayMinutes: 60 });
const filler = item("lunch-free-0", { type: "free_time", name: "자유시간", description: "다음 식사 시간에 맞춰 비워 둔 자유시간입니다.", stayMinutes: 40 });

describe("오전 자유 — 조식 뒤 자유시간은 미팅 전", () => {
  it("자유시간 뒤 점심이면 11:30 도착에 맞춰 미팅 (이동 20분 → 11:10), 자유시간에는 시각을 매기지 않는다", () => {
    const day = linearDay(2, [pool, lunch, sight]);
    expect(morningFreeItems(day.items)).toEqual([pool]);
    expect(hotelLeadMinutes(day)).toBe(20);
    expect(dayMeetingTime(day)).toBe("11:10");
    const t = computeItemTimings(day.items, dayTourStart(day));
    expect(t.has("pool")).toBe(false);
    expect(t.get("lunch")).toEqual({ start: "11:30", end: "12:30" });
  });

  it("자유시간 뒤 관광이면 10:00 미팅, 직접 정한 미팅은 그대로", () => {
    expect(dayMeetingTime(linearDay(2, [pool, sight]))).toBe("10:00");
    expect(dayMeetingTime(linearDay(2, [pool, sight], { meetingTime: "09:00" }))).toBe("09:00");
  });

  it("전일 자유·체크아웃 뒤 공항 이동은 오전 자유가 아니다", () => {
    expect(morningFreeItems([item("f", { type: "free_time" })])).toEqual([]);
    expect(morningFreeItems([item("f", { type: "free_time" }), item("t", { type: "transfer" }), item("fl", { type: "flight" })])).toEqual([]);
  });

  it("오전 자유 뒤 점심 앞에는 식사 맞춤 자유시간을 끼우지 않는다", () => {
    const day = linearDay(2, [pool, lunch]);
    expect(enforceMealWindows(day.items, dayTourStart(day))).toEqual(day.items);
  });
});

describe("식사 맞춤 — 자유시간을 두 줄로 나누지 않는다", () => {
  it("저녁 앞이 자유시간이면 그 자유시간을 늘리고, 다시 맞출 때 되돌린다", () => {
    const pm = item("pm", { type: "free_time", name: "오후 자유시간", stayMinutes: 120, travelMinutesToNext: 20 });
    const dinner = item("dinner", { type: "meal", name: "저녁 식사" });
    const out = enforceMealWindows([sight, pm, dinner], "13:00");
    expect(out.some(isMealFiller)).toBe(false);
    expect(out[1]).toMatchObject({ id: "pm", stayMinutes: 220, mealPadMinutes: 100 });
    const again = refitMealWindows(out, "13:00");
    expect(again[1]).toMatchObject({ stayMinutes: 220, mealPadMinutes: 100 });
    // 관광이 길어지면 늘린 만큼 줄어든다
    const longer = refitMealWindows([{ ...sight, stayMinutes: 120 }, out[1], dinner], "13:00");
    expect(longer[1]).toMatchObject({ stayMinutes: 160, mealPadMinutes: 40 });
  });

  it("관광 뒤 바로 식사면 예전처럼 자유시간 한 줄", () => {
    const out = enforceMealWindows([sight, lunch], "08:00");
    expect(out.filter(isMealFiller)).toHaveLength(1);
  });
});

describe("일정 구성 점검·정리", () => {
  // 붙여 주신 방콕 DAY 2: 조식(코스) → 수영장 자유시간 08:00 → 이동 20분 → 식사 맞춤 자유시간 → 점심 11:30
  const bangkok = linearDay(2, [breakfast, pool, filler, lunch, sight], { meetingTime: "08:00" });

  it("조식이 코스에 있음·자유시간 연달아·오전 자유인데 이른 미팅", () => {
    const issues = dayStructureIssues(bangkok);
    expect(issues).toHaveLength(3);
    expect(issues[0]).toContain("호텔 조식이 코스 항목");
    expect(issues[1]).toContain("자유시간이 연달아");
    expect(issues[2]).toContain("미팅이 08:00");
    expect(issues[2]).toContain("11:10 호텔 로비 미팅");
  });

  it("한 번에 고치기 → 수영장 자유시간 한 줄, 11:10 미팅, 11:30 점심", () => {
    const fixed = fixDayStructure(bangkok);
    expect(fixed.items.map((i) => i.id)).toEqual(["pool", "lunch", "s"]);
    expect(fixed.meetingTime).toBeUndefined();
    expect(dayMeetingTime(fixed)).toBe("11:10");
    expect(computeItemTimings(fixed.items, dayTourStart(fixed)).get("lunch")?.start).toBe("11:30");
    expect(dayStructureIssues(fixed)).toEqual([]);
    expect(fixDayStructure(fixed)).toBe(fixed);
  });

  it("재정렬(fitCourse)에서도 정리된다", () => {
    const r = fitCourse([bangkok], { walk: false, slot: true });
    expect(r.days[0].items.map((i) => i.id)).toEqual(["pool", "lunch", "s"]);
    expect(r.changes[0].note).toContain("정리");
  });

  it("자유시간 합치기 — 구체적인 이름·설명을 남기고 시간은 합", () => {
    const a = item("a", { type: "free_time", name: "자유시간", stayMinutes: 30 });
    const b = item("b", { type: "free_time", name: "호텔 휴식", description: "수영장", stayMinutes: 60, travelMinutesToNext: 15 });
    expect(mergeFreeRuns([a, b, lunch])).toEqual([{ ...a, name: "호텔 휴식", description: "수영장", stayMinutes: 90, travelMinutesToNext: 15 }, lunch]);
  });

  it("호텔 조식은 정리할 때 빼고, 돈 내는 조식 맛집은 남긴다", () => {
    const paid = item("pho", { type: "meal", name: "쌀국수 조식 (포 호아)", mealCost: 8000 });
    expect(tidyItems([breakfast, paid, sight]).map((i) => i.id)).toEqual(["pho", "s"]);
  });
});

describe("문서 일정표 — 호텔 조식 후 자유시간 → 미팅 → 이동 → 점심", () => {
  it("자유시간 줄이 미팅보다 먼저, 그 뒤 이동 줄은 미팅 이동으로", () => {
    const day = linearDay(2, [pool, lunch, sight]);
    const days = [linearDay(1, [sight]), day];
    const t = dayTable(days, 1, {}, { vehicle: true, flight: { out: "", back: "" }, selectedHotels: {} }, computeItemTimings(day.items, dayTourStart(day)));
    expect(t.rows.map((r) => r.kind)).toEqual(["item", "meeting", "move", "item", "move", "item"]);
    expect(t.rows[0]).toMatchObject({ key: "pool", afterBreakfast: true, start: "" });
    expect(t.rows[1]).toMatchObject({ start: "11:10", keyTime: true });
    expect(t.rows[2].minutes).toBe(20);
    expect(t.rows[3]).toMatchObject({ key: "lunch", start: "11:30", keyTime: true, afterBreakfast: false });
  });
});
