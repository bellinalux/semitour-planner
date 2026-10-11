import { isHotelBreakfast } from "@/lib/documents";
import { dayTourStart, walkTimeline } from "@/lib/dayLoad";
import { inferMealSlots } from "@/lib/mealSlot";
import { refitMealWindows } from "@/lib/mealTiming";
import type { DayPlan, ItineraryItem } from "@/types";

/**
 * 일정 정리 — 고객에게 이해 안 되는 항목을 뺀다.
 *  - 그날 마지막 숙소(호텔 투숙·체크인·복귀)는 머무는 시간이 의미 없으므로 0으로 (도착 시각만 보인다)
 *  - 20분이 안 되는 자유시간은 뺀다 (관광 뒤 "자유시간 10분" 같은 것 — 앞뒤 일정에 자연스럽게 흡수된다)
 *  - 호텔 조식은 코스 항목으로 두지 않는다 (일정표에 "호텔 조식 후", 식사 칸에 호텔식)
 *  - "석식 (선상디너 크루즈)"처럼 식사인데 체험·관광으로 들어온 줄은 식사로
 *  - 항공: 출발 항공의 체류(공항 수속)는 0 — 수속은 "출발 3시간 전 공항 집결"로 일정표가 따로 쓴다. 항공의 소요 표기(약 100분)는 지운다
 *  - 이름만 있는 식당("마담란")은 그날 순서·시각으로 중식·석식·카페를 정해 둔다
 * 사람이 고친 값도 같은 규칙으로 본다: 투숙 체류시간·10분 자유시간은 업계 일정표에 쓰지 않는다.
 */

/** 이보다 짧은 자유시간은 일정에 넣지 않는다 (분) */
export const MIN_FREE_MINUTES = 20;

/** 그날 마지막 숙소 항목 — 뒤에 항공·이동만 있거나 아무것도 없으면 투숙으로 본다 */
export function isOvernightStay(items: ItineraryItem[], index: number): boolean {
  const it = items[index];
  if (it?.type !== "hotel") return false;
  return items.slice(index + 1).every((x) => x.type === "flight" || x.type === "transfer" || x.type === "hotel");
}

const MEAL_AS_TOUR = /^\s*(석식|중식|저녁|점심)|디너\s*크루즈|선상\s*디너|dinner\s*cruise/i;

/** 식사인데 체험·관광으로 들어온 줄 → 식사 (식사 칸·특식·식사 시간대에 들어가게) */
function mealAsTour(it: ItineraryItem): ItineraryItem {
  if ((it.type !== "experience" && it.type !== "sightseeing") || !MEAL_AS_TOUR.test(it.name)) return it;
  const lunch = /^\s*(중식|점심)/.test(it.name);
  return { ...it, type: "meal", admission: "none", mealSlot: lunch ? "lunch" : "dinner", mealCost: it.mealCost > 0 ? it.mealCost : it.entryFee, entryFee: 0 };
}

/** 항공 항목 — 출발 항공 체류(수속)는 0, 소요 표기는 지운다 (도착 항공의 체류는 입국·미팅 시간이라 둔다) */
function tidyFlight(it: ItineraryItem): ItineraryItem {
  if (it.type !== "flight") return it;
  const arrival = /도착|arriv/i.test(it.name);
  if ((arrival || it.stayMinutes === 0) && !it.timeNote) return it;
  return { ...it, ...(arrival ? {} : { stayMinutes: 0 }), timeNote: undefined };
}

export function tidyItems(items: ItineraryItem[]): ItineraryItem[] {
  const kept = items.filter((i) => !(i.type === "free_time" && i.stayMinutes > 0 && i.stayMinutes < MIN_FREE_MINUTES) && !isHotelBreakfast(i));
  let changed = kept.length !== items.length;
  const out = kept.map((raw, i) => {
    const it = tidyFlight(mealAsTour(raw));
    if (it !== raw) changed = true;
    if (!isOvernightStay(kept, i) || (it.stayMinutes === 0 && (i < kept.length - 1 || it.travelMinutesToNext == null))) return it;
    changed = true;
    return { ...it, stayMinutes: 0, ...(i === kept.length - 1 ? { travelMinutesToNext: null } : {}) };
  });
  return changed ? out : items;
}

/** 이름만 있는 식당에 식사 구분 — 그날 타임라인 시각으로 */
function withMealSlots(day: DayPlan): DayPlan {
  const list = day.kind === "semi" ? day.amGuided : day.items;
  if (!list.some((i) => (i.type === "meal" || (i.type === undefined && i.mealCost > 0)) && !i.mealSlot)) return day;
  const starts = new Map(walkTimeline(list, dayTourStart(day)).map((s) => [s.item, s.start]));
  const next = inferMealSlots(list, (i) => starts.get(i) ?? null);
  if (next === list) return day;
  if (day.kind === "semi") return { ...day, amGuided: next };
  // 식사 구분이 새로 정해졌으면 식사 시간대(중식 11:30~·석식 18:00~)도 다시 맞춘다 — 하루 중간에 항공이 있는 날은 그대로
  const flightMid = next.some((it, i) => it.type === "flight" && next.slice(0, i).some((p) => p.type !== "flight") && next.slice(i + 1).some((p) => !["flight", "transfer", "hotel"].includes(p.type ?? "")));
  const withSlots = { ...day, items: next };
  return flightMid ? withSlots : { ...withSlots, items: refitMealWindows(next, dayTourStart(withSlots)) };
}

/**
 * 호텔 조식 줄을 빼기 전에 그 줄의 "다음까지 이동"(호텔 → 첫 일정)을 살린다 — 업체 코스는 "호텔 조식 후 방콕으로 이동(2시간 30분)"처럼
 * 조식 줄에 이동 시간이 붙어 온다. 다음 줄이 시간 없는 이동(차량)이면 그 이동 시간으로, 장소면 호텔→첫 장소 이동으로 옮긴다.
 */
export function liftBreakfast(day: DayPlan): DayPlan {
  const semi = day.kind === "semi";
  const list = semi ? day.amGuided : day.items;
  const k = list.findIndex(isHotelBreakfast);
  if (k < 0) return day;
  const travel = Math.max(0, list[k].travelMinutesToNext ?? 0);
  const next = list.slice(k + 1).find((i) => !isHotelBreakfast(i));
  let kept = list.filter((i) => !isHotelBreakfast(i));
  let lead: number | undefined;
  if (travel >= 5 && next && list.slice(0, k).every(isHotelBreakfast)) {
    if (next.type === "transfer" && next.stayMinutes <= 0) kept = kept.map((i) => (i === next ? { ...i, stayMinutes: travel } : i));
    else if (!["transfer", "flight", "hotel", "free_time"].includes(next.type ?? "sightseeing") && day.hotelLeadMinutes === undefined && !/미팅|로비|픽업|집결|출발|호텔/.test(next.name)) lead = travel;
  }
  return { ...day, ...(semi ? { amGuided: kept } : { items: kept }), ...(lead !== undefined ? { hotelLeadMinutes: lead } : {}) };
}

/** 하루 일정 전체 (오전 가이드·오후 자유 선택 포함). 바뀐 게 없으면 같은 객체 */
export function tidyDay(day: DayPlan): DayPlan {
  const base = liftBreakfast(day);
  const items = tidyItems(base.items);
  const amGuided = tidyItems(base.amGuided);
  const tidied = base === day && items === day.items && amGuided === day.amGuided ? day : { ...base, items, amGuided };
  return withMealSlots(tidied);
}

export function tidyDays(days: DayPlan[]): DayPlan[] {
  const next = days.map(tidyDay);
  return next.some((d, i) => d !== days[i]) ? next : days;
}

/** 시각 표시 — 머무는 시간이 없으면 시작 시각만 (예: "21:00") */
export function timeRange(t: { start: string; end: string }, sep = " – "): string {
  return t.start === t.end ? t.start : `${t.start}${sep}${t.end}`;
}
