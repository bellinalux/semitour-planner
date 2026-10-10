import { includeLists, tripPeriod } from "@/lib/documents";
import { localPayRows } from "@/lib/fees";
import { gradeText } from "@/lib/itemTypes";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import { isMealFiller } from "@/lib/mealTiming";
import type { CourseMeta, DayPlan, QuoteData, TripInput } from "@/types";

/**
 * 견적 버전 — 고객에게 나간 견적을 버전으로 남기고(문서를 인쇄하면 자동, 직접 저장도), 두 버전의 차이(가격·인원·날짜·호텔·포함·일정·선택관광)를
 * 한 장으로 본다. 고객이 "뭐가 바뀌었냐"고 물으면 변경 안내 글을 그대로 보낸다. 상품(일정 이름)별로 이 브라우저에 최근 12개.
 */

export interface QuoteVersion {
  id: string;
  at: string;
  label: string;
  title: string;
  period: string;
  departureDate: string;
  nights: number;
  days: number;
  travelers: number;
  currency: string;
  pricePerPerson: number;
  hotel: string;
  hotels: string[];
  included: string[];
  excluded: string[];
  options: { name: string; price: number }[];
  schedule: { day: number; theme: string; items: string[] }[];
}

/** 버전을 묶는 이름 — 고객·상품(여행지)별. 인원·날짜·박수가 바뀌어도 같은 견적의 버전으로 본다 */
export function versionKey(input: Pick<TripInput, "customerName" | "destination">, meta: Pick<CourseMeta, "packageName"> | null): string {
  return [input.customerName.trim(), (meta?.packageName || input.destination).trim()].filter(Boolean).join(" · ") || "견적";
}

const keyOf = (planKey: string) => `semitour-planner:versions:${planKey}`;
const MAX = 12;

export function makeVersion(d: { input: TripInput; days: DayPlan[]; pmChoice: PmChoice; quote: QuoteData; meta: CourseMeta | null }, label: string, now = new Date()): QuoteVersion {
  const { input, days, pmChoice, quote, meta } = d;
  const { included, excluded } = includeLists(quote, input, localPayRows(days, pmChoice).rows.length > 0);
  return {
    id: `v-${now.getTime().toString(36)}`,
    at: now.toISOString(),
    label,
    title: meta?.packageName?.trim() || `${input.destination} ${input.nights}박 ${input.days}일`,
    period: tripPeriod(input),
    departureDate: input.departureDate,
    nights: input.nights,
    days: input.days,
    travelers: quote.travelers,
    currency: input.currency,
    pricePerPerson: Math.round(quote.partnerConsumerPrice ?? quote.scenario.pricePerPerson),
    hotel: input.packageType === "land" ? "" : input.lodgingType === "resort" ? "리조트" : gradeText(input.hotelGrade),
    hotels: Object.values(input.selectedHotels).map((h) => h.name),
    included,
    excluded,
    options: input.options.map((o) => ({ name: o.name, price: o.pricePerPerson })),
    schedule: days.map((day) => ({ day: day.day, theme: day.theme, items: dayItems(day, pmChoice).filter((i) => !isMealFiller(i)).map((i) => i.name) })),
  };
}

/** 내용이 같은지 (시각·이름표 빼고) */
const contentKey = (v: QuoteVersion) => JSON.stringify({ ...v, id: "", at: "", label: "" });

export function loadVersions(planKey: string): QuoteVersion[] {
  try {
    const list = JSON.parse(localStorage.getItem(keyOf(planKey)) ?? "[]") as QuoteVersion[];
    return Array.isArray(list) ? list.filter((v) => v && typeof v.id === "string") : [];
  } catch {
    return [];
  }
}

/** 버전을 더한다 — 바로 앞 버전과 내용이 같으면 더하지 않는다. 바뀐 목록을 돌려준다 */
export function addVersion(planKey: string, v: QuoteVersion): QuoteVersion[] {
  const list = loadVersions(planKey);
  if (list.length > 0 && contentKey(list[list.length - 1]) === contentKey(v)) return list;
  const next = [...list, v].slice(-MAX);
  try {
    localStorage.setItem(keyOf(planKey), JSON.stringify(next));
  } catch {
    /* 저장 못 해도 화면은 계속 */
  }
  return next;
}

export interface VersionDiff {
  priceDiff: number;
  lines: string[];
}

const listDiff = (a: string[], b: string[]) => ({ added: b.filter((x) => !a.includes(x)), removed: a.filter((x) => !b.includes(x)) });

/** a(이전) → b(지금) 차이 */
export function diffVersions(a: QuoteVersion, b: QuoteVersion, money: (v: number) => string): VersionDiff {
  const lines: string[] = [];
  if (a.pricePerPerson !== b.pricePerPerson) lines.push(`1인 요금: ${money(a.pricePerPerson)} → ${money(b.pricePerPerson)} (${b.pricePerPerson > a.pricePerPerson ? "+" : "−"}${money(Math.abs(b.pricePerPerson - a.pricePerPerson))})`);
  if (a.period !== b.period) lines.push(`여행 기간: ${a.period} → ${b.period}`);
  if (a.nights !== b.nights || a.days !== b.days) lines.push(`일정: ${a.nights}박 ${a.days}일 → ${b.nights}박 ${b.days}일`);
  if (a.travelers !== b.travelers) lines.push(`인원: ${a.travelers}명 → ${b.travelers}명`);
  if (a.hotel !== b.hotel) lines.push(`숙소 등급: ${a.hotel || "없음"} → ${b.hotel || "없음"}`);
  const h = listDiff(a.hotels, b.hotels);
  if (h.added.length || h.removed.length) lines.push(`숙소: ${a.hotels.join(", ") || "미정"} → ${b.hotels.join(", ") || "미정"}`);
  const inc = listDiff(a.included, b.included);
  if (inc.added.length) lines.push(`포함에 추가: ${inc.added.join(", ")}`);
  if (inc.removed.length) lines.push(`포함에서 빠짐: ${inc.removed.join(", ")}`);
  const ao = new Map(a.options.map((o) => [o.name, o.price]));
  const bo = new Map(b.options.map((o) => [o.name, o.price]));
  for (const [name, price] of bo) {
    if (!ao.has(name)) lines.push(`선택관광 추가: ${name} (1인 ${money(price)})`);
    else if (ao.get(name) !== price) lines.push(`선택관광 요금: ${name} ${money(ao.get(name)!)} → ${money(price)}`);
  }
  for (const name of ao.keys()) if (!bo.has(name)) lines.push(`선택관광 빠짐: ${name}`);
  const days = Math.max(a.schedule.length, b.schedule.length);
  for (let i = 0; i < days; i++) {
    const x = a.schedule[i];
    const y = b.schedule[i];
    if (!x) {
      lines.push(`DAY ${y.day} 추가: ${y.items.join(" · ")}`);
      continue;
    }
    if (!y) {
      lines.push(`DAY ${x.day} 빠짐`);
      continue;
    }
    const d = listDiff(x.items, y.items);
    const parts = [d.added.length ? `추가 ${d.added.join(", ")}` : "", d.removed.length ? `빠짐 ${d.removed.join(", ")}` : ""].filter(Boolean);
    if (parts.length) lines.push(`DAY ${y.day}: ${parts.join(" / ")}`);
    else if (x.items.join("|") !== y.items.join("|")) lines.push(`DAY ${y.day}: 방문 순서 조정`);
  }
  return { priceDiff: b.pricePerPerson - a.pricePerPerson, lines };
}

/** 고객에게 보내는 변경 안내 글 */
export function changeNotice(a: QuoteVersion, b: QuoteVersion, money: (v: number) => string, customer = ""): string {
  const d = diffVersions(a, b, money);
  return [
    `[견적 변경 안내] ${customer ? `${customer}님, ` : ""}${b.title}`,
    `요청하신 내용을 반영해 견적을 고쳤습니다.`,
    "",
    ...(d.lines.length > 0 ? d.lines.map((l) => `· ${l}`) : ["· 바뀐 내용이 없습니다."]),
    "",
    `현재 1인 요금 ${money(b.pricePerPerson)} · ${b.travelers}명 합계 ${money(b.pricePerPerson * b.travelers)}`,
  ].join("\n");
}
