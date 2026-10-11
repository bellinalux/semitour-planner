import { isBreakfastItem } from "@/lib/documents";
import { dayTourStart, formatClock, morningFreeItems, parseClock, walkTimeline, type TimelineSlot } from "@/lib/dayLoad";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import type { DayPlan, ItineraryItem } from "@/types";

/**
 * 시각으로 따진 "할 수 있는 일정"인가 — 업계의 시간창(time window) 일정 짜기.
 *  ① 하루 사용 가능 시간: 보통 날은 미팅~종료 기준, 새벽·밤 도착일은 관광 없음(호텔 체크인·휴식), 오전·오후 도착일은 도착 뒤부터,
 *     출국일은 "출발 3시간 전 공항 도착"까지. 일정을 옮겨 받을 수 있는 날인지(acceptsMoves)도 여기서 정한다.
 *  ② 장소 운영 시간: 지식 창고의 운영 시간이 있으면 그것, 없으면 유형별 기본값(해양 투어 07:00~17:00, 야시장 16:00~24:00 등).
 *  ④ 불가능 시간: 새벽 도착일의 관광, 운영 시간 밖, 말이 안 되는 식사 시각, 밤 호텔 체크인 뒤 관광, 출국 뒤 일정.
 * 자동 기능(옮기기·정리·규칙)이 끝나면 이 점검으로 새 불가능 시간이 생겼는지 보고, 생겼으면 그 변경을 막는다.
 */

const DAY = 24 * 60;
const mod = (m: number) => ((m % DAY) + DAY) % DAY;
const NOT_TOUR = new Set(["flight", "transfer", "hotel", "free_time"]);
/** 가이드 일정 항목 (관광·체험·쇼핑·마사지·식사) — 조식 제외 */
export const isTourItem = (i: ItineraryItem) => !NOT_TOUR.has(i.type ?? "sightseeing") && !isBreakfastItem(i);

export type DayKind = "normal" | "rest" | "arrival-night" | "arrival-morning" | "arrival-afternoon" | "departure" | "flight-only";

export interface DayWindow {
  kind: DayKind;
  /** 관광을 시작할 수 있는 시각 / 끝내야 하는 시각 (그날 타임라인과 같은 분 기준) */
  start: number;
  end: number;
  /** 다른 날 일정을 옮겨 받아도 되는 날인가 */
  acceptsMoves: boolean;
  note: string;
}

/** 항공으로 시작하는 날의 도착 시각과 공항을 나서는 시각 */
function arrivalOf(slots: TimelineSlot[]): { at: number; leave: number } | null {
  let k = -1;
  while (k + 1 < slots.length && slots[k + 1].item.type === "flight") k++;
  if (k < 0) return null;
  const last = slots[k];
  const leave = last.end + Math.max(0, last.item.travelMinutesToNext ?? 0);
  // "○○ 공항 도착" 줄이면 그 시각이 도착, 출발 줄만 있으면 비행 뒤가 도착
  const at = /도착|arriv/i.test(last.item.name) ? last.start : leave;
  return { at, leave };
}

const NIGHT_ARRIVAL = /새벽\s*(체크인|도착|입국)|심야\s*(도착|입국)|밤\s*늦게\s*도착|자정\s*(넘어|무렵)?\s*도착/;

/** 그날 사용 가능 시간 (dayEnd: 상품 규칙의 종료 기준, 기본 19:00) */
export function dayWindow(day: DayPlan, pmChoice: PmChoice, dayEnd = "19:00"): DayWindow {
  const items = dayItems(day, pmChoice).filter((i) => !isBreakfastItem(i));
  const slots = walkTimeline(items, dayTourStart(day));
  const endStd = parseClock(dayEnd) ?? 19 * 60;
  const startStd = parseClock(dayTourStart(day)) ?? 8 * 60;
  // 숙소 없이 항공·이동만 있는 날 (귀국 도착일 등)
  if (items.length > 0 && items.some((i) => i.type === "flight") && items.every((i) => i.type === "flight" || i.type === "transfer")) {
    return { kind: "flight-only", start: 0, end: 0, acceptsMoves: false, note: "항공 이동일" };
  }
  // 도착일
  if (items[0]?.type === "flight") {
    // 항공 시각이 없으면 원문 표기("호텔 새벽 체크인", "심야 도착")로 새벽·밤 도착을 알아본다
    const text = `${day.theme} ${items.map((i) => `${i.name} ${i.description ?? ""}`).join(" ")}`;
    if (!items.some((i) => i.type === "flight" && i.fixedTime) && NIGHT_ARRIVAL.test(text)) {
      const leave = arrivalOf(slots)!.leave;
      return { kind: "arrival-night", start: leave, end: leave, acceptsMoves: false, note: "새벽·밤 도착일 (원문 표기 — 항공 시각 없음)" };
    }
    const arr = arrivalOf(slots)!;
    const at = mod(arr.at);
    if (at >= 22 * 60 || at < 6 * 60) return { kind: "arrival-night", start: arr.leave, end: arr.leave, acceptsMoves: false, note: `새벽·밤 도착일 (${formatClock(at)} 도착) — 호텔 체크인·휴식만` };
    const morning = at < 12 * 60;
    const end = Math.max(arr.leave, endStd + (arr.leave >= DAY ? DAY : 0));
    return { kind: morning ? "arrival-morning" : "arrival-afternoon", start: arr.leave, end, acceptsMoves: morning ? end - arr.leave >= 240 : false, note: `${morning ? "오전" : "오후"} 도착일 (${formatClock(at)} 도착)` };
  }
  // 출국일 — 끝에 항공(뒤로는 이동·숙소뿐)
  const fi = slots.findIndex((s, i) => s.item.type === "flight" && i > 0 && slots.slice(i + 1).every((x) => x.item.type === "flight" || x.item.type === "transfer" || x.item.type === "hotel"));
  if (fi > 0) {
    const flight = slots[fi];
    const dep = flight.item.fixedTime ? (parseClock(flight.item.fixedTime) ?? flight.start) : flight.start;
    // 공항까지 이동(바로 앞 이동 줄들) + 출발 3시간 전 도착
    let k = fi - 1;
    let toAirport = 0;
    while (k >= 0 && slots[k].item.type === "transfer") {
      toAirport += slots[k].end - slots[k].start + Math.max(0, slots[k].item.travelMinutesToNext ?? 0);
      k--;
    }
    if (k >= 0) toAirport += Math.max(0, slots[k].item.travelMinutesToNext ?? 0);
    const latest = dep - 180 - toAirport;
    return { kind: "departure", start: startStd, end: Math.min(Math.max(endStd, 22 * 60), latest), acceptsMoves: false, note: `출국일 (${formatClock(dep)} 출발 — 공항 3시간 전 도착)` };
  }
  if (day.rest) return { kind: "rest", start: startStd, end: endStd, acceptsMoves: false, note: "일부러 쉬게 둔 날" };
  return { kind: "normal", start: startStd, end: endStd, acceptsMoves: true, note: "" };
}

/** 시계로 본 남은 시간(분) — 받는 날이 아니면 0. 자유시간은 바꿔 쓸 수 있으니 여유로 센다 */
export function clockRoom(day: DayPlan, pmChoice: PmChoice, dayEnd = "19:00"): number {
  const w = dayWindow(day, pmChoice, dayEnd);
  if (!w.acceptsMoves) return 0;
  const items = dayItems(day, pmChoice);
  const slots = walkTimeline(items, dayTourStart(day));
  const last = [...slots].reverse().find((s) => s.item.type !== "hotel" && s.item.type !== "transfer");
  const free = items.filter((i) => i.type === "free_time").reduce((s, i) => s + Math.max(0, i.stayMinutes), 0);
  return Math.max(0, w.end - (last ? last.end : w.start) + free);
}

/* ── ② 운영 시간 ── */

export interface OpenWindow {
  open: number;
  close: number;
  basis: string;
}

const NIGHT = /야시장|나이트\s*마켓|night\s*market|야경|나이트|루프탑|불꽃|불\s*쇼|분수\s*쇼|레이저|카바레|알카자|티파니|쇼\s*관람|공연|아시아티크/i;
const FLOATING = /수상\s*시장|floating\s*market|담넌/i;
const MARINE = /호핑|섬\s*투어|아일랜드|스노클|다이빙|씨\s*워킹|패러\s*(세일|셀)|제트\s*스키|바나나\s*보트|해양\s*(액티비티|엑티비티|스포츠)|스피드\s*보트|산호섬/i;
const MARKET = /시장|마켓|market/i;
const MALL = /몰|mall|백화점|아울렛|outlet|플라자/i;

const clock = (s: string) => parseClock(s) ?? 0;

/** 운영 시간 (모르면 null) — 지식 창고 운영 시간 > 유형별 기본값. 원문 시각(fixedTime)이 있는 항목은 그 시각을 따른다 */
export function openWindow(item: ItineraryItem): OpenWindow | null {
  if (item.fixedTime || NOT_TOUR.has(item.type ?? "sightseeing") || isBreakfastItem(item)) return null;
  const known = Object.values(item.openHours ?? {}).find((v) => v && /^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(v.trim()));
  if (known) {
    const [a, b] = known.split("-").map((x) => clock(x.trim()));
    return { open: a, close: b <= a ? b + DAY : b, basis: "운영 시간" };
  }
  const text = `${item.name} ${item.description ?? ""}`;
  const t = item.type ?? "sightseeing";
  if (t === "meal") return null; // 식사는 식사 시간대 점검으로
  if (NIGHT.test(item.name)) return { open: clock("16:00"), close: DAY, basis: "저녁 일정" };
  if (FLOATING.test(text)) return { open: clock("06:30"), close: clock("13:00"), basis: "수상시장(오전)" };
  if (MARINE.test(text)) return { open: clock("07:00"), close: clock("17:30"), basis: "해양 투어(오전 출발·오후 복귀)" };
  if (t === "massage") return { open: clock("09:00"), close: DAY, basis: "마사지·스파" };
  if (t === "shopping") return MALL.test(item.name) ? { open: clock("10:00"), close: clock("22:00"), basis: "쇼핑몰" } : MARKET.test(item.name) ? { open: clock("06:00"), close: clock("21:00"), basis: "시장" } : { open: clock("09:00"), close: clock("21:30"), basis: "쇼핑센터" };
  if (item.admission === "view_only") return { open: clock("06:00"), close: clock("23:00"), basis: "외관 관람" };
  return { open: clock("07:00"), close: clock(t === "experience" ? "21:00" : "20:00"), basis: t === "experience" ? "체험" : "관광지" };
}

/* ── ④ 불가능 시간 ── */

export interface HardIssue {
  /** 같은 문제인지 비교하는 열쇠 (날짜·항목·종류) */
  key: string;
  day: number;
  itemId: string;
  kind: "window" | "open" | "meal" | "after-checkin" | "after-departure";
  text: string;
}

const LUNCH = /중식|점심|런치|lunch/i;
const DINNER = /석식|저녁|디너|dinner/i;
const fmt = (m: number) => formatClock(mod(m));

/** 그날 불가능 시간 */
export function dayHardIssues(day: DayPlan, pmChoice: PmChoice, dayEnd = "19:00"): HardIssue[] {
  const items = dayItems(day, pmChoice);
  const slots = walkTimeline(items, dayTourStart(day));
  const w = dayWindow(day, pmChoice, dayEnd);
  const out: HardIssue[] = [];
  const push = (it: ItineraryItem, kind: HardIssue["kind"], text: string) => out.push({ key: `${day.day}|${it.id}|${kind}`, day: day.day, itemId: it.id, kind, text });
  // 밤 호텔 체크인 시각 (그 뒤 관광은 불가)
  const nightCheckIn = slots.find((s) => s.item.type === "hotel" && /체크인|투숙/.test(s.item.name) && (mod(s.start) >= 21 * 60 || mod(s.start) < 5 * 60));
  const depIdx = w.kind === "departure" ? slots.findIndex((s, i) => s.item.type === "flight" && i > 0) : -1;
  slots.forEach((s, i) => {
    const it = s.item;
    if (!isTourItem(it)) return;
    if (w.kind === "arrival-night") return push(it, "window", `${it.name} — ${w.note}이라 관광할 수 없습니다`);
    if ((w.kind === "arrival-morning" || w.kind === "arrival-afternoon") && s.start < w.start - 5) return push(it, "window", `${it.name} ${fmt(s.start)} — 공항 도착(${w.note}) 전입니다`);
    if (depIdx >= 0 && i > depIdx) return push(it, "after-departure", `${it.name} — 출국 항공 뒤에 있습니다`);
    if (w.kind === "departure" && it.type !== "meal" && s.end > w.end + 30) return push(it, "window", `${it.name} ${fmt(s.end)} 종료 — ${w.note}에 맞추기 어렵습니다`);
    if (nightCheckIn && s.start > nightCheckIn.start) return push(it, "after-checkin", `${it.name} — 밤 호텔 체크인(${fmt(nightCheckIn.start)}) 뒤에 있습니다`);
    if (it.type === "meal" && !it.fixedTime) {
      const m = mod(s.start);
      if (LUNCH.test(it.name) && (m < 10 * 60 + 30 || m > 15 * 60)) return push(it, "meal", `${it.name} ${fmt(s.start)} — 점심으로 볼 수 없는 시각 (보통 11:30~13:30)`);
      if (DINNER.test(it.name) && (m < 16 * 60 + 30 || m > 22 * 60)) return push(it, "meal", `${it.name} ${fmt(s.start)} — 저녁으로 볼 수 없는 시각 (보통 18:00~20:00)`);
      return;
    }
    const ow = openWindow(it);
    if (!ow) return;
    // 자정을 넘긴 시각(01:00 등)은 다음날 새벽 — 운영 시간 비교는 그날 기준으로
    const a = mod(s.start);
    const b = a + (s.end - s.start);
    if (a < ow.open - 10 || b > ow.close + 30) push(it, "open", `${it.name} ${fmt(s.start)}~${fmt(s.end)} — ${ow.basis} 운영 시간(${fmt(ow.open)}~${ow.close >= DAY ? "24:00" : fmt(ow.close)}) 밖`);
  });
  return out;
}

export function tripHardIssues(days: DayPlan[], pmChoice: PmChoice, dayEnd = "19:00"): HardIssue[] {
  return days.flatMap((d) => dayHardIssues(d, pmChoice, dayEnd));
}

/** 바꾸기 전과 견줘 새로 생긴 불가능 시간 (자동 기능의 관문) */
export function newHardIssues(before: DayPlan[], after: DayPlan[], pmChoice: PmChoice, dayEnd = "19:00"): HardIssue[] {
  const had = new Set(tripHardIssues(before, pmChoice, dayEnd).map((i) => i.key.replace(/^\d+\|/, "")));
  return tripHardIssues(after, pmChoice, dayEnd).filter((i) => !had.has(i.key.replace(/^\d+\|/, "")));
}

/* ── ③ 넣을 자리 찾기 ── */

/** 일정을 넣어도 되는 자리 — 앞쪽 항공(도착) 뒤, 출국 항공·마지막 숙소 줄 앞 */
function slotRange(items: ItineraryItem[]): [number, number] {
  let lo = 0;
  while (lo < items.length && (items[lo].type === "flight" || isBreakfastItem(items[lo]))) lo++;
  let hi = items.length;
  // 맨 끝 숙소 줄 앞
  if (hi > lo && items[hi - 1].type === "hotel") hi--;
  // 출국일: 끝의 공항 이동·항공 앞
  if (items.slice(lo).some((x) => x.type === "flight")) while (hi > lo && (items[hi - 1].type === "flight" || items[hi - 1].type === "transfer")) hi--;
  return [lo, hi];
}

/**
 * 하루에 항목 묶음을 넣을 가장 좋은 자리 — 넣은 항목이 불가능 시간이 아니고, 원래 항목에 새 불가능 시간이 생기지 않으며,
 * 하루가 가장 일찍 끝나는 자리. 없으면 null. refit: 넣은 뒤 식사 시간대 맞추기 (dayBalance.refitDay를 넘겨받는다)
 */
export function bestInsert(day: DayPlan, block: ItineraryItem[], pmChoice: PmChoice, refit: (d: DayPlan) => DayPlan, dayEnd = "19:00"): DayPlan | null {
  if (day.kind !== "linear") return null;
  const before = new Set(dayHardIssues(day, pmChoice, dayEnd).map((i) => i.key));
  const ids = new Set(block.map((b) => b.id));
  const [lo, hi] = slotRange(day.items);
  let best: { d: DayPlan; end: number } | null = null;
  for (let at = lo; at <= hi; at++) {
    const items = [...day.items.slice(0, at), ...block, ...day.items.slice(at)];
    const d = refit({ ...day, items });
    const issues = dayHardIssues(d, pmChoice, dayEnd);
    if (issues.some((i) => ids.has(i.itemId) || !before.has(i.key))) continue;
    const slots = walkTimeline(dayItems(d, pmChoice), dayTourStart(d));
    const end = slots.length ? slots[slots.length - 1].end : 0;
    if (!best || end < best.end) best = { d, end };
  }
  return best?.d ?? null;
}

export interface ImpossibleFix {
  days: DayPlan[];
  changes: string[];
  /** 고치지 못한 불가능 시간 */
  left: HardIssue[];
}

/**
 * 불가능 시간 고치기 — 걸린 관광·체험은 같은 날 다른 자리, 안 되면 같은 숙박 도시의 받는 날, 그래도 안 되면 여유가 가장 많은 날로.
 * 옮기면서 넣었던 자유식 점심(lunch-)은 시간이 안 맞으면 뺀다. 그래도 안 되는 것은 남긴다.
 */
export function fixImpossible(days: DayPlan[], pmChoice: PmChoice, refit: (d: DayPlan) => DayPlan, dayEnd = "19:00"): ImpossibleFix {
  let next = days;
  const changes: string[] = [];
  for (const issue of tripHardIssues(days, pmChoice, dayEnd)) {
    const from = next.find((d) => d.day === issue.day);
    const it = from?.items.find((i) => i.id === issue.itemId);
    if (!from || !it) continue;
    if (!dayHardIssues(from, pmChoice, dayEnd).some((i) => i.key === issue.key)) continue; // 앞에서 이미 풀림
    const rest = refit({ ...from, items: from.items.filter((i) => i !== it) });
    if (it.type === "meal" && it.id.startsWith("lunch-")) {
      const placed = bestInsert(rest, [it], pmChoice, refit, dayEnd);
      next = next.map((d) => (d.day === from.day ? (placed ?? rest) : d));
      changes.push(placed ? `DAY ${from.day} ${it.name} 시각 맞춤` : `DAY ${from.day} ${it.name} 뺌 (점심 시간에 넣을 자리 없음)`);
      continue;
    }
    // 같은 날 다른 자리
    const same = from.kind === "linear" && dayWindow(from, pmChoice, dayEnd).kind !== "arrival-night" ? bestInsert(rest, [it], pmChoice, refit, dayEnd) : null;
    if (same) {
      next = next.map((d) => (d.day === from.day ? same : d));
      changes.push(`DAY ${from.day} ${it.name} 순서 옮김 (운영 시간 안으로)`);
      continue;
    }
    // 다른 날 — 같은 숙박 도시 먼저, 그다음 여유가 많은 날
    const city = (from.overnightCity ?? "").trim();
    const candidates = next
      .filter((d) => d.day !== from.day && d.kind === "linear" && dayWindow(d, pmChoice, dayEnd).acceptsMoves)
      // 같은 숙박 도시 → 일부러 오전을 비워 둔 날(오전 자유)은 뒤로 → 여유 많은 날
      .map((d) => ({ d, same: (d.overnightCity ?? "").trim() === city, light: morningFreeItems(d.items).length > 0, room: clockRoom(d, pmChoice, dayEnd) }))
      .sort((a, b) => Number(b.same) - Number(a.same) || Number(a.light) - Number(b.light) || b.room - a.room);
    let moved = false;
    for (const c of candidates) {
      const placed = bestInsert(c.d, [{ ...it, travelMinutesToNext: it.travelMinutesToNext ?? 20 }], pmChoice, refit, dayEnd);
      if (!placed) continue;
      next = next.map((d) => (d.day === from.day ? rest : d.day === c.d.day ? placed : d));
      changes.push(`${it.name} DAY ${from.day} → DAY ${c.d.day} (${dayWindow(from, pmChoice, dayEnd).note || "불가능 시간"})`);
      moved = true;
      break;
    }
    if (!moved) continue;
  }
  return { days: changes.length ? next : days, changes, left: tripHardIssues(next, pmChoice, dayEnd) };
}
