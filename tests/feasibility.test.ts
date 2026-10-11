import { describe, expect, it } from "vitest";
import { applyDayMove, refitDay, roomOf } from "@/lib/dayBalance";
import { computeItemTimings, dayTourStart } from "@/lib/dayLoad";
import { bestInsert, dayHardIssues, dayWindow, fixImpossible, newHardIssues, openWindow } from "@/lib/feasibility";
import { calcDayLoad } from "@/lib/dayLoad";
import { enforceMealWindows } from "@/lib/mealTiming";
import { packageRules, separateItems, toOptionalTours, tripRuleIssues } from "@/lib/packageRules";
import { input } from "./fixtures";
import { item, linearDay } from "./fixtures";
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

describe("전체 검사에서 찾은 계산 문제", () => {
  it("① 문 여는 시각까지 기다린다 — 아시아티크(16:00~)를 크루즈 앞에 두면 자유시간 뒤 16:00 시작", () => {
    const out = enforceMealWindows([item("p", { name: "왕궁", stayMinutes: 90, travelMinutesToNext: 30 }), item("asia", { type: "shopping", name: "아시아티크", stayMinutes: 90 })], "12:40");
    expect(out.map((i) => i.id)).toEqual(["p", "asia-free-0", "asia"]);
    expect(out[1].stayMinutes).toBe(16 * 60 - (12 * 60 + 40 + 90 + 30));
  });

  it("② 항공 시각이 없어도 원문 '새벽 체크인'이면 새벽 도착일, 항공 시각 없음 알림", () => {
    const d1 = linearDay(1, [item("f", { type: "flight", name: "김해 출발", stayMinutes: 0, travelMinutesToNext: 330 }), item("a", { type: "flight", name: "방콕 도착", stayMinutes: 40 }), item("h", { type: "hotel", name: "호텔 새벽 체크인", stayMinutes: 0 })]);
    expect(dayWindow(d1, {}).kind).toBe("arrival-night");
    const r = packageRules(input({ operatingModel: "full", destination: "방콕" }));
    expect(tripRuleIssues(input({ options: [] }), [d1], {}, r).map((i) => i.key)).toContain("flight-time");
  });

  it("③ 자유시간은 하루 부담에 넣지 않는다", () => {
    const d = linearDay(2, [item("a", { stayMinutes: 120, travelMinutesToNext: 20 }), item("f", { type: "free_time", stayMinutes: 200, travelMinutesToNext: 10 }), item("b", { stayMinutes: 60 })]);
    expect(calcDayLoad(d, {}).totalMinutes).toBe(30 + 120 + 20 + 10 + 60);
  });

  it("④ 원문상 '별도 진행' 항목은 선택관광으로 (현지 별도 결제·대체일정)", () => {
    const d = linearDay(3, [item("hop", { type: "experience", name: "산호섬 호핑 투어", stayMinutes: 120 }), item("act", { type: "experience", name: "해양 엑티비티", description: "바나나 보트, 제트스키 - 가이드 문의 후 별도 진행 가능", stayMinutes: 60, travelMinutesToNext: 20, entryFee: 16000 }), item("l", { type: "meal", name: "중식" })]);
    expect(separateItems([d], {}).map((s) => s.item.id)).toEqual(["act"]);
    const r = toOptionalTours([d], ["act"]);
    expect(r.days[0].items.some((i) => i.id === "act")).toBe(false);
    expect(r.options[0]).toMatchObject({ name: "해양 엑티비티", dayNo: 3, pricePerPerson: 16000, note: "현지 별도 진행 (불포함 사항)" });
    expect(r.options[0].alternative).toContain("미참여 시");
    // 현지 별도 진행 선택관광은 노옵션 점검에 걸리지 않는다
    const prem = packageRules(input({ operatingModel: "full", productTier: "premium", destination: "파타야" }));
    expect(tripRuleIssues(input({ options: r.options, tipPerPerson: 1 }), r.days, {}, prem).map((i) => i.key)).not.toContain("options-included");
  });
});
