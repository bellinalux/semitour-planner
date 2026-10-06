import { describe, expect, it } from "vitest";
import { analyzeCompetitor, competitorPriceInOurScope, ourPolicy } from "@/lib/competitorDiff";
import { calculateQuote } from "@/lib/cost";
import { toInputPatch, type RequestParseResult } from "@/lib/schemas/requestParse";
import type { Competitor, QuoteData, TripInput } from "@/types";
import { input, item, linearDay } from "./fixtures";

const days = [linearDay(1, [item("a", { entryFee: 10000 })])];
const landCompetitor: Competitor = {
  id: "k",
  name: "랜드사",
  price: 500000,
  includes: { guide: true, meals: true, admission: true, vehicle: true, hotel: false, flight: false },
  shopping: "none",
  optionTour: "none",
  note: "",
  localPayPerPerson: 50000,
};

function setup(patch: Partial<TripInput>): { q: QuoteData; i: TripInput } {
  const i = input({ packageType: "full", flightPricePerPerson: 300000, ...patch });
  const q = calculateQuote(i, days, {});
  if (!q.ok) throw new Error(q.error);
  return { q, i };
}

describe("경쟁사 비교 기준", () => {
  it("총액 기준: 우리만 포함한 항공을 경쟁사 가격에 더하고, 현지 지불 경비도 더한다", () => {
    const { q, i } = setup({ compareBasis: "total" });
    const d = analyzeCompetitor(landCompetitor, q, i, ourPolicy(days, {}, i, null));
    expect(d.adjustedCompetitorPrice).toBe(500000 + 300000 + 50000);
    expect(d.adjustedOurPrice).toBe(q.scenario.pricePerPerson);
  });

  it("랜드 기준: 우리 가격에서 항공을 뺀다", () => {
    const { q, i } = setup({ compareBasis: "land" });
    const d = analyzeCompetitor(landCompetitor, q, i, ourPolicy(days, {}, i, null));
    expect(d.adjustedOurPrice).toBe(q.scenario.pricePerPerson - 300000);
    expect(d.adjustedCompetitorPrice).toBe(550000);
  });

  it("추천가 계산용: 경쟁사 가격을 우리 범위로 환산", () => {
    const { q, i } = setup({});
    expect(competitorPriceInOurScope(landCompetitor, q, i, ourPolicy(days, {}, i, null))).toBe(850000);
  });
});

describe("한 줄 입력 → 입력칸", () => {
  const base: RequestParseResult = {
    destination: "다낭",
    days: 5,
    nights: -1,
    travelers: 6,
    departureDate: "2026-11-10",
    originCity: "",
    packageType: "full",
    tripScope: "unknown",
    travelType: "unknown",
    targetMarginRate: 20,
    themes: [],
    notes: "시니어 위주",
  };

  it("확인된 값만 채우고, 숙박을 말하지 않았으면 임시로 일수 − 1", () => {
    const { patch, filled } = toInputPatch(base, { notes: "" });
    expect(patch).toMatchObject({ destination: "다낭", days: 5, nights: 4, travelers: 6, packageType: "full", includesFlights: true, targetMarginRate: 20, notes: "시니어 위주" });
    expect(patch.tripScope).toBeUndefined();
    expect(filled).not.toContain("숙박");
  });

  it("숙박을 말했으면 그 값을 쓴다", () => {
    expect(toInputPatch({ ...base, nights: 3 }, { notes: "" }).patch.nights).toBe(3);
  });
});
