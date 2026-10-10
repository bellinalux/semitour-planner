import { includeLists, parseDate, addDays } from "@/lib/documents";
import { localPayRows } from "@/lib/fees";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import type { CompanyProfile, CourseMeta, DayPlan, QuoteData, TripInput } from "@/types";

/**
 * 영문 일정표·견적서 — 외국인 고객(국내 인바운드)용. 일정 이름·설명·포함 사항처럼 한글이 든 글만 모아 한 번에 번역하고,
 * 문서 틀(제목·표 머리·안내 문구)은 영어로 고정해 둔다.
 */

const HANGUL = /[가-힣]/;

interface Data {
  input: TripInput;
  days: DayPlan[];
  pmChoice: PmChoice;
  quote: QuoteData;
  meta: CourseMeta | null;
  company: CompanyProfile;
}

export function docTitle(d: Pick<Data, "input" | "meta">): string {
  return d.meta?.packageName?.trim() || `${d.input.destination} ${d.input.nights}박 ${d.input.days}일`;
}

/** 번역할 글 (한글이 든 것만, 중복 없이, 최대 300개) */
export function englishTexts(d: Data): string[] {
  const out = new Set<string>();
  const add = (s: string | undefined | null) => {
    const t = (s ?? "").trim().slice(0, 400);
    if (t && HANGUL.test(t)) out.add(t);
  };
  add(docTitle(d));
  add(d.input.destination);
  add(d.company.name);
  for (const day of d.days) {
    add(day.theme);
    add(day.overnightCity);
    for (const it of dayItems(day, d.pmChoice)) {
      add(it.name);
      add(it.description?.slice(0, 160));
    }
  }
  for (const h of Object.values(d.input.selectedHotels)) add(h.name);
  const { included, excluded } = includeLists(d.quote, d.input, localPayRows(d.days, d.pmChoice).rows.length > 0);
  for (const s of [...included, ...excluded]) add(s);
  for (const r of localPayRows(d.days, d.pmChoice).rows) add(r.name);
  return [...out].slice(0, 300);
}

/** "Nov 5, 2026 (Thu)" */
export function englishDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", weekday: "short" });
}

export function englishPeriod(input: Pick<TripInput, "departureDate" | "days">): string {
  const start = parseDate(input.departureDate);
  if (!start) return "To be decided";
  return `${englishDate(start)} – ${englishDate(addDays(start, Math.max(0, input.days - 1)))}`;
}

export function englishDayDate(input: Pick<TripInput, "departureDate">, dayNo: number): string | null {
  const start = parseDate(input.departureDate);
  return start ? englishDate(addDays(start, dayNo - 1)) : null;
}

/** 금액 (영문 표기) */
export function englishMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: currency === "KRW" || currency === "JPY" || currency === "VND" ? 0 : 2 }).format(value);
  } catch {
    return `${Math.round(value).toLocaleString("en-US")} ${currency}`;
  }
}
