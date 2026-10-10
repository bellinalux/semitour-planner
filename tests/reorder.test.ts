import { describe, expect, it } from "vitest";
import { diffDays } from "@/lib/reorder";
import { item, linearDay } from "./fixtures";

describe("코스 재정렬 비교", () => {
  it("순서·끝나는 시각·이동·점수·한 일을 날마다 비교", () => {
    const before = [linearDay(1, [item("a", { name: "A", travelMinutesToNext: 40 }), item("b", { name: "B", travelMinutesToNext: 40 }), item("c", { name: "C" })]), linearDay(2, [item("d", { name: "D" })])];
    const after = [linearDay(1, [item("b", { name: "B", travelMinutesToNext: 10 }), item("a", { name: "A", travelMinutesToNext: 10 }), item("c", { name: "C" })]), before[1]];
    const d = diffDays(before, after, {}, { scores: { 1: { before: 60, after: 85 } }, notes: { 1: ["추천 순서 (점검 60 → 85점)"] } });
    expect(d[0]).toMatchObject({ day: 1, before: ["A", "B", "C"], after: ["B", "A", "C"], travelBefore: 80, travelAfter: 20, scoreBefore: 60, scoreAfter: 85, changed: true });
    expect(d[0].endAfter < d[0].endBefore).toBe(true);
    expect(d[1].changed).toBe(false);
  });
});
