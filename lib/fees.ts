import { formatMoney } from "@/lib/currency";
import { dayItems, mapDayItems, type PmChoice } from "@/lib/itinerary";
import type { FeeCheckResult } from "@/lib/schemas/market";
import type { CurrencyCode, DayPlan, ItineraryItem, TripInput } from "@/types";

/** 고객이 현지에서 직접 내는(판매가에 포함되지 않는) 항목인가 */
export function isLocalPay(item: ItineraryItem): boolean {
  return item.payment === "local";
}

/** 견적 통화 금액을 원화로. 이미 원화면 그대로, 환율이 없으면 null. 100원 단위로 반올림한다(약 표기용). */
export function krwOf(amount: number, currency: CurrencyCode, rate: number): number | null {
  if (currency === "KRW") return amount;
  if (!(rate > 0)) return null;
  return Math.round((amount * rate) / 100) * 100;
}

/** "฿500 (약 ₩19,000)" — 원화 환산이 불가능하거나 이미 원화면 통화 표기 하나만 */
export function moneyWithKrw(amount: number, currency: CurrencyCode, rate: number): string {
  const base = formatMoney(amount, currency);
  if (currency === "KRW") return base;
  const krw = krwOf(amount, currency, rate);
  return krw === null ? base : `${base} (약 ${formatMoney(krw, "KRW")})`;
}

/**
 * 항목 요금(입장료·체험료)의 "현지 금액 + 원화" 표기.
 * 웹 확인으로 현지 통화 금액이 있고 견적 통화와 다르면 현지 금액을 앞세우고 견적 통화 금액을 원화로 함께 적는다.
 * (견적 통화가 원화인 경우: 현지 ฿500 → 약 ₩19,000)
 */
export function itemFeeText(amount: number, item: ItineraryItem, input: Pick<TripInput, "currency" | "exchangeRateToKrw">): string {
  const local = item.local;
  if (local && local.currency !== input.currency) {
    const krw = krwOf(amount, input.currency, input.exchangeRateToKrw);
    return krw === null ? formatMoney(local.amount, local.currency) : `${formatMoney(local.amount, local.currency)} (약 ${formatMoney(krw, "KRW")})`;
  }
  return moneyWithKrw(amount, input.currency, input.exchangeRateToKrw);
}

export interface LocalPayRow {
  day: number;
  name: string;
  /** 견적 통화 기준 1인 금액 (입장료 + 식대) */
  amount: number;
  item: ItineraryItem;
}

/** 진행되는 일정 중 현지 지불(불포함) 항목과 1인 합계. 요금이 0인 항목도 "현지 지불"이라고 표시했다면 목록에 넣는다. */
export function localPayRows(days: DayPlan[], pmChoice: PmChoice): { rows: LocalPayRow[]; perPerson: number } {
  const rows: LocalPayRow[] = [];
  for (const day of days) {
    for (const item of dayItems(day, pmChoice)) {
      if (isLocalPay(item)) rows.push({ day: day.day, name: item.name, amount: item.entryFee + item.mealCost, item });
    }
  }
  return { rows, perPerson: rows.reduce((sum, r) => sum + r.amount, 0) };
}

export interface FeeApplySummary {
  /** 웹에서 확인해 금액을 반영한 항목 수 */
  applied: number;
  /** 무료로 확인된 항목 수 */
  free: number;
  /** 확인했지만 직접 입력한 금액과 달라 그대로 둔 항목 수 */
  differs: number;
  /** 확인하지 못한 항목 수 */
  unverified: number;
}

/** 직접 입력한 금액과 웹 확인 금액이 이 비율 이내로 같으면 "일치"로 본다 */
const SAME_FEE_TOLERANCE = 0.05;

/**
 * 웹 확인 결과를 일정 항목에 반영한다.
 *  - AI 추정치이거나 0원이던 금액은 확인된 금액으로 바꾼다.
 *  - 사용자가 직접 입력한 금액은 함부로 덮어쓰지 않고, 크게 다르면 "입력값과 다름"으로 표시만 한다.
 *  - 확인하지 못한 항목은 금액을 건드리지 않고 "확인 못함"으로 표시한다.
 */
export function applyFeeResults(
  days: DayPlan[],
  results: FeeCheckResult[],
  checkedAt: string,
): { days: DayPlan[]; summary: FeeApplySummary } {
  const byId = new Map(results.map((r) => [r.id, r]));
  const summary: FeeApplySummary = { applied: 0, free: 0, differs: 0, unverified: 0 };

  const patchOf = (item: ItineraryItem, r: FeeCheckResult): ItineraryItem => {
    const base = { note: r.note, sourceName: r.sourceName, checkedAt };
    const local = r.localCurrency && r.localAmount > 0 ? { currency: r.localCurrency as CurrencyCode, amount: r.localAmount } : undefined;

    if (r.status === "unverified") {
      summary.unverified++;
      return { ...item, feeCheck: { ...base, status: "unverified" } };
    }
    if (r.amountInQuote === null) {
      // 현지 금액은 확인했지만 견적 통화로 환산하지 못한 경우: 금액은 그대로 두고 현지 금액만 보여 준다
      summary.unverified++;
      return { ...item, local, feeCheck: { ...base, status: "unverified", note: `${r.note} (견적 통화로 환산하지 못해 금액은 그대로 두었습니다)`.trim() } };
    }

    const found = r.amountInQuote;
    const canOverwrite = item.isEstimated || item.entryFee === 0;
    const close = item.entryFee > 0 ? Math.abs(item.entryFee - found) / item.entryFee <= SAME_FEE_TOLERANCE : found === 0;
    if (canOverwrite || close) {
      if (r.status === "free") summary.free++;
      else summary.applied++;
      return {
        ...item,
        entryFee: found,
        isEstimated: false,
        local,
        feeCheck: { ...base, status: r.status === "free" ? "free" : "confirmed" },
      };
    }
    summary.differs++;
    return { ...item, local, feeCheck: { ...base, status: "differs", foundAmount: found } };
  };

  const next = days.map((day) => mapDayItems(day, (item) => (byId.has(item.id) ? patchOf(item, byId.get(item.id)!) : item)));
  return { days: next, summary };
}

/** 입장료·체험료가 붙을 수 있는 유형인가 (항공·이동·숙소·자유시간·식사는 제외) */
export function hasEntryFee(item: ItineraryItem): boolean {
  const type = item.type;
  if (type === undefined) return item.admission !== "view_only";
  return !["flight", "transfer", "hotel", "free_time", "meal"].includes(type) && item.admission !== "view_only";
}

/** 웹 확인을 요청할 항목들 (모든 날, 오후 A/B 코스 포함). 숙박 도시는 같은 이름의 장소를 구분하는 데 쓴다. */
export function feeCheckTargets(days: DayPlan[]): { id: string; name: string; city?: string }[] {
  const out: { id: string; name: string; city?: string }[] = [];
  for (const day of days) {
    const city = (day.overnightCity ?? "").trim() || undefined;
    const all = [...day.items, ...day.amGuided, ...day.pmFreeOptions.flatMap((o) => o.items)];
    for (const item of all) if (hasEntryFee(item)) out.push({ id: item.id, name: item.name, city });
  }
  return out;
}

/**
 * 입력칸 옆에 붙이는 보조 표기.
 *  - 현지 통화 금액을 웹에서 확인했고 견적 통화와 다르면 "현지 ฿500 · 약 ₩19,000"
 *  - 견적 통화가 원화가 아니고 환율이 있으면 "약 ₩19,000"
 *  - 그 외에는 빈 문자열
 */
export function feeHint(amount: number, item: Pick<ItineraryItem, "local">, currency: CurrencyCode, rate: number): string {
  const local = item.local;
  const krw = currency === "KRW" ? amount : krwOf(amount, currency, rate);
  const krwText = krw !== null && amount > 0 ? `약 ${formatMoney(krw, "KRW")}` : "";
  if (local && local.currency !== currency) {
    const localText = `현지 ${formatMoney(local.amount, local.currency)}`;
    return [localText, currency === "KRW" ? "" : krwText, currency === "KRW" ? `약 ${formatMoney(amount, "KRW")}` : ""].filter(Boolean).join(" · ");
  }
  return currency === "KRW" ? "" : krwText;
}

const feeWord = (item: ItineraryItem) => (item.type === "experience" || item.type === "massage" ? "체험료" : item.type === "meal" ? "식대" : "입장료");

/**
 * 고객용 코스 상세에 붙이는 요금 표기.
 *  - 현지 지불: "입장료 현지 지불 ฿500 (약 ₩19,000)"
 *  - 판매가 포함: "입장료 포함"
 *  - 요금이 없으면 빈 문자열
 */
export function customerFeeNote(item: ItineraryItem, input: Pick<TripInput, "currency" | "exchangeRateToKrw">): string {
  const total = item.entryFee + item.mealCost;
  const word = feeWord(item);
  if (isLocalPay(item)) {
    return total > 0 ? `${word} 현지 지불 ${itemFeeText(total, item, input)}` : `${word} 현지 지불`;
  }
  return total > 0 ? `${word} 포함` : "";
}

/** 현지 지불 안내 블록의 줄들 (고객용). 없으면 빈 배열. */
export function localPaySection(days: DayPlan[], pmChoice: PmChoice, input: Pick<TripInput, "currency" | "exchangeRateToKrw">, decorated: boolean): string[] {
  const { rows, perPerson } = localPayRows(days, pmChoice);
  if (rows.length === 0) return [];
  const head = decorated ? "💵 현지 지불 안내 (판매가에 포함되지 않으며 현지에서 직접 지불)" : "■ 현지 지불(불포함) 안내 — 판매가에 포함되지 않으며 고객님이 현지에서 직접 지불합니다";
  const bullet = decorated ? "▪" : "-";
  return [
    head,
    ...rows.map((r) => `${bullet} DAY ${r.day} ${r.name}: ${r.amount > 0 ? itemFeeText(r.amount, r.item, input) : "현지 지불"}`),
    ...(perPerson > 0 ? [`${bullet} 1인 합계 약 ${moneyWithKrw(perPerson, input.currency, input.exchangeRateToKrw)}`] : []),
    "※ 현지 요금과 환율은 시즌·현지 사정에 따라 달라질 수 있습니다.",
  ];
}

/** 내부용: 요금 확인 상태 꼬리표 */
export function feeTag(item: ItineraryItem): string {
  const parts: string[] = [];
  if (isLocalPay(item)) parts.push("현지지불");
  const check = item.feeCheck;
  if (check?.status === "confirmed") parts.push("웹확인");
  else if (check?.status === "free") parts.push("무료확인");
  else if (check?.status === "differs") parts.push("웹확인가 다름");
  else if (check?.status === "unverified") parts.push("확인못함");
  return parts.length > 0 ? ` [${parts.join("·")}]` : "";
}
