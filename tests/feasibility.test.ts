import { describe, expect, it } from "vitest";
import { applyDayMove, refitDay, roomOf } from "@/lib/dayBalance";
import { computeItemTimings, dayTourStart } from "@/lib/dayLoad";
import { bestInsert, dayHardIssues, dayWindow, fixImpossible, newHardIssues, openWindow } from "@/lib/feasibility";
import { item } from "./fixtures";
import { pattayaTrip } from "./scenarioFixtures";

describe("① 하루 사용 가능 시간", () => {
  it("새벽 도착일·출국일·보통 날을 가린다", () => {
    const days = pattayaTrip();
    expect(dayWindow(days[0], {}).kind).toBe("arrival-night");
    expect(dayWindow(days[0], {}).acceptsMoves).toBe(false);
    expect(dayWindow(days[2], {}).kind).toBe("normal");
    const dep = dayWindow(days[4], {}, "21:30");
    expect(dep.kind).toBe("departure");
    expect(dep.acceptsMoves).toBe(false);
    expect(roomOf(days[0], {})).toBe(0);
    expect(roomOf(days[4], {})).toBe(0);
  });
});

describe("② 운영 시간", () => {
  it("유형별 기본값 — 해양 투어·야시장·마사지·관광지, 지식 창고 운영 시간 먼저", () => {
    expect(openWindow(item("x", { type: "experience", name: "산호섬 호핑 투어" }))?.basis).toBe("해양 투어(오전 출발·오후 복귀)");
    expect(openWindow(item("x", { type: "shopping", name: "파타야 야시장" }))?.open).toBe(16 * 60);
    expect(openWindow(item("x", { name: "박물관", openHours: { mon: "10:00-17:00" } }))).toMatchObject({ open: 600, close: 1020 });
    expect(openWindow(item("x", { name: "분수쇼", fixedTime: "20:00" }))).toBeNull();
  });
});

describe("④ 불가능 시간 — 사용자 사례 (새벽 도착일에 03:00 호핑투어·07:20 점심)", () => {
  // DAY 3의 호핑투어를 DAY 1(새벽 도착)로 옮긴 모양
  const broken = () => {
    const days = pattayaTrip();
    const hop = days[2].items.filter((i) => ["hop", "act"].includes(i.id));
    days[2] = refitDay({ ...days[2], items: days[2].items.filter((i) => !["hop", "act"].includes(i.id)) });
    const lunch = item("lunch-1-3", { type: "meal", name: "점심 식사 (자유식)", stayMinutes: 60, travelMinutesToNext: 50 });
    days[0] = { ...days[0], items: [...days[0].items.slice(0, 3), ...hop, lunch, days[0].items[3]] };
    return days;
  };

  it("원래 상품에는 불가능 시간이 없다", () => {
    expect(pattayaTrip().flatMap((d) => dayHardIssues(d, {}, "21:30"))).toEqual([]);
  });

  it("새벽 도착일의 관광·점심을 잡아낸다", () => {
    const issues = dayHardIssues(broken()[0], {}, "21:30");
    expect(issues.map((i) => i.itemId)).toEqual(["hop", "act", "lunch-1-3"]);
    expect(issues[0].text).toContain("새벽·밤 도착일");
  });

  it("관문: 이런 변경은 새 불가능 시간으로 막힌다", () => {
    expect(newHardIssues(pattayaTrip(), broken(), {}, "21:30").map((i) => i.itemId)).toEqual(["hop", "act", "lunch-1-3"]);
  });

  it("불가능 시간 고치기 → 호핑투어는 같은 도시(파타야)의 받는 날 오전으로, 자유식 점심은 뺀다", () => {
    const r = fixImpossible(broken(), {}, refitDay, "21:30");
    expect(r.left).toEqual([]);
    const where = (id: string) => r.days.find((d) => d.items.some((i) => i.id === id))?.day;
    expect(where("hop")).toBe(3);
    expect(where("lunch-1-3")).toBeUndefined();
    const d3 = r.days.find((d) => d.day === 3)!;
    const t = computeItemTimings(d3.items, dayTourStart(d3)).get("hop")!;
    expect(t.start < "12:00").toBe(true);
  });
});

describe("③ 시각이 맞는 자리", () => {
  it("일정 옮기기는 새벽 도착일·출국일로 보내지 않고, 넣을 때 운영 시간 안 자리를 고른다", () => {
    const days = pattayaTrip();
    const nm = item("nm2", { type: "shopping", name: "터미널21 야시장", stayMinutes: 60, travelMinutesToNext: 20 });
    // 야시장은 오후 4시 전 자리에 못 들어간다 → 저녁 쪽
    const placed = bestInsert(days[2], [nm], {}, refitDay, "21:30")!;
    const t = computeItemTimings(placed.items, dayTourStart(placed)).get("nm2")!;
    expect(t.start >= "16:00").toBe(true);
    // DAY 2 → DAY 1(새벽 도착) 옮기기를 시켜도 시각 맞는 자리가 없으면 원래 방식 그대로 (관문이 막는다)
    const moved = applyDayMove(days, { fromDay: 2, toDay: 1, itemIds: ["nong"], label: "", minutes: 120 });
    expect(newHardIssues(days, moved, {}, "21:30").length).toBeGreaterThan(0);
  });
});
