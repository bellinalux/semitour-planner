import { describe, expect, it } from "vitest";
import { calculateQuote } from "@/lib/cost";
import { buildCostSheet, costSheetTable } from "@/lib/costSheet";
import type { TripInput } from "@/types";
import { input, item, linearDay } from "./fixtures";

const days = [
  linearDay(1, [item("a", { name: "바나힐", entryFee: 50000 }), item("m", { name: "점심", type: "meal", mealCost: 20000 })]),
  linearDay(2, [item("b", { name: "호이안", entryFee: 20000, isEstimated: true }), item("x", { name: "현지 지불 체험", entryFee: 99000, payment: "local" })]),
];

function sheetFor(patch: Partial<TripInput>) {
  const i = input({ packageType: "land_hotel", nights: 2, lodgingRatePerNight: 100000, contingencyRate: 5, tipPerPerson: 5000, ...patch });
  const q = calculateQuote(i, days, {});
  if (!q.ok) throw new Error(q.error);
  return { i, q, sheet: buildCostSheet(i, days, {}, q) };
}

describe("원가 계산서", () => {
  it("합계가 견적 총 원가와 같다", () => {
    const { q, sheet } = sheetFor({ travelers: 5 });
    expect(sheet.total).toBeCloseTo(q.scenario.baseCost);
    expect(sheet.perPerson).toBeCloseTo(q.scenario.costPerPerson);
  });

  it("숙박은 호텔·방 수(2인 1실)·박수, 차량은 인원별 차종으로", () => {
    const { sheet } = sheetFor({ travelers: 5, selectedHotels: { 다낭: { name: "풀만 다낭", grade: "", area: "", nearestStation: "", walkMinutes: 0, nightlyLow: 0, nightlyHigh: 0, priceBasis: "searched", mapUrl: "" } } });
    expect(sheet.rows.find((r) => r.group === "숙박")).toMatchObject({ item: "풀만 다낭", unitPrice: 100000, qty: "2.5실 × 2박", amount: 500000 });
    expect(sheet.rows.find((r) => r.group === "지상" && r.item.startsWith("차량"))?.item).toBe("차량 — 7인승 SUV·MPV");
  });

  it("입장료·식사는 일정 항목별, 현지 지불은 빼고, AI 추정은 추정으로", () => {
    const { sheet } = sheetFor({ travelers: 4 });
    const admission = sheet.rows.filter((r) => r.group === "입장·체험");
    expect(admission.map((r) => r.item)).toEqual(["DAY 1 바나힐", "DAY 2 호이안"]);
    expect(admission[1]).toMatchObject({ status: "추정", source: "AI 추정", amount: 80000 });
    expect(sheet.rows.find((r) => r.group === "식사")).toMatchObject({ item: "DAY 1 점심", perPerson: 20000 });
  });

  it("엑셀 표: 머리줄·항목·합계·판매가 요약", () => {
    const { sheet } = sheetFor({ travelers: 4 });
    const table = costSheetTable(sheet, "다낭 2박3일 원가 계산서", "조건");
    expect(table[3]).toEqual(["구분", "항목", "단가", "수량", "금액", "1인 금액", "확정 여부", "출처"]);
    expect(table.some((r) => r[0] === "합계" && r[4] === Math.round(sheet.total))).toBe(true);
    expect(table.some((r) => r[0] === "회사 이익")).toBe(true);
  });
});
