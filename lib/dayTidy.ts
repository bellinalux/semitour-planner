import { isHotelBreakfast } from "@/lib/documents";
import type { DayPlan, ItineraryItem } from "@/types";

/**
 * 일정 정리 — 고객에게 이해 안 되는 항목을 뺀다.
 *  - 그날 마지막 숙소(호텔 투숙·체크인·복귀)는 머무는 시간이 의미 없으므로 0으로 (도착 시각만 보인다)
 *  - 20분이 안 되는 자유시간은 뺀다 (관광 뒤 "자유시간 10분" 같은 것 — 앞뒤 일정에 자연스럽게 흡수된다)
 *  - 호텔 조식은 코스 항목으로 두지 않는다 (일정표에 "호텔 조식 후", 식사 칸에 호텔식)
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

export function tidyItems(items: ItineraryItem[]): ItineraryItem[] {
  const kept = items.filter((i) => !(i.type === "free_time" && i.stayMinutes > 0 && i.stayMinutes < MIN_FREE_MINUTES) && !isHotelBreakfast(i));
  let changed = kept.length !== items.length;
  const out = kept.map((it, i) => {
    if (!isOvernightStay(kept, i) || (it.stayMinutes === 0 && (i < kept.length - 1 || it.travelMinutesToNext == null))) return it;
    changed = true;
    return { ...it, stayMinutes: 0, ...(i === kept.length - 1 ? { travelMinutesToNext: null } : {}) };
  });
  return changed ? out : items;
}

/** 하루 일정 전체 (오전 가이드·오후 자유 선택 포함). 바뀐 게 없으면 같은 객체 */
export function tidyDay(day: DayPlan): DayPlan {
  const items = tidyItems(day.items);
  const amGuided = tidyItems(day.amGuided);
  if (items === day.items && amGuided === day.amGuided) return day;
  return { ...day, items, amGuided };
}

export function tidyDays(days: DayPlan[]): DayPlan[] {
  const next = days.map(tidyDay);
  return next.some((d, i) => d !== days[i]) ? next : days;
}

/** 시각 표시 — 머무는 시간이 없으면 시작 시각만 (예: "21:00") */
export function timeRange(t: { start: string; end: string }, sep = " – "): string {
  return t.start === t.end ? t.start : `${t.start}${sep}${t.end}`;
}
