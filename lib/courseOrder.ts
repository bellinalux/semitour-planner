/**
 * 업체 코스(붙여넣기·상품 링크) 순서 안전장치.
 * 상품 페이지의 날짜 요약(식사 → 호텔 → 관광지 목록)을 일정 순서로 잘못 읽으면
 * "숙박 호텔 → 관광", "귀국편 → 관광", "저녁 → 낮 관광"처럼 하루가 거꾸로 된다. 이런 경우만 바로잡는다.
 *  ① 출국일: 귀국편 뒤에 있는 관광·식사 → 공항 이동 앞으로
 *  ② 숙박 호텔 뒤에 낮 관광이 있으면 → 호텔을 하루 끝으로 (호텔 뒤 저녁·야경은 그대로 — 호텔식 석식 등)
 *  ③ 저녁이 낮 관광보다 앞에 있으면 → 낮 관광 뒤로
 *  ④ 점심이 11시 전·14시 뒤에 놓이면 → 11:30 무렵 관광 앞으로 (도착일은 lib/pasteFlight의 도착 뒤 점심)
 */
import { dayMeetingTime, walkTimeline } from "@/lib/dayLoad";
import { looksLikeFlightItem } from "@/lib/flightApply";
import { mealSlotOf } from "@/lib/mealSlot";
import type { DayPlan, ItineraryItem } from "@/types";

export interface OrderFix {
  day: number;
  note: string;
}

const CONTENT = new Set(["sightseeing", "experience", "shopping", "massage"]);
const NIGHT = /야경|분수|쇼|나이트|야시장|불꽃|밤|night|라이트업/i;
const NOT_STAY = /체크아웃|조식|로비|미팅|출발|짐/;

const isContent = (i: ItineraryItem) => CONTENT.has(i.type ?? "sightseeing") && !looksLikeFlightItem(i);
const isDayContent = (i: ItineraryItem) => isContent(i) && !NIGHT.test(i.name);
const isStay = (i: ItineraryItem) => i.type === "hotel" && !NOT_STAY.test(i.name);
const isAirportMove = (i: ItineraryItem) => i.type === "transfer" && /공항/.test(i.name);
const isDinner = (i: ItineraryItem) => mealSlotOf(i) === "dinner";
const isLunch = (i: ItineraryItem) => mealSlotOf(i) === "lunch";

/** ① 출국일 — 귀국편 뒤 관광·식사를 공항 이동·귀국편 앞으로 */
function returnBlockLast(items: ItineraryItem[]): ItineraryItem[] | null {
  const firstFlight = items.findIndex(looksLikeFlightItem);
  if (firstFlight < 0) return null;
  if (!items.slice(firstFlight + 1).some((i) => isContent(i) || mealSlotOf(i) !== null)) return null;
  // 공항 이동 → 귀국편 출발 → 도착 순
  const moves = items.filter(isAirportMove);
  const flights = items.filter(looksLikeFlightItem);
  const rest = items.filter((i) => !moves.includes(i) && !flights.includes(i));
  return [...rest, ...moves, ...flights];
}

/** ② 숙박 호텔 뒤에 낮 관광이 있으면 호텔을 끝으로 (공항 쪽 묶음보다는 앞) */
function stayLast(items: ItineraryItem[]): ItineraryItem[] | null {
  const lastStay = items.reduce((k, i, n) => (isStay(i) ? n : k), -1);
  if (lastStay < 0 || !items.slice(lastStay + 1).some(isDayContent)) return null;
  const stays = items.filter(isStay);
  const rest = items.filter((i) => !isStay(i));
  // 하루 끝의 공항 이동·귀국편 묶음 앞 (도착일 맨 앞의 비행 줄은 상관없음)
  let at = rest.length;
  while (at > 0 && (looksLikeFlightItem(rest[at - 1]) || isAirportMove(rest[at - 1]))) at--;
  return [...rest.slice(0, at), ...stays, ...rest.slice(at)];
}

/** ③ 저녁이 낮 관광보다 앞이면 마지막 낮 관광 뒤로 */
function dinnerAfterTours(items: ItineraryItem[]): ItineraryItem[] | null {
  const di = items.findIndex(isDinner);
  if (di < 0) return null;
  const lastTour = items.reduce((k, i, n) => (isDayContent(i) ? n : k), -1);
  if (lastTour < di) return null;
  const dinner = items[di];
  const rest = items.filter((_, n) => n !== di);
  rest.splice(lastTour, 0, dinner); // lastTour는 dinner를 뺀 뒤 한 칸 당겨졌으므로 그 자리 = 마지막 낮 관광 바로 뒤
  return rest;
}

const LUNCH_FROM = 11 * 60;
const LUNCH_TO = 14 * 60;
const LUNCH_AIM = 11 * 60 + 30;

/** ④ 점심이 시간대를 벗어나면 11:30 무렵 시작하는 관광 앞으로 (없으면 마지막 낮 관광 뒤) */
function lunchInWindow(day: DayPlan, items: ItineraryItem[]): ItineraryItem[] | null {
  const li = items.findIndex(isLunch);
  if (li < 0 || !items.some(isDayContent)) return null;
  // 관광 사이에 끼어 있는 점심은 업체가 정한 자리 — 관광보다 앞(첫 줄)이나 뒤(끝)에 몰린 경우만 옮긴다
  const firstTour = items.findIndex(isDayContent);
  const lastTour = items.reduce((k, i, n) => (isDayContent(i) ? n : k), -1);
  if (li > firstTour && li < lastTour) return null;
  const meeting = dayMeetingTime(day);
  const at = walkTimeline(items, meeting).find((s) => s.item === items[li]);
  if (!at) return null;
  const start = at.start % 1440;
  if (start >= LUNCH_FROM && start <= LUNCH_TO) return null;
  const lunch = items[li];
  const rest = items.filter((_, n) => n !== li);
  const slots = walkTimeline(rest, meeting);
  const target = slots.find((s) => isDayContent(s.item) && s.start % 1440 >= LUNCH_AIM);
  let pos = target ? rest.indexOf(target.item) : rest.reduce((k, i, n) => (isDayContent(i) ? n + 1 : k), -1);
  if (pos < 0) return null;
  // 바로 앞이 관광이 아니면(호텔·이동) 그대로 둔다 — 점심이 미팅 앞으로 가지 않게
  if (pos === 0) pos = Math.max(1, rest.findIndex(isDayContent) + 1);
  if (pos === li) return null;
  rest.splice(pos, 0, lunch);
  return rest;
}

/** 하루 순서 바로잡기 — 바꾼 내용 메모와 함께 */
export function fixDayOrder(day: DayPlan, opts: { last: boolean; arrival: boolean }): { day: DayPlan; notes: string[] } {
  if (day.kind !== "linear" || day.items.length < 2) return { day, notes: [] };
  const notes: string[] = [];
  let items = day.items;
  if (opts.last) {
    const r = returnBlockLast(items);
    if (r) {
      items = r;
      notes.push("귀국편 뒤에 있던 관광·식사를 공항 이동 앞으로");
    }
  }
  const s = stayLast(items);
  if (s) {
    items = s;
    notes.push("숙박 호텔을 관광 뒤(하루 끝)로");
  }
  const d = dinnerAfterTours(items);
  if (d) {
    items = d;
    notes.push("저녁 식사를 낮 관광 뒤로");
  }
  // 도착일은 항공 시각을 맞춘 뒤 도착 뒤 점심으로 따로 정리한다
  if (!opts.arrival) {
    const l = lunchInWindow({ ...day, items }, items);
    if (l) {
      items = l;
      notes.push("점심을 점심 시간대로");
    }
  }
  return notes.length ? { day: { ...day, items }, notes } : { day, notes };
}

/** 업체 코스 전체 순서 바로잡기 */
export function fixCourseOrder(days: DayPlan[]): { days: DayPlan[]; fixes: OrderFix[] } {
  const fixes: OrderFix[] = [];
  const last = days.length - 1;
  const out = days.map((d, i) => {
    const arrival = i === 0 && d.items.slice(0, 2).some(looksLikeFlightItem);
    const r = fixDayOrder(d, { last: i === last && last > 0, arrival });
    if (r.notes.length) fixes.push({ day: d.day, note: `순서 바로잡음: ${r.notes.join(" · ")}` });
    return r.day;
  });
  return { days: fixes.length ? out : days, fixes };
}
