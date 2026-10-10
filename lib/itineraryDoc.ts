import { ourPolicy } from "@/lib/competitorDiff";
import { dayMeals, documentItems, isBreakfastItem, type MealSlot } from "@/lib/documents";
import { isOvernightStay } from "@/lib/dayTidy";
import { dayMeetingTime, hotelLeadMinutes } from "@/lib/dayLoad";
import { formatDuration } from "@/lib/format";
import { gradeText } from "@/lib/itemTypes";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import { isMealFiller } from "@/lib/mealTiming";
import type { CourseMeta, DayPlan, ItineraryItem, QuoteData, TourOption, TripInput } from "@/types";

/**
 * 고객용 일정표 표기 — 업계 일정표(일자·지역·교통편·시간·일정·식사 표)와 「국외여행상품 정보제공 표준안」(쇼핑 횟수·품목,
 * 선택관광 대체 일정, 가이드 경비)에 맞춰 일정 데이터를 고객이 읽는 말로 바꾼다.
 *  - 시각은 주요한 것만(미팅·항공·식사·공연·고정 시각) 보여 주고, 관광은 "약 1시간 30분" 소요로
 *  - 관광 방식은 입장 / 하차(외관) / 차창으로
 *  - 이동은 번호 붙은 항목이 아니라 장소 사이 연결("전용차량 약 30분")로
 */

/* ── 조건 요약 표식 ── */

export function conditionTags(input: TripInput, days: DayPlan[], pmChoice: PmChoice, meta: CourseMeta | null, quote: QuoteData): string[] {
  const policy = ourPolicy(days, pmChoice, input, meta);
  const shops = shoppingStops(days, pmChoice).length;
  const mealCount = days.reduce((s, _d, i) => {
    const m = dayMeals(days, i, pmChoice, input);
    return s + (m.lunch.mark !== "불포함" ? 1 : 0) + (m.dinner.mark !== "불포함" ? 1 : 0);
  }, 0);
  const tags: string[] = [];
  tags.push(policy.shopping === "none" && shops === 0 ? "노쇼핑" : `쇼핑 ${Math.max(1, shops)}회`);
  tags.push(input.options.length === 0 ? "노옵션" : `선택관광 ${input.options.length}개 (자유 선택)`);
  tags.push(input.tipPerPerson > 0 ? "가이드 경비 포함 (노팁)" : "가이드 경비 현지 지불");
  if (mealCount > 0) tags.push(`식사 ${mealCount}회 포함`);
  if (input.packageType !== "land" && quote.lodgingUnits > 0) {
    const grade = input.lodgingType === "resort" ? "리조트" : gradeText(input.hotelGrade);
    if (grade) tags.push(grade);
  }
  if (quote.ourIncludes.vehicle) tags.push("전용차량");
  return tags;
}

/* ── 관광 방식 ── */

/** 입장(내부 관람) / 하차(외관·포토) / 차창(차 안에서) — 모르면 빈 문자열 */
export function visitStyle(item: ItineraryItem): "" | "입장" | "하차" | "차창" {
  const t = item.type ?? "sightseeing";
  if (!["sightseeing", "experience"].includes(t)) return "";
  if (/차창/.test(item.name)) return "차창";
  if (item.admission === "enter") return "입장";
  if (item.admission === "view_only") return item.stayMinutes > 0 && item.stayMinutes <= 10 ? "차창" : "하차";
  return "";
}

/* ── 시각 ── */

const SHOW_TIME = /공연|쇼|show|크루즈|야경|분수|불꽃|퍼레이드|미팅|집결|체크인|체크아웃/i;

/** 고객용 일정표에 시각을 적는 항목 — 그날 첫 항목·항공·점심/저녁·공연처럼 시각이 정해진 것 */
export function showsTime(item: ItineraryItem, index: number): boolean {
  if (index === 0) return true;
  if (item.type === "flight") return true;
  if (item.type === "meal" && !isBreakfastItem(item) && /점심|중식|저녁|석식|런치|디너|lunch|dinner/i.test(`${item.name} ${item.description}`)) return true;
  return Boolean(item.timeNote) || SHOW_TIME.test(item.name);
}

/** 관광·체험 소요 표기 (식사·숙소·항공·이동·자유시간은 표기하지 않는다) */
export function stayText(item: ItineraryItem): string {
  if (item.timeNote) return item.timeNote;
  const t = item.type ?? "sightseeing";
  if (!["sightseeing", "experience", "massage", "shopping"].includes(t) || item.stayMinutes <= 0) return "";
  return `약 ${formatDuration(item.stayMinutes)}`;
}

/** 설명은 한 줄로 (첫 문장, 70자) */
export function shortDescription(text: string | undefined): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const first = t.split(/(?<=[.!?。])\s|(?<=다\.)\s/)[0] ?? t;
  return first.length > 70 ? `${first.slice(0, 68)}…` : first;
}

/* ── 이동 ── */

export interface DocRow {
  kind: "item" | "move";
  item?: ItineraryItem;
  /** 이동 줄: "전용차량 약 30분" */
  text?: string;
  /** 이동 분, 이동 항목 이름 (영문·운영 지시서가 자기 말로 다시 쓴다) */
  minutes?: number;
  moveName?: string;
}

/**
 * 그날 표에 들어갈 줄 — 항공·관광·식사·숙소는 항목 줄, 이동(transfer)과 장소 사이 이동 시간은 연결 줄.
 * 식사 시간 맞춤 자유시간(앱이 넣은 것)은 고객 일정표에 넣지 않는다.
 */
export function docRows(items: ItineraryItem[], vehicle: boolean): DocRow[] {
  const how = vehicle ? "전용차량" : "이동";
  const rows: DocRow[] = [];
  items.forEach((it, i) => {
    if (isMealFiller(it)) return;
    if (it.type === "transfer") {
      const m = Math.max(0, it.stayMinutes) + Math.max(0, it.travelMinutesToNext ?? 0);
      rows.push({ kind: "move", text: `${it.name}${m > 0 ? ` (약 ${formatDuration(m)})` : ""}`, minutes: m, moveName: it.name });
      return;
    }
    rows.push({ kind: "item", item: it });
    const next = items.slice(i + 1).find((x) => !isMealFiller(x));
    const travel = Math.max(0, it.travelMinutesToNext ?? 0);
    if (next && next.type !== "transfer" && it.type !== "flight" && travel >= 5) rows.push({ kind: "move", text: `${how} 약 ${formatDuration(travel)}`, minutes: travel });
  });
  return rows;
}

/* ── 식사 ── */

const SPECIAL = /특식|씨푸드|랍스터|스테이크|코스|뷔페|BBQ|바비큐|샤브|훠궈/i;

/** 업계 표기: 호텔식 · 현지식(메뉴) · 특식(메뉴) · 한식 · 자유식 · 기내식 */
export function mealLabel(slot: MealSlot, kind: "breakfast" | "lunch" | "dinner", flightDay: boolean, fullPackage: boolean): string {
  if (slot.mark === "호텔식") return "호텔식";
  if (slot.mark === "불포함") {
    if (kind === "breakfast") return "—";
    return flightDay && fullPackage ? "기내식 또는 자유식" : "자유식";
  }
  const c = slot.cuisine.trim();
  const base = SPECIAL.test(c) ? `특식(${c})` : /한식/.test(c) ? "한식" : c ? `현지식(${c})` : "현지식";
  return slot.mark === "현지 지불" ? `${base} · 현지 지불` : base;
}

/* ── 쇼핑 ── */

export interface ShoppingStop {
  day: number;
  name: string;
  /** 품목 (설명에서) */
  goods: string;
  minutes: number;
}

export function shoppingStops(days: DayPlan[], pmChoice: PmChoice): ShoppingStop[] {
  return days.flatMap((d) =>
    dayItems(d, pmChoice)
      .filter((i) => i.type === "shopping")
      .map((i) => ({ day: d.day, name: i.name, goods: shortDescription(i.description), minutes: i.stayMinutes })),
  );
}

/* ── 선택관광 ── */

/** 미참여 시 일정 기본 문구 (표준안: 대체 일정·대기 장소를 구체적으로) */
export function defaultAlternative(o: Pick<TourOption, "dayNo" | "durationMinutes">): string {
  const len = o.durationMinutes > 0 ? ` 약 ${formatDuration(o.durationMinutes)}` : "";
  return `미참여 시 가이드가 안내하는 장소에서${len} 자유시간 후 합류 (추가 비용 없음)`;
}

/* ── 자유 일정 ── */

/** 가이드·차량 없이 자유롭게 보내는 날 (자유시간·숙소·항공·현지 지불 식사만) */
export function isFreeDay(day: DayPlan, pmChoice: PmChoice): boolean {
  const items = dayItems(day, pmChoice);
  return items.some((i) => i.type === "free_time") && items.every((i) => ["free_time", "hotel", "flight", "transfer"].includes(i.type ?? "") || (i.type === "meal" && i.payment === "local"));
}

/** 그날 지역 표기 — 항공이 있는 날은 출발지 → 도착지, 아니면 숙박 도시 */
export function dayRegion(days: DayPlan[], index: number, origin: string): string {
  const d = days[index];
  const prev = index > 0 ? (days[index - 1].overnightCity ?? "").trim() : "";
  const here = (d.overnightCity ?? "").trim();
  const flight = d.items.some((i) => i.type === "flight") || d.amGuided.some((i) => i.type === "flight");
  if (flight && index === 0) return [origin.trim() || "인천", here].filter(Boolean).join(" → ");
  if (flight && index === days.length - 1) return [prev, origin.trim() || "인천"].filter(Boolean).join(" → ");
  if (prev && here && prev !== here) return `${prev} → ${here}`;
  return here || prev;
}

/* ── 하루 표 (고객용 일정표·영문 일정표·운영 지시서가 같이 쓴다) ── */

export interface DayTableRow {
  key: string;
  kind: "item" | "move" | "label" | "free" | "meeting";
  item?: ItineraryItem;
  /** move: 이동 분 (이동 항목이면 그 이름도) / label: 오전·오후 묶음 이름 */
  minutes?: number;
  moveName?: string;
  label?: string;
  /** free: 자유 일정 추천 */
  tips?: string[];
  /** 교통편 칸: 항공 편명("KE651"), "flight"(편명 모름), "vehicle"(그날 첫 차량 이동), 빈 칸 */
  transport: string;
  /** 시작·끝 시각 (운영 지시서용 전체 시각) */
  start: string;
  end: string;
  /** 고객용 표에 시각을 적는 줄인지 / 시각 대신 "조식 후" */
  keyTime: boolean;
  afterBreakfast: boolean;
  /** 귀국 항공 (출국 수속 안내) */
  returnFlight: boolean;
}

export interface DayTable {
  rows: DayTableRow[];
  flightDay: boolean;
  free: boolean;
  /** 그날 마지막 투숙 숙소 (HOTEL 줄) — 없으면 null */
  overnight: { city: string; hotel: string | null } | null;
}

/**
 * 하루를 표 줄로 — 앱이 넣은 식사 맞춤 자유시간은 빼고, 이동 항목·장소 사이 이동은 연결 줄로,
 * 그날 마지막 투숙은 HOTEL 줄로 (항목 줄에서 뺀다), 자유일만 있는 날은 한 줄로.
 */
export function dayTable(
  days: DayPlan[],
  index: number,
  pmChoice: PmChoice,
  opts: { vehicle: boolean; flight: { out: string; back: string }; selectedHotels: Record<string, { name: string }> },
  timings: Map<string, { start: string; end: string }>,
): DayTable {
  const day = days[index];
  const blocks = documentItems(day, pmChoice);
  const flat = blocks.flatMap((b) => b.items);
  const flightDay = flat.some((i) => i.type === "flight");
  const lastDay = index === days.length - 1;
  const city = (day.overnightCity ?? "").trim();
  const overnight = city ? { city, hotel: opts.selectedHotels[city]?.name ?? null } : null;
  const blank = { transport: "", start: "", end: "", keyTime: false, afterBreakfast: false, returnFlight: false };
  if (isFreeDay(day, pmChoice)) {
    const tips = flat.filter((i) => i.type === "free_time").map((i) => shortDescription(i.description)).filter(Boolean);
    return { rows: [{ key: "free", kind: "free", tips, ...blank }], flightDay, free: true, overnight };
  }
  const rows: DayTableRow[] = [];
  let first = true;
  // 호텔에서 미팅하고 첫 장소로 이동하는 날: 미팅 줄 + 이동 줄을 먼저 (첫 장소 시각 = 미팅 + 이동)
  const lead = hotelLeadMinutes(day);
  const meetingKnown = Boolean(day.meetingTime?.trim());
  // 일부러 늦게 출발하는 날(오전 자유)은 미팅 앞에 한 줄
  if (day.rest === "late") rows.push({ key: "rest-late", kind: "label", label: "오전 자유 (호텔 휴식·개별 시간)", ...blank });
  if (lead > 0) {
    rows.push({ key: "meeting", kind: "meeting", ...blank, transport: opts.vehicle ? "vehicle" : "", start: dayMeetingTime(day), end: dayMeetingTime(day), keyTime: true, afterBreakfast: !meetingKnown });
    rows.push({ key: "meeting-move", kind: "move", minutes: lead, ...blank });
    first = false;
  }
  for (const block of blocks) {
    if (block.label) rows.push({ key: `b-${block.label}`, kind: "label", label: block.label, ...blank });
    for (const [n, r] of docRows(block.items, opts.vehicle).entries()) {
      if (r.kind === "move") {
        rows.push({ key: `m-${block.label}-${n}`, kind: "move", minutes: r.minutes, moveName: r.moveName, ...blank });
        continue;
      }
      const it = r.item!;
      const idx = flat.indexOf(it);
      if (overnight && isOvernightStay(flat, idx)) continue;
      const t = timings.get(it.id);
      const transport = it.type === "flight" ? (lastDay ? opts.flight.back : index === 0 ? opts.flight.out : "") || "flight" : first && opts.vehicle ? "vehicle" : "";
      rows.push({
        key: it.id,
        kind: "item",
        item: it,
        transport,
        start: t?.start ?? "",
        end: t?.end ?? "",
        // 미팅 시각을 모르는 날은 첫 장소 시각도 적지 않는다 (기본 08:00 기준이라 맞지 않을 수 있다)
        keyTime: lead > 0 && idx === 0 ? meetingKnown : showsTime(it, idx),
        afterBreakfast: first && !day.meetingTime?.trim() && it.type !== "flight",
        returnFlight: lastDay && it.type === "flight",
      });
      first = false;
    }
  }
  return { rows, flightDay, free: false, overnight };
}
