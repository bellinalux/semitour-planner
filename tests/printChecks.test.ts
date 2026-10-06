import { describe, expect, it } from "vitest";
import { calculateQuote } from "@/lib/cost";
import { costSourceLabel } from "@/lib/costSource";
import { unconfirmedValues } from "@/lib/printChecks";
import type { TripInput } from "@/types";
import { input, item, linearDay } from "./fixtures";

const days = [linearDay(1, [item("a", { name: "바나힐", entryFee: 10000, isEstimated: true }), item("m", { type: "meal", mealCost: 20000 })])];

function checks(patch: Partial<TripInput>) {
  const i = input(patch);
  const q = calculateQuote(i, days, {});
  if (!q.ok) throw new Error(q.error);
  return unconfirmedValues(i, days, {}, q);
}

describe("인쇄 전 확인 목록", () => {
  it("웹 검색으로 채운 추정 원가와 AI 추정 입장료를 알려 준다", () => {
    const list = checks({
      costStatus: { vehicle: "estimated", guide: "confirmed", other: "confirmed", lodging: "confirmed", flight: "confirmed" },
      costSource: { vehicle: { kind: "web", at: "2026-10-05T00:00:00Z" } },
    });
    expect(list[0]).toBe("차량비 — 추정 (웹 검색 · 10.05)");
    expect(list.some((l) => l.includes("AI 추정 입장료·식대 1개 (바나힐)"))).toBe(true);
  });

  it("직접 입력하거나 고른 상품 값은 추정이어도 묻지 않는다", () => {
    const list = checks({
      packageType: "land_hotel",
      lodgingRatePerNight: 80000,
      costStatus: { vehicle: "estimated", guide: "confirmed", other: "confirmed", lodging: "estimated", flight: "confirmed" },
      costSource: { vehicle: { kind: "manual", at: "" }, lodging: { kind: "hotel", at: "", note: "풀만" } },
    });
    expect(list.filter((l) => l.includes("추정 ("))).toHaveLength(0);
  });

  it("출처 표시", () => {
    expect(costSourceLabel({ kind: "flight", at: "", note: "VJ879" })).toBe("고른 항공편 · VJ879");
    expect(costSourceLabel({ kind: "memory", at: "2026-09-30T10:00:00Z" })).toBe("지난 견적 · 09.30");
  });
});
