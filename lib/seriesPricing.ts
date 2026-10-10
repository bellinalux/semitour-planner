import type { PmChoice } from "@/lib/itinerary";
import { documentQuote } from "@/lib/pricing";
import { calculateQuote } from "@/lib/cost";
import { salePrice } from "@/lib/priceLevers";
import { roundDownPrice } from "@/lib/priceRound";
import { quotePriceFor } from "@/lib/supplierQuote";
import type { CurrencyCode, DayPlan, TripInput } from "@/types";

/**
 * 시리즈 출발 일괄 견적 — "11~12월 매주 목요일" 같은 회차마다 판매가를 한 번에 낸다.
 *  - 업체 요일별 요금이 있으면 회차의 요일 요금으로, 없으면 지금 견적 그대로
 *  - 한국 공휴일·연휴가 여행 기간에 걸치면 표시 (수요·항공 요금이 오르는 때)
 * 할인 규칙 — 조기 예약(출발 N일 전까지 예약)·막판(출발 N일 이내) 할인을 회차별 할인가·마감일로 보여 주고, 고객 문서에 안내한다.
 */

export interface PriceRule {
  id: string;
  kind: "early" | "late";
  /** early: 출발 이만큼 전까지 예약 / late: 출발 이만큼 이내 */
  days: number;
  /** 할인율 % */
  rate: number;
}

const RULES_KEY = "semitour-planner:priceRules";

export function loadPriceRules(): PriceRule[] {
  try {
    const list = JSON.parse(localStorage.getItem(RULES_KEY) ?? "[]") as PriceRule[];
    return Array.isArray(list) ? list.filter((r) => (r.kind === "early" || r.kind === "late") && r.days > 0 && r.rate > 0 && r.rate < 50) : [];
  } catch {
    return [];
  }
}

export function savePriceRules(rules: PriceRule[]): void {
  try {
    localStorage.setItem(RULES_KEY, JSON.stringify(rules));
  } catch {
    /* 저장 못 해도 화면은 계속 */
  }
}

/** 고객 문서에 넣는 안내 줄 */
export function ruleNotices(rules: PriceRule[]): string[] {
  return rules.map((r) => (r.kind === "early" ? `조기 예약 할인: 출발 ${r.days}일 전까지 예약하면 ${r.rate}% 할인` : `출발 임박 특가: 출발 ${r.days}일 이내 예약 시 ${r.rate}% 할인 (잔여석 한정)`));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(`${s}T00:00:00Z`);
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** 기간 안에서 고른 요일의 출발일 (최대 60회) */
export function seriesDates(from: string, to: string, weekdays: number[]): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || weekdays.length === 0) return [];
  const out: string[] = [];
  for (let d = utc(from); d <= utc(to) && out.length < 60; d = new Date(d.getTime() + 86_400_000)) if (weekdays.includes(d.getUTCDay())) out.push(iso(d));
  return out;
}

export interface SeriesRow {
  date: string;
  weekday: string;
  returnDate: string;
  salePrice: number | null;
  marginRate: number | null;
  /** 업체 요일별 요금 이름 (있으면) */
  priceLabel: string;
  /** 여행 기간에 걸친 한국 공휴일 이름 */
  holidays: string[];
  /** 할인 규칙별 할인가와 마감·시작일 */
  discounts: { rule: PriceRule; price: number; until: string }[];
}

export function seriesRows(input: TripInput, days: DayPlan[], pmChoice: PmChoice, dates: string[], rules: PriceRule[], koreanHolidays: { date: string; name: string }[] = []): SeriesRow[] {
  const span = Math.max(1, input.days || days.length);
  return dates.map((date) => {
    let next: TripInput = { ...input, departureDate: date };
    let priceLabel = "";
    const q = input.supplierQuote;
    if (input.pricingMode === "supplier" && q && (q.datePrices ?? []).length > 0) {
      const picked = quotePriceFor(q, input.travelers, { departureDate: date, nights: input.nights });
      if (picked.price > 0) {
        next = { ...next, supplierPricePerPerson: Math.round(picked.price) };
        priceLabel = picked.dateLabel ?? "";
      }
    }
    const qt = calculateQuote(next, days, pmChoice);
    const price = salePrice(next, days, pmChoice);
    const back = iso(new Date(utc(date).getTime() + (span - 1) * 86_400_000));
    return {
      date,
      weekday: WEEKDAY[utc(date).getUTCDay()],
      returnDate: back,
      salePrice: price,
      marginRate: qt.ok ? documentQuote(qt, next).scenario.actualMarginRate : null,
      priceLabel,
      holidays: koreanHolidays.filter((h) => h.date >= date && h.date <= back).map((h) => h.name),
      discounts:
        price === null
          ? []
          : rules.map((rule) => ({
              rule,
              price: roundDownPrice(price * (1 - rule.rate / 100), input.currency as CurrencyCode),
              until: iso(new Date(utc(date).getTime() - rule.days * 86_400_000)),
            })),
    };
  });
}

/** 엑셀에 붙여 넣는 탭 구분 표 */
export function seriesTsv(rows: SeriesRow[]): string {
  const ruleHeads = rows[0]?.discounts.map((d) => (d.rule.kind === "early" ? `조기 ${d.rule.rate}%가 (~${d.rule.days}일 전)` : `임박 ${d.rule.rate}%가 (${d.rule.days}일 이내)`)) ?? [];
  return [
    ["출발일", "요일", "귀국일", "1인 판매가", ...ruleHeads, "연휴"].join("\t"),
    ...rows.map((r) => [r.date, r.weekday, r.returnDate, r.salePrice === null ? "" : String(Math.round(r.salePrice)), ...r.discounts.map((d) => String(d.price)), r.holidays.join(", ")].join("\t")),
  ].join("\n");
}
