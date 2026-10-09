import { describe, expect, it } from "vitest";
import { planDay, type EngineOptions, type EnginePlace } from "@/lib/courseEngine";
import { findZigzag, groupByArea } from "@/lib/routeOrder";
import { item, linearDay } from "./fixtures";

const at = (id: string, name: string, area: string, patch = {}) =>
  item(id, { name, stayMinutes: 30, travelMinutesToNext: 5, timeCheck: { basis: "area", area, checkedAt: "x" }, ...patch });

// 반도 → 타이파 → 반도로 되돌아옴 (지그재그), 점심·야경·숙소는 제자리
const zig = () =>
  linearDay(1, [
    at("a1", "탑석광장", "반도"),
    { ...at("a2", "몬테요새", "반도"), travelMinutesToNext: 25 },
    item("lunch", { type: "meal", name: "점심 식사", stayMinutes: 60, travelMinutesToNext: 10 }),
    { ...at("t1", "타이파 빌리지", "타이파"), travelMinutesToNext: 25 },
    at("a3", "세나도 광장", "반도"),
    item("night", { name: "윈팰리스 분수쇼 야경", stayMinutes: 40, travelMinutesToNext: 10, timeCheck: { basis: "area", area: "코타이", checkedAt: "x" } }),
    item("hotel", { type: "hotel", name: "호텔", stayMinutes: 0 }),
  ]);

describe("지그재그 동선 찾기·고치기", () => {
  it("떠났던 구역으로 되돌아오면 알린다 (식사·밤 일정·숙소는 판단에서 뺀다)", () => {
    expect(findZigzag(zig(), {})).toEqual([{ area: "반도", from: "타이파" }]);
  });

  it("구역이 처음 나온 순서대로 붙이고, 구역 안은 원래 순서, 식사·밤 일정·숙소는 제자리", () => {
    const next = groupByArea(zig());
    // (점심 시간대를 맞추는 대기 자유시간은 빼고 본다)
    expect(next.items.filter((i) => !i.id.startsWith("lunch-free")).map((i) => i.id)).toEqual(["a1", "a2", "lunch", "a3", "t1", "night", "hotel"]);
    expect(findZigzag(next, {})).toEqual([]);
    // 같은 구역 다음은 구역 안 걷기, 구역을 떠날 때는 원래 그 구역을 떠날 때 걸린 시간
    expect(next.items.find((i) => i.id === "a3")?.travelMinutesToNext).toBe(25);
    expect(groupByArea(next)).toBe(next);
  });
});

const opts: EngineOptions = { start: "10:00", maxEnd: "23:00", mode: "car", audience: "any", bufferMin: 0 };
const P = (id: string, area: string, patch: Partial<EnginePlace> = {}): EnginePlace => ({ id, name: id, stayMin: 30, kind: "sight", area, ...patch });

describe("코스 엔진 — 한 방향으로, 원래 코스 순서대로", () => {
  it("되돌아오는 순서를 지그재그로 감점하고, 추천은 구역을 붙인다", () => {
    const places = [P("a1", "반도"), P("t1", "타이파"), P("a2", "반도")];
    // 이동표상으로는 a1→t1→a2가 조금 더 짧아도 되돌아오지 않는다
    const M = [
      [0, 10, 12],
      [10, 0, 10],
      [12, 10, 0],
    ];
    const r = planDay(places, M, opts);
    expect(r.current.zigzag).toHaveLength(1);
    expect(r.quality.items.find((i) => i.key === "route")?.issues.join()).toContain("지그재그");
    expect(r.best.order).toEqual(["a1", "a2", "t1"]);
    expect(r.best.zigzag).toEqual([]);
  });

  it("같은 구역 안은 원래 코스 순서(걷는 길)를 지킨다", () => {
    const places = ["탑석", "라자로", "몬테", "성바울", "세나도"].map((n) => P(n, "역사지구"));
    const M = places.map(() => places.map(() => 3));
    expect(planDay(places, M, opts).best.order).toEqual(["탑석", "라자로", "몬테", "성바울", "세나도"]);
  });

  it("엔진도 피할 수 없는 되돌아옴은 이유(예약 시각)를 붙이고 덜 감점한다", () => {
    const places = [P("a1", "반도", { lastEntry: "10:30" }), P("t1", "타이파", { lastEntry: "11:00" }), P("a2", "반도", { fixedTime: "13:00" })];
    const M = places.map((_, i) => places.map((__, j) => (i === j ? 0 : 10)));
    const r = planDay(places, M, opts);
    expect(r.best.order).toEqual(["a1", "t1", "a2"]);
    const route = r.quality.items.find((i) => i.key === "route")!;
    expect(route.issues.join()).toContain("불가피: 예약 13:00 고정");
    expect(route.score).toBe(22);
  });

  it("숙소 쪽 지역을 먼저 돌면 알린다 — 원래 코스 순서가 우선이라, 이동이 줄 때만 순서를 바꾼다", () => {
    const places = [P("c1", "코타이"), P("k1", "콜로안"), P("show", "코타이", { best: "night" })];
    const M = places.map((_, i) => places.map((__, j) => (i === j ? 0 : 15)));
    const home = { ...opts, homeRegion: "코타이" };
    const r = planDay(places, M, home);
    expect(r.quality.items.find((i) => i.key === "route")?.issues.join()).toContain("숙소 쪽(코타이)을 먼저");
    expect(r.best.order).toEqual(["c1", "k1", "show"]);
    // 숙소 쪽에서 먼 곳으로 가는 길이 멀면(왕복 이동이 크면) 먼 곳 먼저로 바꾼다
    const far = [
      [0, 40, 1],
      [40, 0, 40],
      [1, 40, 0],
    ];
    expect(planDay(places, far, { ...home, start: "10:00", sunset: "18:00" }).best.order).toEqual(["k1", "c1", "show"]);
  });

  it("밤 일정(야경)은 지나온 구역이어도 지그재그가 아니다", () => {
    const places = [P("c1", "코타이"), P("a1", "반도"), P("show", "코타이", { best: "night" })];
    expect(planDay(places, [[0, 20, 1], [20, 0, 20], [1, 20, 0]], opts, false).current.zigzag).toEqual([]);
  });
});

describe("큰 지역 기준·식당 위치", () => {
  const rg = (id: string, name: string, area: string, region: string, patch = {}) =>
    item(id, { name, stayMinutes: 30, travelMinutesToNext: 10, timeCheck: { basis: "area", area, region, checkedAt: "x" }, ...patch });

  it("구역 이름이 달라도 같은 큰 지역(마카오 반도)으로 되돌아오면 지그재그", () => {
    const d = linearDay(1, [
      rg("a", "카모에스 공원", "반도 북부 역사지구", "마카오 반도"),
      rg("c", "콜로안 빌리지", "콜로안 빌리지", "콜로안"),
      rg("h", "호텔 투어", "남만호/호텔 구역", "마카오 반도"),
    ]);
    expect(findZigzag(d, {})).toEqual([{ area: "마카오 반도", from: "콜로안" }]);
    expect(findZigzag(groupByArea(d), {})).toEqual([]);
  });

  it("다른 지역 식당에 갔다가 되돌아오는 것도 지그재그 — 점심은 묶기로 옮기지 않으니 엔진 점검으로", () => {
    const d = linearDay(1, [
      rg("c1", "콜로안 빌리지", "콜로안", "콜로안"),
      rg("lunch", "점심 식사 (딤섬)", "베네시안", "코타이", { type: "meal" }),
      rg("c2", "하비에르 성당", "콜로안", "콜로안"),
    ]);
    expect(findZigzag(d, {})).toEqual([{ area: "콜로안", from: "코타이" }]);
    expect(findZigzag(groupByArea(d), {})).toHaveLength(1);
  });
});

describe("동선상 식당", () => {
  const rg = (id: string, name: string, region: string, patch = {}) =>
    item(id, { name, stayMinutes: 30, travelMinutesToNext: 10, timeCheck: { basis: "area", area: region, region, checkedAt: "x" }, ...patch });

  it("앞뒤 장소와 다른 지역 식당에 갔다가 되돌아오면 알리고, 그 지역 안 식당을 찾을 기준을 준다", async () => {
    const { offRouteMeals } = await import("@/lib/routeOrder");
    const d = linearDay(1, [
      rg("c1", "콜로안 빌리지", "콜로안"),
      rg("lunch", "점심 식사 (딤섬)", "코타이", { type: "meal" }),
      rg("c2", "하비에르 성당", "콜로안"),
      rg("t1", "베네시안", "코타이"),
    ]);
    expect(offRouteMeals(d, {})).toEqual([
      { mealId: "lunch", mealName: "점심 식사 (딤섬)", mealRegion: "코타이", hereRegion: "콜로안", nearPlaces: ["콜로안 빌리지", "하비에르 성당"], meal: "lunch", cuisine: "딤섬" },
    ]);
    // 식사 뒤 다른 지역으로 가는 길이면(콜로안 → 점심(코타이) → 코타이) 동선상이다
    const onWay = linearDay(1, [rg("c1", "콜로안 빌리지", "콜로안"), rg("lunch", "점심", "코타이", { type: "meal" }), rg("t1", "베네시안", "코타이")]);
    expect(offRouteMeals(onWay, {})).toEqual([]);
  });
});
