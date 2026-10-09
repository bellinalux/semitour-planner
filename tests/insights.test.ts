import { describe, expect, it } from "vitest";
import { calculateQuote } from "@/lib/cost";
import { formatMoney } from "@/lib/currency";
import { buildInsights, keyNumbers, type InsightInput } from "@/lib/insights";
import type { TripInput } from "@/types";
import { input, item, linearDay } from "./fixtures";

const days = [linearDay(1, [item("a", { name: "바나힐", entryFee: 50000 })]), linearDay(2, [item("b", { name: "호이안", entryFee: 20000 })])];
const money = (v: number) => formatMoney(Math.round(v), "KRW");

function args(patch: Partial<TripInput>, extra: Partial<InsightInput> = {}): InsightInput {
  const i = input(patch);
  return { input: i, days, pmChoice: {}, meta: null, quote: calculateQuote(i, days, {}), budgetFit: null, money, ...extra };
}

describe("요약 · 추천", () => {
  it("핵심 숫자: 1인 판매가·원가·수익·수익률, 판매가에서 시작하면 예산 상태", () => {
    const a = args({ pricingMode: "fixed_price", fixedPricePerPerson: 1_000_000, cardFeeRate: 0, targetMarginRate: 15 });
    const n = keyNumbers(a)!;
    expect(n.pricePerPerson).toBe(1_000_000);
    expect(n.profitPerPerson).toBeCloseTo(n.pricePerPerson - n.costPerPerson);
    expect(n.status[0]).toMatchObject({ tone: "good" });
    expect(n.status[0].text).toContain("예산 안");
    expect(keyNumbers({ ...a, quote: null })).toBeNull();
  });

  it("비어 있는 원가는 '입력에서 채우기', 수신처는 낮은 순위", () => {
    const list = buildInsights(args({ vehicleCostPerDay: 0, guideCostPerDay: 0, customerName: "" }));
    expect(list[0]).toMatchObject({ tone: "warn", title: "차량·가이드비가 비어 있습니다", action: { kind: "focus", section: "cost" } });
    expect(list.at(-1)).toMatchObject({ tone: "info", action: { kind: "focus", section: "documents" } });
  });

  it("예산 초과면 한 번에 줄이기, 바꾼 뒤에는 되돌리기", () => {
    const plan = {
      deficit: 30000,
      actions: [{ kind: "to-option" as const, itemId: "a", dayNo: 1, name: "바나힐", savingPerPerson: 50000 }],
      gapAfter: 20000,
      enough: true,
    };
    const over = buildInsights(args({ customerName: "A" }, { budgetFit: { plan, upgrades: [], applied: [] } }));
    expect(over.find((i) => i.id === "budget-over")).toMatchObject({ tone: "warn", action: { kind: "budget-apply", label: "한 번에 줄이기" } });
    const done = buildInsights(args({ customerName: "A" }, { budgetFit: { plan: null, upgrades: [], applied: ["바나힐을 선택 옵션으로"] } }));
    expect(done.find((i) => i.id === "budget-applied")).toMatchObject({ tone: "good", action: { kind: "budget-undo" } });
  });

  it("일정이 너무 긴 날은 일정 시간 검증으로 맞추기, 경고가 먼저 온다", () => {
    const long = [linearDay(1, [item("x", { name: "긴 일정", stayMinutes: 900, travelMinutesToNext: 60 }), item("y", { name: "또", stayMinutes: 60 })])];
    const i = input({ customerName: "" });
    const list = buildInsights({ input: i, days: long, pmChoice: {}, meta: null, quote: calculateQuote(i, long, {}), budgetFit: null, money });
    expect(list.find((x) => x.id === "day-1")).toMatchObject({ tone: "warn", action: { kind: "fix-day-time", days: [1], label: "일정 시간 검증으로 맞추기" } });
    expect(list.findIndex((x) => x.tone === "info")).toBeGreaterThan(list.findIndex((x) => x.id === "day-1"));
  });

  it("확인한 시간으로도 긴 날은 옮길 묶음이 있으면 '옮기기', 엔진 점수가 낮은 날은 '100점 만들기 보기'", () => {
    const checked = { basis: "area" as const, area: "역사지구", checkedAt: "x" };
    const long = [
      linearDay(1, [item("x", { name: "긴 일정", stayMinutes: 700, travelMinutesToNext: 10, timeCheck: checked }), item("y", { name: "또", stayMinutes: 60 })]),
      linearDay(2, [item("f", { type: "free_time", name: "자유 일정", stayMinutes: 600 })]),
    ];
    const move = { fromDay: 1, toDay: 2, itemIds: ["y"], label: "또(1곳, 1시간)을 DAY 2로 옮기기", minutes: 60 };
    const i = input({ customerName: "" });
    const list = buildInsights({
      input: i,
      days: long,
      pmChoice: {},
      meta: null,
      quote: calculateQuote(i, long, {}),
      budgetFit: null,
      money,
      engine: { scores: { 1: { score: 62, grade: "D", top: "시간: 점심이 늦음", best: 90 }, 2: { score: 95, grade: "A", top: "", best: 95 } }, moves: [move] },
    });
    expect(list.find((x) => x.id === "day-1")).toMatchObject({ action: { kind: "engine-move", move, label: "DAY 2로 옮기기" } });
    expect(list.find((x) => x.id === "engine-1")).toMatchObject({
      tone: "warn",
      title: "DAY 1 코스 점수 62점 (D)",
      detail: "시간: 점심이 늦음 · 엔진 추천대로 고치면 90점",
      action: { kind: "scroll", target: "course-engine" },
    });
    expect(list.some((x) => x.id === "engine-2")).toBe(false);
  });
});

describe("요약 · 추천 — 비행 시간", () => {
  it("출발 비행 항목의 비행 시간이 50분 미만이면 경고, 비어 있으면 안내", () => {
    const short = [
      linearDay(1, [
        item("f", { type: "flight", name: "인천 출발", stayMinutes: 0, travelMinutesToNext: 20 }),
        item("a", { type: "flight", name: "마카오 도착" }),
      ]),
    ];
    const i = input({ customerName: "A" });
    const list = buildInsights({ input: i, days: short, pmChoice: {}, meta: null, quote: calculateQuote(i, short, {}), budgetFit: null, money });
    expect(list.find((x) => x.id.startsWith("flight-1"))).toMatchObject({ tone: "warn", title: "DAY 1 비행 시간이 20분으로 되어 있습니다" });
    const unknown = [
      linearDay(1, [
        item("f", { type: "flight", name: "인천 출발", travelMinutesToNext: null }),
        item("t", { type: "transfer", name: "다낭 도착 · 호텔 이동" }),
      ]),
    ];
    const list2 = buildInsights({ input: i, days: unknown, pmChoice: {}, meta: null, quote: calculateQuote(i, unknown, {}), budgetFit: null, money });
    expect(list2.find((x) => x.id.startsWith("flight-1"))).toMatchObject({ tone: "info", title: "DAY 1 비행 시간을 아직 모릅니다" });
  });
});
