import { describe, expect, it } from "vitest";
import { applyDayResult, buildDayRequest, reorderByEngine } from "@/lib/engineDay";
import type { PlanResponse } from "@/lib/server/courseEngineServer";
import { item, linearDay } from "./fixtures";

// 실제 마카오 첫날처럼: 항공 2개 → 점심 → 관광 5곳 → 저녁 → 야경 → 호텔
const day = () =>
  linearDay(
    1,
    [
      item("f1", { type: "flight", name: "인천 출발", stayMinutes: 0, travelMinutesToNext: 180 }),
      item("f2", { type: "flight", name: "마카오 공항 도착", stayMinutes: 30, travelMinutesToNext: 20 }),
      item("lunch", { type: "meal", name: "점심 식사 (굴국수)", stayMinutes: 60 }),
      item("s1", { name: "탑석광장" }),
      item("s2", { name: "라자로 성당" }),
      item("s3", { name: "몬테요새" }),
      item("s4", { name: "성바울 성당" }),
      item("s5", { name: "세나도 광장" }),
      item("dinner", { type: "meal", name: "저녁 식사 (포르투갈식)", stayMinutes: 70 }),
      item("night", { name: "윈팰리스 분수쇼 및 야경 투어" }),
      item("hotel", { type: "hotel", name: "호텔 투숙", stayMinutes: 0 }),
    ],
    { meetingTime: "09:50" },
  );

describe("코스 엔진 추천 순서 적용", () => {
  it("관광지 자리만 추천 순서로 바꾸고 항공·식사·호텔은 제자리, 엔진이 뺀 곳은 원래 앞 장소 뒤에", () => {
    // 엔진이 저녁·야경 시간대를 못 맞춰 일부를 빼고(s5, night) 저녁을 점심 뒤로 당긴 추천 순서
    const order = ["s4", "s2", "s1", "lunch", "dinner", "s3", "hotel"];
    const next = reorderByEngine(day().items, order);
    expect(next.map((i) => i.id)).toEqual(["f1", "f2", "lunch", "s4", "s2", "s1", "s3", "s5", "dinner", "night", "hotel"]);
  });

  it("적용하면 순서가 실제로 바뀌고, 하루 끝 항목·항공 위치는 그대로", () => {
    const res = {
      current: { order: [], timeline: [], violations: [], totalTravel: 0, dropped: [] },
      best: {
        order: ["s3", "s1", "s2", "s4", "s5", "night"],
        timeline: [
          { id: "s3", name: "몬테요새", start: 900, end: 930, travelFromPrev: 0 },
          { id: "s1", name: "탑석광장", start: 935, end: 965, travelFromPrev: 5 },
        ],
        violations: [],
        totalTravel: 0,
        dropped: [],
      },
      places: [],
      quality: { score: 0, grade: "C", items: [], fixes: [] },
      bestQuality: { score: 0, grade: "B", items: [], fixes: [] },
      context: {},
    } as unknown as PlanResponse;
    const [next] = applyDayResult([day()], 1, res, { useBest: true });
    expect(next.items.map((i) => i.id)).toEqual(["f1", "f2", "lunch", "s3", "s1", "s2", "s4", "s5", "dinner", "night", "hotel"]);
  });

  it("저녁 일정(야경·분수쇼·저녁 식사)이 있는 날은 하루 끝을 22:30으로 본다", () => {
    expect(buildDayRequest(day(), {}, { destination: "마카오", travelType: "package" as never })?.maxEnd).toBe("22:30");
    const plain = linearDay(2, [item("a", { name: "콜로안 빌리지" }), item("b", { name: "마카오 타워" })]);
    expect(buildDayRequest(plain, {}, { destination: "마카오", travelType: "package" as never })?.maxEnd).toBe("19:00");
  });
});

describe("AI가 공항·미팅 항목을 관광으로 잘못 분류해도", () => {
  it("이름으로 고정 이동으로 보고 맨 위 자리를 지킨다 (엔진에도 이동으로 보낸다)", () => {
    const d = linearDay(
      1,
      [
        item("dep", { type: "flight", name: "인천 국제공항 출발", stayMinutes: 0, travelMinutesToNext: 180 }),
        // AI가 sightseeing으로 분류한 도착 항목
        item("arr", { type: "sightseeing", name: "마카오 공항 도착 ( 12:50 ), 가이드 미팅", stayMinutes: 40 }),
        item("s1", { name: "탑석광장" }),
        item("s2", { name: "몬테요새" }),
        item("s3", { name: "세나도 광장" }),
      ],
      { meetingTime: "09:50" },
    );
    // 엔진이 도착 항목을 저녁 쪽으로 보낸 추천 순서
    const next = reorderByEngine(d.items, ["s3", "s1", "s2", "arr"]);
    expect(next.map((i) => i.id)).toEqual(["dep", "arr", "s3", "s1", "s2"]);
    const req = buildDayRequest(d, {}, { destination: "마카오", travelType: "package" as never })!;
    expect(req.places.find((p) => p.id === "arr")?.kind).toBe("transfer");
    expect(req.places.find((p) => p.id === "s1")?.kind).toBe("sight");
  });
});
