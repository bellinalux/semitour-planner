import { describe, expect, it } from "vitest";
import { buildDayRequest } from "@/lib/engineDay";
import { backtrackLegs, dayDistance, mapPoints, planRegions, regionKeys, regionRepeats, withCoords } from "@/lib/regionPlan";
import { item, linearDay } from "./fixtures";

// 다낭: 시내(한 시장·대성당) / 바나힐(약 25km 서쪽) / 선짜 반도
const C1 = { lat: 16.068, lng: 108.22 };
const C2 = { lat: 16.061, lng: 108.224 };
const B1 = { lat: 15.995, lng: 107.996 };
const B2 = { lat: 15.998, lng: 107.99 };
const S1 = { lat: 16.1, lng: 108.277 };
const at = (id: string, c: { lat: number; lng: number }, patch = {}) => item(id, { name: id, ...c, travelMinutesToNext: 15, ...patch });

const days = () => [
  linearDay(1, [at("한 시장", C1), at("바나힐", B1, { stayMinutes: 240 })]),
  linearDay(2, [at("바나힐 골든브릿지", B2), at("다낭 대성당", C2)]),
  linearDay(3, [at("린응사", S1)]),
];

describe("지역 정하기", () => {
  it("좌표가 4km 안이면 같은 지역, 이름 있는 지역이 먼저", () => {
    const keys = regionKeys(days(), {});
    expect(keys.get("한 시장")).toBe(keys.get("다낭 대성당"));
    expect(keys.get("바나힐")).toBe(keys.get("바나힐 골든브릿지"));
    expect(keys.get("바나힐")).not.toBe(keys.get("한 시장"));
    const named = [linearDay(1, [at("a", C1, { timeCheck: { basis: "area", area: "시내", region: "다낭 시내", checkedAt: "" } }), at("b", C2)])];
    expect(regionKeys(named, {}).get("b")).toBe("다낭 시내");
  });
});

describe("지도 점·거리·되돌아감", () => {
  it("날짜별 번호와 거리", () => {
    const pts = mapPoints(days(), {});
    expect(pts[0].map((p) => [p.order, p.name])).toEqual([
      [1, "한 시장"],
      [2, "바나힐"],
    ]);
    expect(dayDistance(pts[0]).km).toBeGreaterThan(30);
    expect(dayDistance(pts[2]).km).toBe(0);
  });

  it("떠났던 지역으로 되돌아가면 그 구간", () => {
    const d = [linearDay(1, [at("한 시장", C1), at("바나힐", B1), at("다낭 대성당", C2)])];
    const legs = backtrackLegs(mapPoints(d, {})[0]);
    expect(legs.map((l) => `${l.from.name}→${l.to.name}`)).toEqual(["바나힐→다낭 대성당"]);
  });
});

describe("여러 날 지역 묶기", () => {
  it("같은 지역을 여러 날 가면 반복으로 찾고, 오래 도는 날로 모은다", () => {
    const reps = regionRepeats(days(), {});
    expect(reps.map((r) => r.days)).toEqual([
      [1, 2],
      [1, 2],
    ]);
    expect(reps[0].extraMinutes).toBeGreaterThan(30);
    const plan = planRegions(days(), {});
    expect(plan.before.repeats).toBe(2);
    expect(plan.after.repeats).toBe(0);
    // 한 날에 몰지 않고 나눈다 — 바나힐 두 곳은 DAY 1, 시내는 DAY 2
    const names = plan.days.map((d) => d.items.map((i) => i.name));
    expect(names[0]).toEqual(["바나힐", "바나힐 골든브릿지"]);
    expect(names[1].sort()).toEqual(["다낭 대성당", "한 시장"]);
    expect(names[2]).toEqual(["린응사"]);
    expect(plan.after.km!).toBeLessThan(plan.before.km!);
  });

  it("숙박 도시가 다른 날 사이로는 옮기지 않는다", () => {
    const d = [linearDay(1, [at("한 시장", C1), at("바나힐", B1)], { overnightCity: "다낭" }), linearDay(2, [at("바나힐 골든브릿지", B2)], { overnightCity: "호이안" })];
    const plan = planRegions(d, {});
    expect(plan.moves).toEqual([]);
    expect(plan.skipped[0]).toContain("숙박 도시가 달라");
  });

  it("받는 날이 꽉 차면 그대로", () => {
    const d = [linearDay(1, [at("바나힐", B1, { stayMinutes: 470 })]), linearDay(2, [at("바나힐 골든브릿지", B2, { stayMinutes: 300 }), at("한 시장", C1)])];
    const plan = planRegions(d, {});
    expect(plan.moves).toEqual([]);
    expect(plan.skipped[0]).toContain("시간이 모자라");
  });

  it("숙소가 있는 동네는 매일 오가므로 반복이 아니다", () => {
    const d = [
      linearDay(1, [at("한 시장", C1), at("호텔", C2, { type: "hotel" })]),
      linearDay(2, [at("다낭 대성당", C2), at("바나힐", B1)]),
    ];
    expect(regionRepeats(d, {})).toEqual([]);
  });
});

describe("좌표 저장", () => {
  it("코스 점검 좌표를 넣되, 지도에서 고친 좌표는 그대로", () => {
    const d = [linearDay(1, [item("a"), item("b", { lat: 1, lng: 1, coordEdited: true })])];
    const next = withCoords(d, [
      { id: "a", lat: 16, lng: 108 },
      { id: "b", lat: 2, lng: 2 },
      { id: "c", lat: 0, lng: 0 },
    ]);
    expect(next[0].items[0]).toMatchObject({ lat: 16, lng: 108 });
    expect(next[0].items[1]).toMatchObject({ lat: 1, lng: 1 });
    expect(withCoords(next, [{ id: "a", lat: 16, lng: 108 }])).toBe(next);
  });

  it("엔진 요청에 일정 좌표를 넣는다", () => {
    const req = buildDayRequest(linearDay(1, [at("한 시장", C1), item("x")]), {}, { destination: "다낭", travelType: "semi" });
    expect(req?.places[0]).toMatchObject({ lat: C1.lat, lng: C1.lng });
    expect(req?.places[1].lat).toBeUndefined();
  });
});
