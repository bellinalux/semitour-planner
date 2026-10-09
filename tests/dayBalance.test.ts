import { describe, expect, it } from "vitest";
import { calcDayLoad } from "@/lib/dayLoad";
import { applyDayMove, insertBreak, suggestDayMoves } from "@/lib/dayBalance";
import { item, linearDay } from "./fixtures";

const area = (id: string, name: string, a: string, stay = 30) => item(id, { name, stayMinutes: stay, travelMinutesToNext: 0, timeCheck: { basis: "area", area: a, checkedAt: "x" } });

// 첫날: 항공 + 역사지구 4곳(구역) + 타이파 2곳(구역) + 저녁 + 야경 → 항공을 빼고도 10시간 넘음 / 셋째 날: 자유일정만
const trip = () => [
  linearDay(
    1,
    [
      item("dep", { type: "flight", name: "인천 출발", stayMinutes: 0, travelMinutesToNext: 180 }),
      item("arr", { type: "flight", name: "마카오 도착", stayMinutes: 30, travelMinutesToNext: 20 }),
      item("lunch", { type: "meal", name: "점심 식사", stayMinutes: 60, travelMinutesToNext: 10 }),
      area("a1", "탑석광장", "역사지구", 40),
      area("a2", "몬테요새", "역사지구", 40),
      area("a3", "성바울 성당", "역사지구", 40),
      { ...area("a4", "세나도 광장", "역사지구", 40), travelMinutesToNext: 20 },
      area("t1", "타이파 빌리지", "타이파", 120),
      { ...area("t2", "쿤하 거리", "타이파", 120), travelMinutesToNext: 10 },
      item("dinner", { type: "meal", name: "저녁 식사", stayMinutes: 70, travelMinutesToNext: 20 }),
      item("night", { name: "윈팰리스 분수쇼 및 야경 투어", stayMinutes: 60, travelMinutesToNext: 20 }),
      item("hotel", { type: "hotel", name: "호텔 투숙", stayMinutes: 0 }),
    ],
    { meetingTime: "09:50" },
  ),
  linearDay(2, [item("c", { name: "콜로안 빌리지", stayMinutes: 60 }), item("tw", { name: "마카오 타워", stayMinutes: 60 })]),
  linearDay(3, [item("free", { type: "free_time", name: "자유 일정 (가이드/차량 미포함)", stayMinutes: 600 })]),
];

describe("날짜 사이 일정 나누기", () => {
  it("10시간 넘는 날의 구역 하나를 자유일정 날로 옮기자고 제안하고, 미포함 일정이면 비용을 주의시킨다", () => {
    const days = trip();
    expect(calcDayLoad(days[0], {}).totalMinutes - 230).toBeGreaterThan(600); // 항공 230분 빼고도
    const [move] = suggestDayMoves(days, {});
    expect(move).toMatchObject({ fromDay: 1, toDay: 3 });
    expect(move.label).toMatch(/구역\(\d+곳, .+\)을 DAY 3로 옮기기/);
    expect(move.note).toContain("가이드·차량 미포함");
    // 항공·식사·야경·숙소는 옮기지 않는다
    expect(move.itemIds.some((id) => ["dep", "arr", "lunch", "dinner", "night", "hotel"].includes(id))).toBe(false);
  });

  it("옮기면 보낸 날은 짧아지고, 받는 날은 자유시간을 그만큼 줄여 앞에 넣는다", () => {
    const days = trip();
    const [move] = suggestDayMoves(days, {});
    const next = applyDayMove(days, move);
    expect(calcDayLoad(next[0], {}).totalMinutes).toBeLessThan(calcDayLoad(days[0], {}).totalMinutes);
    const d3 = next[2].items;
    expect(d3.slice(0, move.itemIds.length).map((i) => i.id)).toEqual(move.itemIds);
    // 점심이 없던 자유일정 날이라 자유식 점심(60분 + 이동 10분)을 함께 넣고, 시작 시각이 없으니 09:00 미팅
    expect(d3[move.itemIds.length]).toMatchObject({ type: "meal", name: "점심 식사 (자유식)", mealCost: 0 });
    expect(d3.at(-1)).toMatchObject({ type: "free_time", stayMinutes: 600 - move.minutes - 70 });
    expect(next[2].meetingTime).toBe("09:00");
  });

  it("10시간 안이면 제안하지 않는다", () => {
    expect(suggestDayMoves([linearDay(1, [item("a", { name: "A" })]), linearDay(2, [item("b", { name: "B" })])], {})).toEqual([]);
  });
});

describe("휴식 넣기", () => {
  it("쉬지 않고 4시간 넘게 이어지면 가운데쯤에 30분 휴식을 넣는다", () => {
    const d = linearDay(1, [
      item("a", { name: "A", stayMinutes: 80, travelMinutesToNext: 10 }),
      item("b", { name: "B", stayMinutes: 80, travelMinutesToNext: 10 }),
      item("c", { name: "C", stayMinutes: 80, travelMinutesToNext: 10 }),
      item("d", { name: "D", stayMinutes: 60 }),
    ]);
    const next = insertBreak(d);
    expect(next.items.map((i) => i.name)).toEqual(["A", "B", "휴식 · 카페", "C", "D"]);
    expect(insertBreak(linearDay(1, [item("x", { name: "X", stayMinutes: 60 })])).items).toHaveLength(1);
  });

  it("엔진과 같이 식사 뒤 첫 이동까지 센다 (식사 → 30분 이동 → 체류 200 + 이동 50 = 4시간 10분, 나가는 이동으로 세면 3시간 50분)", () => {
    const d = linearDay(1, [
      item("m", { type: "meal", name: "점심", stayMinutes: 60, travelMinutesToNext: 30 }),
      item("a", { name: "A", stayMinutes: 50, travelMinutesToNext: 0 }),
      item("b", { name: "B", stayMinutes: 60, travelMinutesToNext: 20 }),
      item("c", { name: "C", stayMinutes: 90, travelMinutesToNext: 10 }),
      item("f", { type: "free_time", name: "자유시간", stayMinutes: 50 }),
    ]);
    expect(insertBreak(d).items.map((i) => i.name)).toContain("휴식 · 카페");
  });
});

describe("카페·간식은 그 동네와 함께", () => {
  it("구역 안의 에그타르트 가게(카페형 식사)는 구역 묶음에 함께 들어가고, 점심은 들어가지 않는다", () => {
    const days = trip();
    // 역사지구 끝에 카페를 넣고, 넘친 만큼(가장 가까운 묶음)이 역사지구가 되도록 타이파를 짧게
    days[0].items.splice(7, 0, { ...area("cafe", "로드스토우 에그타르트", "역사지구", 20), type: "meal" as const });
    days[0].items = days[0].items.map((i) => (i.id === "t1" || i.id === "t2" ? { ...i, stayMinutes: 20 } : /^a\d$/.test(i.id) ? { ...i, stayMinutes: 80 } : i));
    const [move] = suggestDayMoves(days, {});
    expect(move.itemIds).toEqual(["a1", "a2", "a3", "a4", "cafe"]);
  });
});

describe("옮기지 않는 경우", () => {
  it("비행 시간 때문에 긴 날은 옮기자고 하지 않는다", () => {
    const days = trip();
    days[0].items = days[0].items.filter((i) => !["t1", "t2"].includes(i.id));
    expect(calcDayLoad(days[0], {}).totalMinutes).toBeGreaterThan(600);
    expect(suggestDayMoves(days, {})).toEqual([]);
  });
});

describe("점심 넣기", () => {
  it("짧은 묶음이 두 번 옮겨 와도 관광이 2시간을 넘으면 자유식 점심을 넣는다 (한 번만)", () => {
    const free = linearDay(2, [item("f", { type: "free_time", name: "자유 일정", stayMinutes: 600 })]);
    const from = linearDay(1, [area("x", "베네시안", "코타이", 100), area("y", "콜로안 빌리지", "콜로안", 100)]);
    let days = [from, free];
    days = applyDayMove(days, { fromDay: 1, toDay: 2, itemIds: ["x"], label: "", minutes: 100 });
    expect(days[1].items.some((i) => i.type === "meal")).toBe(false);
    days = applyDayMove(days, { fromDay: 1, toDay: 2, itemIds: ["y"], label: "", minutes: 100 });
    expect(days[1].items.filter((i) => i.type === "meal").map((i) => i.name)).toEqual(["점심 식사 (자유식)"]);
  });
});
