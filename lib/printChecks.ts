import { TRUSTED_SOURCES, costSourceLabel } from "@/lib/costSource";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import type { CostKey, DayPlan, QuoteData, TripInput } from "@/types";

/**
 * 고객 문서를 인쇄하기 전에 다시 볼 값 — 직접 확인하지 않은 추정 원가, AI 추정 입장료·식대, 요금을 확인하지 못한 항목.
 * 판매가가 이 값들로 정해지므로, 고객에게 나가기 전에 한 번 확인하게 한다.
 */
/** 판매가에 들어간 추정 원가 중 "확인함"으로 바꿀 수 있는 것 (차량·가이드·숙박·항공·기타) — 요약·추천에서 한눈에 보고 확인 */
export function unconfirmedCosts(quote: QuoteData): { key: CostKey; label: string; amount: number; from: string }[] {
  const keyOf = (k: string): CostKey | null =>
    k === "vehicle" || k === "guide" || k === "other" || k === "flight" ? k : k.startsWith("lodging") ? "lodging" : null;
  const seen = new Set<CostKey>();
  const out: { key: CostKey; label: string; amount: number; from: string }[] = [];
  for (const line of quote.lines) {
    if (line.status !== "estimated" || line.excluded || line.amount <= 0) continue;
    if (line.source && TRUSTED_SOURCES.includes(line.source.kind)) continue;
    const key = keyOf(line.key);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label: line.label, amount: line.amount, from: costSourceLabel(line.source) });
  }
  return out;
}

export function unconfirmedValues(input: TripInput, days: DayPlan[], pmChoice: PmChoice, quote: QuoteData): string[] {
  const out: string[] = [];

  for (const line of quote.lines) {
    if (line.status !== "estimated" || line.excluded || line.amount <= 0) continue;
    if (line.source && TRUSTED_SOURCES.includes(line.source.kind)) continue;
    const from = costSourceLabel(line.source);
    out.push(`${line.label} — 추정${from ? ` (${from})` : ""}`);
  }

  if (input.packageType === "full" && input.selectedFlight?.basis === "estimated") {
    out.push("고른 항공편 요금이 검색으로 확인되지 않은 AI 추정입니다");
  }

  const items = days.flatMap((d) => dayItems(d, pmChoice));
  const estimated = items.filter((i) => i.isEstimated && (i.entryFee > 0 || i.mealCost > 0) && i.payment !== "local");
  if (estimated.length > 0) {
    const names = estimated.slice(0, 3).map((i) => i.name).join(", ");
    out.push(`AI 추정 입장료·식대 ${estimated.length}개 (${names}${estimated.length > 3 ? " 등" : ""}) — "입장료·체류시간 웹 확인"으로 확인할 수 있습니다`);
  }
  const unverified = items.filter((i) => i.feeCheck?.status === "unverified" && i.entryFee > 0).length;
  if (unverified > 0) out.push(`웹에서 요금을 확인하지 못한 항목 ${unverified}개`);

  return out;
}
