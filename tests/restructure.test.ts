import { describe, expect, it } from "vitest";
import { refitDay } from "@/lib/dayBalance";
import { computeItemTimings, dayTourStart } from "@/lib/dayLoad";
import { tidyDay } from "@/lib/dayTidy";
import { dayMeals } from "@/lib/documents";
import { newHardIssues } from "@/lib/feasibility";
import { mealSlotOf } from "@/lib/mealSlot";
import { packageRules } from "@/lib/packageRules";
import { addCityMoves, diagnoseTrip, missingCityMoves, restructurePlans } from "@/lib/restructure";
import { input, item, linearDay } from "./fixtures";

const rules = packageRules(input({ destination: "다낭", operatingModel: "full", productTier: "standard", travelType: "package" }));

describe("식사 구분 — 이름만 있는 식당 (AI 응답 모양)", () => {
  // 다낭 DAY 1: 마담란 09:30 점심, 목식당 14:20 저녁이던 것
  const aiDay = () =>
    linearDay(1, [
      item("a", { name: "다낭 대성당", stayMinutes: 40, travelMinutesToNext: 20 }),
      item("m1", { type: "meal", name: "마담란 (Madame Lan)", cuisine: "현지식", stayMinutes: 80, travelMinutesToNext: 30 }),
      item("b", { name: "린응사", stayMinutes: 80, travelMinutesToNext: 20 }),
      item("c", { name: "미케 비치", stayMinutes: 60, travelMinutesToNext: 20 }),
      item("m2", { type: "meal", name: "목식당 (Hai San Moc Quan)", cuisine: "씨푸드", stayMinutes: 80 }),
    ], { meetingTime: "08:30" });

  it("순서로 첫 끼 중식·마지막 끼 석식을 정하고, 식사 시간대에 맞춘다", () => {
    const d = refitDay(tidyDay(aiDay()));
    expect(d.items.filter((i) => i.type === "meal").map((i) => mealSlotOf(i))).toEqual(["lunch", "dinner"]);
    const t = computeItemTimings(d.items, dayTourStart(d));
    expect(t.get("m1")!.start >= "11:00").toBe(true);
    expect(t.get("m2")!.start).toBe("18:00");
  });

  it("카페는 석식 칸에 들어가지 않는다", () => {
    const d = tidyDay(linearDay(2, [item("l", { type: "meal", name: "뷔페", stayMinutes: 60 }), item("cafe", { type: "meal", name: "콩카페 1호점", stayMinutes: 50 }), item("d", { type: "meal", name: "벱꾸온", stayMinutes: 80 })]));
    expect(d.items.filter((i) => i.type === "meal").map((i) => mealSlotOf(i))).toEqual(["lunch", "cafe", "dinner"]);
    const m = dayMeals([linearDay(1, []), d], 1, {}, input());
    expect(m.dinner.mark).toBe("포함");
  });

  it("식사인데 체험으로 들어온 '석식 (선상디너 크루즈)'는 석식으로", () => {
    const d = tidyDay(linearDay(2, [item("c", { type: "experience", name: "석식 (선상디너 크루즈)", entryFee: 55000 })]));
    expect(d.items[0]).toMatchObject({ type: "meal", mealSlot: "dinner", mealCost: 55000, entryFee: 0 });
  });
});

describe("전체 일정 재구성", () => {
  // DAY 2가 넘치고(22시 넘어 끝남) DAY 1·3은 일찍 끝난다
  const trip = () =>
    [
      linearDay(1, [item("a1", { name: "대성당", stayMinutes: 60, travelMinutesToNext: 20 }), item("l1", { type: "meal", name: "중식", stayMinutes: 60, travelMinutesToNext: 20 }), item("a2", { name: "미케 비치", stayMinutes: 60 })], { meetingTime: "09:00" }),
      linearDay(2, [
        item("b1", { name: "바나힐", stayMinutes: 300, travelMinutesToNext: 20 }),
        item("l2", { type: "meal", name: "중식 뷔페", stayMinutes: 60, travelMinutesToNext: 50 }),
        item("b2", { name: "오행산", stayMinutes: 120, travelMinutesToNext: 30 }),
        item("cafe", { type: "meal", name: "콩카페", stayMinutes: 50, travelMinutesToNext: 20 }),
        item("b3", { name: "참 박물관", stayMinutes: 120, travelMinutesToNext: 20 }),
        item("d2", { type: "meal", name: "석식", stayMinutes: 80, travelMinutesToNext: 20 }),
        item("b4", { name: "린응사", stayMinutes: 90, travelMinutesToNext: 20 }),
      ], { meetingTime: "09:00" }),
      linearDay(3, [item("c1", { name: "한 시장", type: "shopping", stayMinutes: 60, travelMinutesToNext: 20 }), item("l3", { type: "meal", name: "중식", stayMinutes: 60 })], { meetingTime: "09:00" }),
    ].map((d) => refitDay(tidyDay(d)));

  it("진단 — 넘치는 날·비어 있는 날", () => {
    const diag = diagnoseTrip(trip(), {}, rules);
    expect(diag[1].status).toBe("impossible"); // 석식 뒤 21시대 린응사 — 운영 시간 밖
    expect(diag[1].over.length).toBeGreaterThan(0);
    expect(diag[0].empty.join(" ")).toContain("비어 있음");
  });

  it("변경안 — 균형안은 넘치는 날의 묶음을 다른 날로, 새 불가능 시간은 없다", () => {
    const days = trip();
    const plans = restructurePlans(days, {}, rules);
    const balance = plans.find((p) => p.key === "balance")!;
    expect(balance).toBeTruthy();
    expect(balance.changes.join(" ")).toMatch(/DAY 2 → DAY (1|3)/);
    expect(balance.after[1].issues).toBeLessThan(balance.before[1].issues);
    for (const p of plans) expect(newHardIssues(days, p.days, {}, rules.dayEnd)).toEqual([]);
  });

  it("도시가 바뀌는데 이동이 없으면 도시 이동을 넣는다 (도시 간 표, 모르면 추정)", () => {
    const days = [linearDay(1, [item("a")], { overnightCity: "파타야" }), linearDay(2, [item("b")], { overnightCity: "방콕" })];
    expect(missingCityMoves(days)).toEqual([{ day: 2, from: "파타야", to: "방콕" }]);
    const changes: string[] = [];
    const next = addCityMoves(days, changes);
    expect(next[1].items[0]).toMatchObject({ type: "transfer", name: "파타야 → 방콕 이동 (체크아웃 후)", stayMinutes: 150 });
    expect(changes[0]).toContain("2시간 30분");
  });
});
