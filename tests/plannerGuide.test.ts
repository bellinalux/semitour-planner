import { describe, expect, it, vi } from "vitest";
import { calculateQuote } from "@/lib/cost";
import { plannerGuide } from "@/lib/plannerGuide";
import type { TripInput } from "@/types";
import { input, item, linearDay } from "./fixtures";

const actions = { goInput: vi.fn(), generate: vi.fn(), goResult: vi.fn(), openSettings: vi.fn(), runAutoQuote: vi.fn(), goDocuments: vi.fn() };
const days = [linearDay(1, [item("a", { entryFee: 10000 })])];

function guide(patch: Partial<TripInput>, withDays = true) {
  const i = input(patch);
  const d = withDays ? days : [];
  return plannerGuide({ input: i, days: d, pmChoice: {}, quote: withDays ? calculateQuote(i, d, {}) : null, generating: false, autoQuoteRunning: false, lastIssued: undefined, actions });
}

describe("진행 단계 안내", () => {
  it("코스가 없으면 ② 코스가 지금 단계이고, 누르면 코스를 만든다", () => {
    const g = guide({}, false);
    expect(g.steps.map((s) => s.status)).toEqual(["done", "current", "todo", "todo"]);
    g.steps[1].onClick();
    expect(actions.generate).toHaveBeenCalled();
  });

  it("빈 원가가 있으면 ③ 견적에서 자동 견적을 돌린다", () => {
    const g = guide({ vehicleCostPerDay: 0, guideCostPerDay: 0 });
    expect(g.steps[2].status).toBe("current");
    g.steps[2].onClick();
    expect(actions.openSettings).toHaveBeenCalledWith("cost");
    expect(actions.runAutoQuote).toHaveBeenCalled();
  });

  it("추정 원가만 남았으면 ③은 확인 필요, ④ 문서가 지금 단계", () => {
    const g = guide({ costStatus: { vehicle: "estimated", guide: "confirmed", other: "confirmed", lodging: "confirmed", flight: "confirmed" } });
    expect(g.steps[2]).toMatchObject({ status: "warn", detail: "확인할 추정값 1건" });
    expect(g.steps[3].status).toBe("current");
    expect(g.stage).toBe("견적");
  });
});
