import { describe, expect, it } from "vitest";
import { estimateMatrix, planDay, schedule, type EngineOptions, type EnginePlace } from "@/lib/courseEngine";
import { buildDayRequest } from "@/lib/engineDay";
import { item, linearDay } from "./fixtures";

const opts = (patch: Partial<EngineOptions> = {}): EngineOptions => ({
  start: "13:40",
  maxEnd: "23:00",
  mode: "car",
  audience: "any",
  lunch: { from: "11:30", to: "14:00" },
  dinner: { from: "18:00", to: "20:30" },
  bufferMin: 5,
  ...patch,
});
const P = (id: string, patch: Partial<EnginePlace> = {}): EnginePlace => ({ id, name: id, stayMin: 30, kind: "sight", ...patch });
const zero = (n: number) => Array.from({ length: n }, () => Array(n).fill(0));

describe("코스 엔진 채점 — 일정표와 맞게", () => {
  it("저녁 식사를 늦은 점심으로 감점하지 않고, 카페는 시간대 없이", () => {
    const places = [P("lunch", { kind: "meal", meal: "lunch", stayMin: 60 }), P("s"), P("cafe", { kind: "meal", meal: "cafe", stayMin: 30 }), P("dinner", { kind: "meal", meal: "dinner", stayMin: 60 })];
    const M = zero(4);
    M[1][2] = 240; // 카페 전 4시간 → 저녁이 18:00 이후
    const r = planDay(places, M, opts({ start: "12:00" }), false);
    expect(r.current.violations.join()).not.toContain("점심이 늦음");
    const meal = r.quality.items.find((i) => i.key === "meal")!;
    expect(meal.score).toBe(15);
  });

  it("같은 구역 장소는 명소 하나로 세고, 구역 안 짧은 체류는 감점하지 않는다", () => {
    const area = Array.from({ length: 9 }, (_, i) => P(`a${i}`, { stayMin: 10, area: "마카오 반도 역사지구" }));
    const r = planDay([...area, P("t1", { area: "타이파" }), P("t2", { area: "타이파" })], zero(11), opts(), false);
    const density = r.quality.items.find((i) => i.key === "density")!;
    expect(density.score).toBe(15);
  });

  it("앱 일정표에서 확인된 이동은 여유 5분을 더하지 않는다", () => {
    const places = [P("a"), P("b")];
    const M = [
      [0, 10],
      [10, 0],
    ];
    const withBuffer = planDay(places, M, opts({ start: "10:00" }), false).current.endTime;
    const exact = planDay(places, M, opts({ start: "10:00", exactLegs: ["a>b"] }), false).current.endTime;
    expect(withBuffer - exact).toBe(5);
  });

  it("항공으로 시작이 정해진 날은 '출발 당기기'를 제안하지 않는다", () => {
    const r = planDay([P("a", { stayMin: 600 }), P("b", { stayMin: 300 })], zero(2), opts({ start: "13:40", maxEnd: "19:00", fixedStart: true }), false);
    expect(r.quality.fixes.some((f) => f.type === "shiftStart")).toBe(false);
  });

  it("시각이 없어 08:00에 시작해 하루가 길고 중간에 자유시간이 있으면 '출발 늦추기'(최대 10:00)를 제안한다", () => {
    const places = [P("a", { stayMin: 240 }), P("free", { kind: "free", stayMin: 120 }), P("b", { stayMin: 300 })];
    const r = planDay(places, zero(3), opts({ start: "08:00", maxEnd: "23:00" }), false);
    expect(r.quality.fixes.find((f) => f.type === "shiftStart")).toMatchObject({ start: "09:00", label: expect.stringContaining("늦추기") });
    // 빈 시간이 없으면 늦춰도 끝이 같이 늦어지므로 제안하지 않는다
    const tight = planDay([P("a", { stayMin: 360 }), P("b", { stayMin: 300 })], zero(2), opts({ start: "08:00", maxEnd: "23:00" }), false);
    expect(tight.quality.fixes.some((f) => f.type === "shiftStart")).toBe(false);
  });
});

describe("엔진 요청 — 앱 일정표 시각·이동·식사 종류·구역", () => {
  it("항공 뒤 첫 항목 시각에서 시작하고, 이동은 일정표 값, 식사 종류와 구역을 보낸다", () => {
    const d = linearDay(
      1,
      [
        item("dep", { type: "flight", name: "인천 출발", stayMinutes: 0, travelMinutesToNext: 180 }),
        item("arr", { type: "flight", name: "마카오 도착", stayMinutes: 30, travelMinutesToNext: 20 }),
        item("lunch", { type: "meal", name: "점심 식사 (굴국수)", stayMinutes: 60, travelMinutesToNext: 0 }),
        item("s1", { name: "탑석광장", stayMinutes: 20, travelMinutesToNext: 0, timeCheck: { basis: "area", area: "역사지구", checkedAt: "x" } }),
        item("cafe", { type: "meal", name: "로드스토우 에그타르트", stayMinutes: 30, travelMinutesToNext: 10 }),
        item("dinner", { type: "meal", name: "저녁 식사 (포르투갈식)", stayMinutes: 60 }),
      ],
      { meetingTime: "09:50" },
    );
    const req = buildDayRequest(d, {}, { destination: "마카오", travelType: "package" as never })!;
    expect(req.start).toBe("13:40"); // 09:50 + 비행 180분 → 12:50 도착, 미팅 30분 + 이동 20분 → 점심 13:40
    expect(req.fixedStart).toBe(true);
    expect(req.legs).toEqual([
      { from: "lunch", to: "s1", minutes: 0 },
      { from: "s1", to: "cafe", minutes: 0 },
      { from: "cafe", to: "dinner", minutes: 10 },
    ]);
    const byId = new Map(req.places.map((p) => [p.id, p]));
    expect(byId.get("lunch")?.meal).toBe("lunch");
    expect(byId.get("cafe")?.meal).toBe("cafe");
    expect(byId.get("dinner")?.meal).toBe("dinner");
    expect(byId.get("s1")?.area).toBe("역사지구");
  });
});

describe("좌표를 모르는 곳은 구역으로 어림", () => {
  it("같은 구역은 5분, 다른 구역은 25분 — 순서를 바꿔도 같은 구역 장소가 붙어 다닌다", () => {
    const places = [
      P("c1", { area: "콜로안" }),
      P("k1", { area: "반도" }),
      P("tart", { kind: "meal", meal: "cafe", area: "콜로안" }),
      P("k2", { area: "반도" }),
    ];
    const M = estimateMatrix(places, "car");
    expect(M[0][2]).toBe(5);
    expect(M[0][1]).toBe(25);
    const order = schedule(places, M, opts({ start: "10:00", maxEnd: "19:00" })).order;
    const at = (id: string) => order.indexOf(id);
    expect(Math.abs(at("c1") - at("tart"))).toBe(1);
    expect(Math.abs(at("k1") - at("k2"))).toBe(1);
  });
});
