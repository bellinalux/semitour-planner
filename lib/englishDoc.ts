import { includeLists, parseDate, addDays } from "@/lib/documents";
import { localPayRows } from "@/lib/fees";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import { conditionTags, shoppingStops, shortDescription } from "@/lib/itineraryDoc";
import type { MealSlot } from "@/lib/documents";
import type { TravelInfo } from "@/lib/schemas/travelInfo";
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
  travelInfo?: TravelInfo | null;
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
      add(shortDescription(it.description));
      add(it.cuisine);
      add(it.caution);
    }
  }
  add(d.meta?.hotelGrade);
  for (const o of d.input.options) {
    add(o.name);
    add(o.alternative);
  }
  for (const sh of shoppingStops(d.days, d.pmChoice)) add(sh.goods);
  if (d.travelInfo) for (const v of [d.travelInfo.timeDifference, d.travelInfo.voltage, d.travelInfo.currency, d.travelInfo.visa, d.travelInfo.emergency, d.travelInfo.embassy, d.travelInfo.weather]) add(v);
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

/* ── 영문 일정표 표기 ── */

/** "1 hr 30 min" · "45 min" */
export function englishDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h > 0 ? `${h} hr${r ? ` ${r} min` : ""}` : `${r} min`;
}

export const VISIT_EN: Record<"입장" | "하차" | "차창", string> = { 입장: "Entry", 하차: "Photo stop", 차창: "Drive-by" };

/** Hotel · Local (menu) · Special (menu) · Korean · Own expense · In-flight or own expense */
export function englishMeal(slot: MealSlot, kind: "breakfast" | "lunch" | "dinner", flightDay: boolean, fullPackage: boolean, t: (s: string) => string): string {
  if (slot.mark === "호텔식") return "Hotel";
  if (slot.mark === "불포함") {
    if (kind === "breakfast") return "—";
    return flightDay && fullPackage ? "In-flight or own expense" : "Own expense";
  }
  const c = slot.cuisine.trim();
  const base = /특식|씨푸드|랍스터|스테이크|코스|뷔페|BBQ|바비큐|샤브|훠궈/i.test(c) ? `Special (${t(c)})` : /한식/.test(c) ? "Korean" : c ? `Local (${t(c)})` : "Local";
  return slot.mark === "현지 지불" ? `${base}, paid locally` : base;
}

/** 조건 표식 영어로 (한국어 표식을 그대로 옮긴다) */
export function englishTags(d: Pick<Data, "input" | "days" | "pmChoice" | "meta" | "quote">): string[] {
  return conditionTags(d.input, d.days, d.pmChoice, d.meta, d.quote).map((tag) => {
    if (tag === "노쇼핑") return "No shopping stops";
    if (tag.startsWith("쇼핑 ")) return `Shopping stops: ${tag.replace(/\D/g, "")}`;
    if (tag === "노옵션") return "No optional tours";
    if (tag.startsWith("선택관광")) return `Optional tours: ${tag.replace(/\D/g, "")} (free choice)`;
    if (tag.startsWith("가이드 경비 포함")) return "Guide & driver tips included";
    if (tag.startsWith("가이드 경비 현지")) return "Guide tips paid locally";
    if (tag.startsWith("식사")) return `${tag.replace(/\D/g, "")} meals included`;
    if (tag === "전용차량") return "Private vehicle";
    if (tag === "리조트") return "Resort";
    const star = /^(\d)(?:~(\d))?성급$/.exec(tag);
    if (star) return star[2] ? `${star[1]}–${star[2]} star hotel` : `${star[1]}-star hotel`;
    return tag;
  });
}

