import { describe, expect, it } from "vitest";
import { isOvernightStay, tidyDays, tidyItems, timeRange } from "@/lib/dayTidy";
import { enforceMealWindows } from "@/lib/mealTiming";
import { item, linearDay } from "./fixtures";

describe("식사 시간 맞춤 자유시간", () => {
  it("점심까지 30분 이하로 남으면 자유시간을 넣지 않는다 (11시대 점심은 그대로)", () => {
    // 08:00 시작 + 관광 160분 + 이동 20분 = 11:00 → 11:30까지 30분 → 넣지 않음
    const out = enforceMealWindows([item("s", { stayMinutes: 160, travelMinutesToNext: 20 }), item("l", { type: "meal", name: "점심 식당" })], "08:00");
    expect(out.map((i) => i.type)).toEqual(["sightseeing", "meal"]);
  });

  it("많이 이르면(30분 넘게) 그때만 자유시간", () => {
    const out = enforceMealWindows([item("s", { stayMinutes: 90, travelMinutesToNext: 10 }), item("l", { type: "meal", name: "점심 식당" })], "08:00");
    expect(out.map((i) => i.type)).toEqual(["sightseeing", "free_time", "meal"]);
    expect(out[1].stayMinutes).toBe(110);
  });
});

describe("일정 정리", () => {
  it("20분 안 되는 자유시간은 빼고, 30분 자유시간은 둔다", () => {
    const out = tidyItems([item("a"), item("f", { type: "free_time", name: "자유시간", stayMinutes: 10 }), item("b"), item("g", { type: "free_time", name: "자유시간", stayMinutes: 30 })]);
    expect(out.map((i) => i.id)).toEqual(["a", "b", "g"]);
  });

  it("그날 마지막 숙소(투숙)는 체류시간 0, 낮에 들르는 숙소(체크인·휴식)는 그대로", () => {
    const items = [item("a"), item("h1", { type: "hotel", name: "호텔 체크인 후 휴식", stayMinutes: 60 }), item("b"), item("h2", { type: "hotel", name: "호텔 투숙", stayMinutes: 60, travelMinutesToNext: 15 })];
    expect(isOvernightStay(items, 1)).toBe(false);
    expect(isOvernightStay(items, 3)).toBe(true);
    const out = tidyItems(items);
    expect(out[1].stayMinutes).toBe(60);
    expect(out[3]).toMatchObject({ stayMinutes: 0, travelMinutesToNext: null });
  });

  it("마지막 날 숙소 뒤에 공항 이동·항공만 있으면 그 숙소도 투숙 (체크아웃 전)", () => {
    const items = [item("a"), item("h", { type: "hotel", name: "호텔 체크아웃", stayMinutes: 30 }), item("t", { type: "transfer", name: "공항 이동" }), item("f", { type: "flight", name: "귀국" })];
    expect(isOvernightStay(items, 1)).toBe(true);
  });

  it("바꿀 게 없으면 같은 객체 (불필요한 다시 그리기 없음)", () => {
    const days = [linearDay(1, [item("a"), item("h", { type: "hotel", name: "투숙", stayMinutes: 0, travelMinutesToNext: null })])];
    expect(tidyDays(days)).toBe(days);
  });

  it("시각 표시 — 머무는 시간이 없으면 도착 시각만", () => {
    expect(timeRange({ start: "21:00", end: "21:00" })).toBe("21:00");
    expect(timeRange({ start: "09:00", end: "10:30" }, "–")).toBe("09:00–10:30");
  });
});
