import { describe, expect, it } from "vitest";
import { calcDayEnd, calcDayGap, computeItemTimings, shiftClock } from "@/lib/dayLoad";
import { isKoreanDestination } from "@/lib/korea";
import { enforceMealWindows } from "@/lib/mealTiming";
import { item, linearDay } from "./fixtures";

describe("식사 시간대 보정", () => {
  it("점심이 11:30보다 이르면 앞에 자유시간을 넣는다", () => {
    const out = enforceMealWindows([item("s", { stayMinutes: 60 }), item("l", { type: "meal", name: "점심 식당" })], "08:00");
    expect(out.map((i) => i.type)).toEqual(["sightseeing", "free_time", "meal"]);
    expect(out[1].stayMinutes).toBe(150); // 09:00 → 11:30
  });
  it("이미 시간대를 지난 저녁은 당기지 않는다", () => {
    const out = enforceMealWindows([item("s", { stayMinutes: 660 }), item("d", { type: "meal", name: "석식" })], "08:00");
    expect(out).toHaveLength(2);
  });
});

describe("하루 시각 계산", () => {
  it("항목별 시작·종료 시각을 이어 붙인다 (조식은 제외)", () => {
    const t = computeItemTimings([item("b", { type: "meal", name: "호텔 조식" }), item("a", { stayMinutes: 90, travelMinutesToNext: 30 }), item("c", { stayMinutes: 60 })], "08:00");
    expect(t.has("b")).toBe(false);
    expect(t.get("c")).toEqual({ start: "10:00", end: "11:00" });
  });

  it("시각은 10분 단위로 끊는다 (5분 단위 체류·이동은 다음 10분으로)", () => {
    const t = computeItemTimings([item("a", { stayMinutes: 45, travelMinutesToNext: 10 }), item("b", { stayMinutes: 70, travelMinutesToNext: 15 }), item("c", { stayMinutes: 60 })], "08:00");
    expect(t.get("a")).toEqual({ start: "08:00", end: "08:50" });
    expect(t.get("b")).toEqual({ start: "09:00", end: "10:10" });
    expect(t.get("c")).toEqual({ start: "10:30", end: "11:30" });
  });

  it("항공 항목은 실제 시각 그대로, 다음 일정은 10분 단위로", () => {
    const t = computeItemTimings([item("f", { type: "flight", stayMinutes: 0, travelMinutesToNext: 0 }), item("x", { stayMinutes: 60 })], "09:45");
    expect(t.get("f")?.start).toBe("09:45");
    expect(t.get("x")?.start).toBe("09:50");
  });

  it("자정을 넘나드는 시각 이동", () => {
    expect(shiftClock("00:30", -60)).toBe("23:30");
  });

  it("저녁까지 비는 날은 빈 시간을 알려 주고, 마지막 날은 제외", () => {
    const day = linearDay(1, [item("a", { stayMinutes: 60 })]);
    expect(calcDayGap(day, {}, false)).toEqual({ freeMinutes: 540, fromTime: "09:00" });
    expect(calcDayGap(day, {}, true)).toBeNull();
  });

  it("19시를 넘기면 늦은 종료, 단 근교투어는 예외", () => {
    expect(calcDayEnd(linearDay(1, [item("a", { stayMinutes: 720 })]), {})?.isLate).toBe(true);
    expect(calcDayEnd(linearDay(1, [item("a", { name: "근교 투어", stayMinutes: 720 })]), {})?.isLate).toBe(false);
  });
});

describe("국내 여행지 판단", () => {
  it.each([
    ["제주도", true],
    ["부산, 대한민국", true],
    ["다낭, 베트남", false],
    ["교토", false],
  ])("%s → %s", (dest, expected) => {
    expect(isKoreanDestination(dest)).toBe(expected);
  });
});
