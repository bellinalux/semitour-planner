import { describe, expect, it } from "vitest";
import { planDay, type EnginePlace, type EngineOptions } from "@/lib/courseEngine";

const opts: EngineOptions = { start: "09:00", mode: "car", maxEnd: "19:00", lunch: { from: "11:30", to: "13:30" } };
const flat = (n: number, minutes = 20): number[][] => Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => (a === b ? 0 : minutes)));

describe("코스 엔진 — 시간 검사", () => {
  it("휴무일에 넣은 명소는 위반으로 잡는다", () => {
    const places: EnginePlace[] = [
      { id: "a", name: "박물관", stayMin: 60, open: { mon: "closed" } },
      { id: "b", name: "시장", stayMin: 60 },
    ];
    const r = planDay(places, flat(2), { ...opts, weekday: 1 }, false);
    expect(r.current.violations.join()).toMatch(/박물관/);
    expect(r.quality.items.find((i) => i.key === "time")!.score).toBeLessThan(30);
  });

  it("마감 뒤 도착을 피하도록 순서를 바꾼다", () => {
    const places: EnginePlace[] = [
      { id: "a", name: "공원", stayMin: 120 },
      { id: "b", name: "전망대", stayMin: 60, open: { mon: "09:00-10:30" } },
    ];
    const r = planDay(places, flat(2), { ...opts, weekday: 1 });
    expect(r.current.violations.length).toBeGreaterThan(0);
    expect(r.best.order[0]).toBe("b");
    expect(r.best.violations).toHaveLength(0);
    expect(r.quality.fixes.some((f) => f.type === "reorder")).toBe(true);
  });
});

describe("코스 엔진 — 품질 점수", () => {
  it("명소가 한 곳뿐이면 일정 밀도 지적", () => {
    const places: EnginePlace[] = [
      { id: "a", name: "사원", stayMin: 60 },
      { id: "m", name: "점심", stayMin: 60, kind: "meal" },
    ];
    const r = planDay(places, flat(2), opts, false);
    expect(r.quality.items.find((i) => i.key === "density")!.issues).toContain("명소가 한 곳뿐입니다");
  });

  it("시니어는 하루 명소 4곳을 넘으면 감점", () => {
    const places: EnginePlace[] = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `명소${i}`, stayMin: 40 }));
    const any = planDay(places, flat(6, 10), opts, false).quality.items.find((i) => i.key === "density")!;
    const senior = planDay(places, flat(6, 10), { ...opts, audience: "senior" }, false).quality.items.find((i) => i.key === "density")!;
    expect(senior.score).toBeLessThan(any.score);
  });
});
