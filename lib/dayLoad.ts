import { isBreakfastItem } from "@/lib/documents";
import { TIME_STEP } from "@/lib/format";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import type { DayPlan, ItineraryItem } from "@/types";

/** 오전 미팅(투어 시작) 시각의 기본값. 호텔 조식 이후 실제 투어가 시작되는 시각이다. */
export const DEFAULT_MEETING_TIME = "08:00";

/** 그날의 오전 미팅 시각. 지정하지 않았으면 기본값(08:00)을 쓴다. */
export function dayMeetingTime(day: Pick<DayPlan, "meetingTime">): string {
  return day.meetingTime?.trim() || DEFAULT_MEETING_TIME;
}

/** 호텔 미팅 → 첫 장소 이동 기본값(분) — 시내 관광 차량 이동의 흔한 값 */
export const DEFAULT_HOTEL_LEAD = 30;
const NO_LEAD_TYPES = new Set(["flight", "transfer", "hotel", "free_time"]);

/**
 * 호텔 미팅 뒤 첫 장소까지 이동 시간(분). 직접 넣은 값이 있으면 그 값,
 * 없으면 둘째 날부터(전날 호텔에서 출발) 첫 항목이 관광지·식당이고 이름이 미팅·출발 안내가 아닐 때 30분.
 */
export function hotelLeadMinutes(day: Pick<DayPlan, "day" | "kind" | "items" | "amGuided" | "hotelLeadMinutes">): number {
  if (typeof day.hotelLeadMinutes === "number" && Number.isFinite(day.hotelLeadMinutes)) return Math.max(0, Math.round(day.hotelLeadMinutes));
  if (day.day <= 1) return 0;
  const list = (day.kind === "semi" ? day.amGuided : day.items).filter((i) => !isBreakfastItem(i));
  const first = list[0];
  if (!first || NO_LEAD_TYPES.has(first.type ?? "sightseeing")) return 0;
  if (/미팅|로비|픽업|집결|출발|호텔/.test(first.name)) return 0;
  return DEFAULT_HOTEL_LEAD;
}

/** 그날 첫 장소에 도착하는 시각 (미팅 + 호텔에서 이동) — 일정표 시각 계산은 여기서 시작한다 */
export function dayTourStart(day: Pick<DayPlan, "day" | "kind" | "items" | "amGuided" | "hotelLeadMinutes" | "meetingTime">): string {
  const meeting = dayMeetingTime(day);
  const lead = hotelLeadMinutes(day);
  if (lead === 0) return meeting;
  const m = parseClock(meeting);
  return m === null ? meeting : formatClock(m + lead);
}

/** "HH:mm"을 자정 기준 분으로. 형식이 이상하면 null. */
export function parseClock(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return Number.isFinite(minutes) ? minutes : null;
}

/** 자정 기준 분을 "HH:mm"으로 (다음날로 넘어가면 24시간 안으로 돌린다) */
export function formatClock(minutes: number): string {
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

/** 10분 단위로 올림 (08:45 → 08:50) */
export const snapUp = (minutes: number) => Math.ceil(minutes / TIME_STEP) * TIME_STEP;

export interface TimelineSlot {
  item: ItineraryItem;
  /** 자정 기준 분 */
  start: number;
  end: number;
}

/**
 * 오전 미팅 시각부터 각 코스의 시작·종료 시각(분)을 순서대로 계산한다.
 * 여행사 일정표처럼 시각은 10분 단위로 끊는다 — 앞 코스가 08:45에 끝나면 다음 코스는 08:50부터.
 * 항공 항목만은 실제 출발·도착 시각이라 그대로 둔다. 호텔 조식은 투어 시작 전이라 제외한다.
 */
export function walkTimeline(items: ItineraryItem[], meetingTime: string): TimelineSlot[] {
  const start = parseClock(meetingTime);
  if (start === null) return [];
  const slots: TimelineSlot[] = [];
  let clock = start;
  for (const item of items) {
    if (isBreakfastItem(item)) continue;
    const flight = item.type === "flight";
    // 원문에 시작 시각이 적힌 곳(예: 가이드 미팅 11:30, 분수쇼 20:00)은 그 시각까지 기다린다 (늦으면 그대로 — 점검에서 알린다)
    const fixed = item.fixedTime ? parseClock(item.fixedTime) : null;
    if (fixed !== null && fixed > clock) clock = fixed;
    const itemStart = flight ? clock : snapUp(clock);
    const itemEnd = flight ? itemStart + Math.max(0, item.stayMinutes) : snapUp(itemStart + Math.max(0, item.stayMinutes));
    slots.push({ item, start: itemStart, end: itemEnd });
    clock = itemEnd + Math.max(0, item.travelMinutesToNext ?? 0);
  }
  return slots;
}

/** 그날 마지막 코스가 끝나는 시각(분). 코스가 없으면 null */
export function timelineEndMinutes(items: ItineraryItem[], meetingTime: string): number | null {
  const slots = walkTimeline(items, meetingTime);
  return slots.length > 0 ? slots[slots.length - 1].end : null;
}

/** 그날 마지막 코스가 끝나는 시각 "HH:mm". 코스가 없으면 null */
export function timelineEndTime(items: ItineraryItem[], meetingTime: string): string | null {
  const end = timelineEndMinutes(items, meetingTime);
  return end === null ? null : formatClock(end);
}

/** 각 코스의 시작·종료 시각 "HH:mm" (조식 등 타임라인에서 빠진 항목은 맵에 없음) */
export function computeItemTimings(items: ItineraryItem[], meetingTime: string): Map<string, ItemTiming> {
  return new Map(walkTimeline(items, meetingTime).map((s) => [s.item.id, { start: formatClock(s.start), end: formatClock(s.end) }]));
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
  // 호텔 미팅 뒤 첫 장소까지 이동
  travelMinutes += hotelLeadMinutes(day);
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
  // 일부러 쉬게 둔 날(오전·오후·전일 자유)은 채우지 않는다
  if (day.kind !== "linear" || isLastDay || day.rest) return null;
  const endMinutes = timelineEndMinutes(dayItems(day, pmChoice), dayTourStart(day)) ?? parseClock(dayMeetingTime(day));
  if (endMinutes === null) return null;
  const freeMinutes = DAY_FILL_TARGET_END_MINUTES - endMinutes;
  if (freeMinutes < DAY_FILL_MIN_GAP_MINUTES) return null;
  return { freeMinutes, fromTime: formatClock(endMinutes) };
}

/** 국내·해외 여행 모두, 하루 일정은 일반적으로 이 시각 전에 끝나야 한다고 본다 */
export const STANDARD_DAY_END = "19:00";

/** 근교투어·당일치기처럼 복귀가 늦어질 수 있는 일정인지, 항목 이름·설명으로 짐작한다 */
function hasLateReturnException(items: ItineraryItem[]): boolean {
  return items.some((item) => /근교|당일치기|데이\s*투어|원데이|야간|야경|나이트|day\s*trip/i.test(`${item.name} ${item.description ?? ""}`));
}

export interface DayEndCheck {
  /** 그날 일정의 계산된 종료 시각 */
  endTime: string;
  /** 표준 종료 시각(19:00)을 넘겼는데도 근교투어 등 예외에 해당하지 않는 경우 true */
  isLate: boolean;
}

/**
 * 하루 일정이 표준 종료 시각(19:00) 안에 끝나는지 확인한다. 근교투어·당일치기·야간투어처럼
 * 복귀가 늦어질 수 있는 일정이 하루에 하나라도 있으면 늦게 끝나도 예외로 본다(경고하지 않는다).
 * 항공 이동일처럼 일정이 없는 날(totalMinutes 0)은 대상이 아니다.
 */
export function calcDayEnd(day: DayPlan, pmChoice: PmChoice): DayEndCheck | null {
  const load = calcDayLoad(day, pmChoice);
  if (load.totalMinutes === 0) return null;
  const endTime = timelineEndTime(dayItems(day, pmChoice), dayTourStart(day));
  if (!endTime) return null;
  const endMinutes = parseClock(endTime);
  const standardMinutes = parseClock(STANDARD_DAY_END);
  if (endMinutes === null || standardMinutes === null) return null;
  const isLate = endMinutes > standardMinutes && !hasLateReturnException(dayItems(day, pmChoice));
  return { endTime, isLate };
}
