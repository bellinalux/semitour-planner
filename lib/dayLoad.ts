import { isBreakfastItem } from "@/lib/documents";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import type { DayPlan, ItineraryItem } from "@/types";

/** 오전 미팅(투어 시작) 시각의 기본값. 호텔 조식 이후 실제 투어가 시작되는 시각이다. */
export const DEFAULT_MEETING_TIME = "08:00";

/** 그날의 오전 미팅 시각. 지정하지 않았으면 기본값(08:00)을 쓴다. */
export function dayMeetingTime(day: Pick<DayPlan, "meetingTime">): string {
  return day.meetingTime?.trim() || DEFAULT_MEETING_TIME;
}

/** "HH:mm"을 자정 기준 분으로. 형식이 이상하면 null. */
function parseClock(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return Number.isFinite(minutes) ? minutes : null;
}

/** 자정 기준 분을 "HH:mm"으로 (다음날로 넘어가면 24시간 안으로 돌린다) */
function formatClock(minutes: number): string {
  const wrapped = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = Math.floor(wrapped / 60).toString().padStart(2, "0");
  const mm = (wrapped % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

/** "HH:mm"을 자정 기준 분으로 (외부에서 시각 비교·계산이 필요할 때 쓴다). 형식이 이상하면 null. */
export function clockMinutes(time: string): number | null {
  return parseClock(time);
}

/** 미팅 시각(HH:mm) + 하루 소요 시간(분)을 더한 예상 종료 시각. 형식이 이상하면 null. */
export function estimatedEndTime(meetingTime: string, totalMinutes: number): string | null {
  const start = parseClock(meetingTime);
  if (start === null) return null;
  return formatClock(start + Math.max(0, totalMinutes));
}

/**
 * 두 "HH:mm" 시각(같은 날 또는 다음날로 넘어가는 경우 포함) 사이의 분 차이를 구한다.
 * 항공편처럼 출발·도착이 이미 각자의 현지 시각으로 적혀 있을 때, 그 표기 그대로 이어붙이기 위한 값이다
 * (실제 비행시간과는 다를 수 있다 — 시차 때문에 표기 시각 차이가 실제 소요시간과 다른 게 정상이다).
 * 형식이 이상하면 null.
 */
export function clockDiffMinutes(from: string, to: string): number | null {
  const f = parseClock(from);
  const t = parseClock(to);
  if (f === null || t === null) return null;
  return ((t - f) % (24 * 60) + 24 * 60) % (24 * 60);
}

/** "HH:mm"에 분을 더한다(음수면 뺀다, 자정을 넘나들면 24시간 안으로 돌린다). 형식이 이상하면 null. */
export function shiftClock(time: string, minutes: number): string | null {
  const start = parseClock(time);
  if (start === null) return null;
  return formatClock(start + minutes);
}

export interface ItemTiming {
  /** 이 코스의 시작 시각 (HH:mm) */
  start: string;
  /** 이 코스가 끝나는 시각 (다음 이동을 시작하기 전, HH:mm) */
  end: string;
}

/**
 * 오전 미팅 시각부터 각 코스의 시작·종료 시각을 순서대로 계산한다.
 * 호텔 조식은 투어 시작 전이라 타임라인에서 제외한다(계산에도, 결과 맵에도 없음).
 */
export function computeItemTimings(items: ItineraryItem[], meetingTime: string): Map<string, ItemTiming> {
  const timings = new Map<string, ItemTiming>();
  const start = parseClock(meetingTime);
  if (start === null) return timings;

  let clock = start;
  for (const item of items) {
    if (isBreakfastItem(item)) continue;
    const itemStart = clock;
    const itemEnd = clock + Math.max(0, item.stayMinutes);
    timings.set(item.id, { start: formatClock(itemStart), end: formatClock(itemEnd) });
    clock = itemEnd + Math.max(0, item.travelMinutesToNext ?? 0);
  }
  return timings;
}

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
 * 호텔 조식은 오전 미팅(투어 시작) 전에 끝나는 것이라 이 합계에 넣지 않는다.
 */
export function calcDayLoad(day: DayPlan, pmChoice: PmChoice): DayLoad {
  let stayMinutes = 0;
  let travelMinutes = 0;
  for (const item of dayItems(day, pmChoice)) {
    if (isBreakfastItem(item)) continue;
    stayMinutes += Math.max(0, item.stayMinutes);
    travelMinutes += Math.max(0, item.travelMinutesToNext ?? 0);
  }
  const totalMinutes = stayMinutes + travelMinutes;
  return { day: day.day, stayMinutes, travelMinutes, totalMinutes, level: dayLoadLevel(totalMinutes) };
}

export function calcAllDayLoads(days: DayPlan[], pmChoice: PmChoice): DayLoad[] {
  return days.map((d) => calcDayLoad(d, pmChoice));
}

/** 저녁 활동을 시작하기에 적당한 마지막 시각(18:00). 이 시각까지 크게 남으면 "빈 시간"으로 본다. */
export const DAY_FILL_TARGET_END_MINUTES = 18 * 60;
/** 이 정도(분) 이상 비어야 "추천 일정 채우기"를 보여준다 (약 2시간 30분) */
export const DAY_FILL_MIN_GAP_MINUTES = 150;

export interface DayGap {
  /** 채울 만한 여유 시간(분) */
  freeMinutes: number;
  /** 지금 일정이 끝나는(=비기 시작하는) 시각 */
  fromTime: string;
}

/**
 * 코스가 순서대로 나열된 날짜(kind === "linear")에서 저녁까지 남는 빈 시간을 계산한다.
 * 도착일처럼 일찍 끝나 오후~저녁이 통째로 비는 날을 찾기 위한 것이라 linear 날짜만 대상으로 한다
 * (세미투어 날짜는 오전+오후 구조가 이미 하루를 채우고 있어 이 계산이 필요 없다).
 * 마지막 날(귀국·체크아웃일)은 대상에서 제외한다 — 출국 준비 시간이 필요해 일정을 더 채우면 안 된다.
 */
export function calcDayGap(day: DayPlan, pmChoice: PmChoice, isLastDay: boolean): DayGap | null {
  if (day.kind !== "linear" || isLastDay) return null;
  const load = calcDayLoad(day, pmChoice);
  const start = parseClock(dayMeetingTime(day));
  if (start === null) return null;
  const endMinutes = start + load.totalMinutes;
  const freeMinutes = DAY_FILL_TARGET_END_MINUTES - endMinutes;
  if (freeMinutes < DAY_FILL_MIN_GAP_MINUTES) return null;
  return { freeMinutes, fromTime: formatClock(endMinutes) };
}
