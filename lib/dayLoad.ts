import { dayItems, type PmChoice } from "@/lib/itinerary";
import type { DayPlan } from "@/types";

/** 하루 소화 가능 시간 기준(분). 이 값을 넘으면 이동+체류 시간이 빠듯하거나 넘친다고 본다. */
export const DAY_LOAD_OK_MAX = 480; // 8시간
export const DAY_LOAD_TIGHT_MAX = 600; // 10시간

export type DayLoadLevel = "ok" | "tight" | "overloaded";

export interface DayLoad {
  day: number;
  /** 체류 시간 합계(분) */
  stayMinutes: number;
  /** 이동 시간 합계(분) */
  travelMinutes: number;
  /** 체류 + 이동 합계(분) */
  totalMinutes: number;
  level: DayLoadLevel;
}

export function dayLoadLevel(totalMinutes: number): DayLoadLevel {
  if (totalMinutes > DAY_LOAD_TIGHT_MAX) return "overloaded";
  if (totalMinutes > DAY_LOAD_OK_MAX) return "tight";
  return "ok";
}

/**
 * 그날 실제로 진행되는 항목(세미투어는 오전 전체 + 선택된 오후 코스, 업체 코스는 전체)의
 * 체류 시간·이동 시간 합계를 계산한다. 항공 이동일처럼 항목이 없거나 시간이 0인 날은 자연히 "ok"가 된다.
 */
export function calcDayLoad(day: DayPlan, pmChoice: PmChoice): DayLoad {
  let stayMinutes = 0;
  let travelMinutes = 0;
  for (const item of dayItems(day, pmChoice)) {
    stayMinutes += Math.max(0, item.stayMinutes);
    travelMinutes += Math.max(0, item.travelMinutesToNext ?? 0);
  }
  const totalMinutes = stayMinutes + travelMinutes;
  return { day: day.day, stayMinutes, travelMinutes, totalMinutes, level: dayLoadLevel(totalMinutes) };
}

export function calcAllDayLoads(days: DayPlan[], pmChoice: PmChoice): DayLoad[] {
  return days.map((d) => calcDayLoad(d, pmChoice));
}
