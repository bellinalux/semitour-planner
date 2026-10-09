import { describe, expect, it } from "vitest";
import { calcDayLoad } from "@/lib/dayLoad";
import { dayTimeRequestDay, fitDayTimes } from "@/lib/dayTimeFit";
import { clampMealStay } from "@/lib/mealTiming";
import type { DayTimeArea } from "@/lib/schemas/dayTime";
import { item, linearDay } from "./fixtures";

// 마카오 첫날 오후처럼: 장소마다 따로 잡은 체류(장소 확인)와 10~20분씩 붙은 이동
const day = () =>
  linearDay(1, [
    item("a1", { name: "탑석광장", stayMinutes: 20, travelMinutesToNext: 10 }),
    item("a2", { name: "라자로 성당", stayMinutes: 20, travelMinutesToNext: 10 }),
    item("a3", { name: "몬테요새", stayMinutes: 50, travelMinutesToNext: 10 }),
    item("a4", { name: "성바울 성당", stayMinutes: 30, travelMinutesToNext: 10 }),
    item("a5", { name: "세나도 광장", stayMinutes: 30, travelMinutesToNext: 20 }),
    item("b1", { name: "카르모 성당", stayMinutes: 30, travelMinutesToNext: 10 }),
    item("b2", { name: "타이파 빌리지", stayMinutes: 80, travelMinutesToNext: 10, stayEdited: false }),
    item("b3", { name: "쿤하 거리", type: "shopping", stayMinutes: 40, travelMinutesToNext: 10 }),
    item("b4", { name: "주택박물관", stayMinutes: 40, travelMinutesToNext: 20 }),
    item("m", { name: "저녁 식사", type: "meal", stayMinutes: 60, travelMinutesToNext: 20 }),
  ]);

const areas: DayTimeArea[] = [
  {
    name: "마카오 반도 역사지구",
    itemIds: ["a1", "a2", "a3", "a4", "a5"],
    totalMinutes: 180,
    walkMinutes: 8,
    travelToNextMinutes: 20,
    sourceName: "하나투어 일정표",
  },
  { name: "타이파 빌리지", itemIds: ["b1", "b2", "b3", "b4"], totalMinutes: 120, walkMinutes: 4, travelToNextMinutes: 15, sourceName: "" },
];

describe("일정 시간 검증 (구역 단위)", () => {
  it("짧은 도보(10분 미만)는 체류에 넣어 구역 체류 합 = 구역 총시간, 구역 끝은 다음까지 이동", () => {
    const fitted = fitDayTimes(day(), areas, "2026-10-09T00:00:00Z");
    const byId = new Map(fitted.items.map((i) => [i.id, i]));
    const peninsula = ["a1", "a2", "a3", "a4", "a5"].map((id) => byId.get(id)!);
    // 도보 8분은 체류에 넣고(일정표가 시작 시각을 10분 단위로 올리므로) 180분을 지금 체류 비율(20:20:50:30:30)대로 10분 단위로 나눔
    expect(peninsula.map((i) => i.stayMinutes)).toEqual([20, 20, 60, 40, 40]);
    expect(peninsula.slice(0, 4).every((i) => i.travelMinutesToNext === 0)).toBe(true);
    expect(byId.get("a5")!.travelMinutesToNext).toBe(20); // 타이파로 이동
    expect(byId.get("b4")!.travelMinutesToNext).toBe(20); // 저녁 식사까지 15분 → 10분 단위
    expect(byId.get("a1")!.timeCheck?.sourceName).toBe("하나투어 일정표 · 구역 안 도보 8분 포함");
    expect(byId.get("b2")!.timeCheck).toMatchObject({ basis: "area", area: "타이파 빌리지" });
    expect(byId.get("m")!.stayMinutes).toBe(60); // 식사는 구역 밖이면 그대로
  });

  it("큰 지역은 구역 장소 모두에, 차량 하차·픽업 지점은 구역 첫 장소에만 붙인다", () => {
    const withPoints: DayTimeArea[] = [{ ...areas[0], region: "마카오 반도", dropOff: "세나도 광장 입구", pickUp: "성바울 성당 아래" }, areas[1]];
    const byId = new Map(fitDayTimes(day(), withPoints, "x").items.map((i) => [i.id, i]));
    expect(byId.get("a1")!.timeCheck).toMatchObject({ region: "마카오 반도", dropOff: "세나도 광장 입구", pickUp: "성바울 성당 아래" });
    expect(byId.get("a2")!.timeCheck).toMatchObject({ region: "마카오 반도" });
    expect(byId.get("a2")!.timeCheck?.dropOff).toBeUndefined();
    expect(byId.get("b1")!.timeCheck?.region).toBeUndefined();
  });

  it("하루 체류+이동이 크게 줄어든다 (장소별 합산 → 구역 기준)", () => {
    const before = calcDayLoad(day(), {}).totalMinutes;
    const after = calcDayLoad(fitDayTimes(day(), areas, "x"), {}).totalMinutes;
    expect(before).toBeGreaterThanOrEqual(530);
    expect(after).toBeLessThanOrEqual(420);
  });

  it("사람이 직접 고친 체류시간은 그대로 두고, 나머지로 구역 시간을 맞춘다", () => {
    const d = day();
    d.items[6] = { ...d.items[6], stayMinutes: 50, stayEdited: true }; // 타이파 빌리지 직접 50분
    const fitted = fitDayTimes(d, areas, "x");
    const taipa = fitted.items.filter((i) => ["b1", "b2", "b3", "b4"].includes(i.id));
    expect(taipa.find((i) => i.id === "b2")!.stayMinutes).toBe(50);
    // 120 − 직접 50 = 70분을 나머지 셋이 10분 단위로 나눔 (장소마다 최소 10분)
    const rest = taipa.filter((i) => i.id !== "b2").reduce((s, i) => s + i.stayMinutes, 0);
    expect(rest).toBe(70);
  });

  it("요청에는 앱이 넣은 식사 맞춤 자유시간을 빼고, 장소가 2곳 미만이면 요청하지 않는다", () => {
    const d = linearDay(1, [
      item("x-free-0", { type: "free_time", name: "자유시간", description: "다음 식사 시간에 맞춰 비워 둔 자유시간입니다." }),
      item("p1", { name: "A" }),
      item("p2", { name: "B" }),
    ]);
    expect(dayTimeRequestDay(d, {})?.items.map((i) => i.id)).toEqual(["p1", "p2"]);
    expect(dayTimeRequestDay(linearDay(2, [item("only", { name: "A" }), item("h", { type: "hotel", name: "호텔" })]), {})).toBeNull();
  });
});

describe("식사 체류시간 범위", () => {
  it("점심·저녁 40~90분, 카페·문화공간 20~60분", () => {
    expect(clampMealStay("meal", "점심 식사 (굴국수)", 150)).toBe(90);
    expect(clampMealStay("meal", "알베르게1601 포르투갈풍 문화 공간", 90)).toBe(60);
    expect(clampMealStay("meal", "카페", 10)).toBe(20);
    expect(clampMealStay("sightseeing", "몬테요새", 150)).toBe(150);
  });
});
