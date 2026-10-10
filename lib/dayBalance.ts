import { calcDayLoad, DAY_LOAD_OK_MAX, DAY_LOAD_TIGHT_MAX, dayTourStart } from "@/lib/dayLoad";
import { isCafeMeal } from "@/lib/engineDay";
import { formatDuration } from "@/lib/format";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import { refitMealWindows } from "@/lib/mealTiming";
import type { DayPlan, ItineraryItem } from "@/types";

/**
 * 날짜 사이 일정 나누기 — 한 날은 너무 길고 다른 날(예: 자유일정 날)은 비어 있을 때,
 * 긴 날의 한 구역(걸어서 함께 도는 장소 묶음, 없으면 이어진 관광지 묶음)을 여유 있는 날로 옮기자고 제안한다.
 * 그리고 "쉬는 시간 없이 4시간" 같은 문제를 풀 휴식 시간을 넣는다.
 */

export interface DayMove {
  fromDay: number;
  toDay: number;
  itemIds: string[];
  /** 옮기는 묶음 이름 (구역 이름 또는 첫 장소 외 N곳) */
  label: string;
  /** 옮기는 묶음의 체류+이동 합 (분) */
  minutes: number;
  /** 주의 (예: 받는 날이 가이드·차량 미포함 자유일정이면 비용이 늘어난다) */
  note?: string;
}

/** 옮기지 않는 항목 — 항공·이동·숙소·점심·저녁·저녁 일정 (카페·간식은 그 동네 구역과 함께 옮긴다) */
const FIXED = new Set(["flight", "transfer", "hotel"]);
const EVENING = /야경|야시장|야간|분수쇼|나이트|night/i;
export const movable = (i: ItineraryItem) =>
  !FIXED.has(i.type ?? "sightseeing") &&
  i.type !== "free_time" &&
  (i.type !== "meal" || isCafeMeal(i)) &&
  !EVENING.test(i.name) &&
  !/공항|미팅|체크인|체크아웃/.test(i.name);
/** 점심이 없는 날에 관광(자유시간 빼고)이 옮겨 온 것까지 2시간 넘게 되면 자유식 점심을 함께 넣는다 */
function lunchNeeded(items: ItineraryItem[], addMinutes: number): boolean {
  if (items.some((i) => i.type === "meal" && !isCafeMeal(i))) return false;
  const guided = items.filter((i) => i.type !== "free_time" && i.type !== "hotel" && i.type !== "flight").reduce((s, i) => s + Math.max(0, i.stayMinutes) + Math.max(0, i.travelMinutesToNext ?? 0), 0);
  return guided + addMinutes >= 120;
}
/** 받는 날에 시작 시각이 없으면 — 관광지 문 여는 시간에 맞춰 09:00 미팅 */
const MOVED_MEETING = "09:00";
export const blockMinutes = (items: ItineraryItem[]) => items.reduce((s, i) => s + Math.max(0, i.stayMinutes) + Math.max(0, i.travelMinutesToNext ?? 0), 0);

/** 옮길 묶음 후보 — 구역(timeCheck.area)이 있으면 구역 단위, 없으면 이어진 관광지 묶음 */
function blocks(items: ItineraryItem[]): ItineraryItem[][] {
  const out: ItineraryItem[][] = [];
  let cur: ItineraryItem[] = [];
  const flush = () => {
    if (cur.length > 0) out.push(cur);
    cur = [];
  };
  for (const it of items) {
    if (!movable(it)) {
      flush();
      continue;
    }
    const area = it.timeCheck?.basis === "area" ? it.timeCheck.area : undefined;
    const prevArea = cur.length > 0 && cur[cur.length - 1].timeCheck?.basis === "area" ? cur[cur.length - 1].timeCheck?.area : undefined;
    if (cur.length > 0 && area !== prevArea) flush();
    cur.push(it);
  }
  flush();
  return out;
}

/** 여유 있는 날 — 항공 이동일(첫날·마지막 날)은 빼고, 하루 부담이 8시간 이하인 날. 자유일정만 있는 날이 가장 좋다 */
/** 하루 부담에서 항공(비행·공항 대기)은 뺀다 — 비행 3시간은 관광 일정을 옮겨도 줄지 않는다 */
function tourLoad(day: DayPlan, pmChoice: PmChoice): number {
  const flight = dayItems(day, pmChoice)
    .filter((i) => i.type === "flight")
    .reduce((s, i) => s + Math.max(0, i.stayMinutes) + Math.max(0, i.travelMinutesToNext ?? 0), 0);
  return calcDayLoad(day, pmChoice).totalMinutes - flight;
}

export function roomOf(day: DayPlan, pmChoice: PmChoice): number {
  const items = dayItems(day, pmChoice);
  const free = items.filter((i) => i.type === "free_time").reduce((s, i) => s + i.stayMinutes, 0);
  const load = tourLoad(day, pmChoice);
  // 자유시간은 바꿔 쓸 수 있으니 여유로 센다
  return Math.max(0, DAY_LOAD_OK_MAX - (load - free));
}

export function suggestDayMoves(days: DayPlan[], pmChoice: PmChoice): DayMove[] {
  if (days.length < 2) return [];
  const hasFlight = (d: DayPlan) => dayItems(d, pmChoice).some((i) => i.type === "flight");
  const targets = days.filter((d, i) => d.kind === "linear" && !(i === days.length - 1 && hasFlight(d)) && roomOf(d, pmChoice) >= 90);
  const out: DayMove[] = [];
  for (const day of days) {
    if (day.kind !== "linear") continue;
    const load = tourLoad(day, pmChoice);
    if (load <= DAY_LOAD_TIGHT_MAX) continue;
    const excess = load - DAY_LOAD_OK_MAX;
    const candidates = blocks(day.items).filter((b) => b.length > 0 && blockMinutes(b) >= 60);
    if (candidates.length === 0) continue;
    // 넘친 만큼에 가장 가까운 묶음 (같으면 뒤쪽 — 하루 끝을 줄인다)
    const pick = candidates.reduce((best, b) => (Math.abs(blockMinutes(b) - excess) <= Math.abs(blockMinutes(best) - excess) ? b : best));
    const minutes = blockMinutes(pick);
    const target = targets.filter((t) => t.day !== day.day).sort((a, b) => roomOf(b, pmChoice) - roomOf(a, pmChoice))[0];
    // 받는 날이 넘치지 않게 — 옮기는 시간(점심이 없는 날이면 자유식 점심 70분까지)이 여유 안에 들어가야 한다
    const needLunch = !!target && lunchNeeded(target.items, minutes);
    if (!target || roomOf(target, pmChoice) < minutes + (needLunch ? 70 : 0)) continue;
    const area = pick[0].timeCheck?.basis === "area" ? pick[0].timeCheck.area : undefined;
    out.push({
      fromDay: day.day,
      toDay: target.day,
      itemIds: pick.map((i) => i.id),
      label: `${area ? (/구역$/.test(area) ? area : `${area} 구역`) : pick.length > 1 ? `${pick[0].name} 외 ${pick.length - 1}곳` : pick[0].name}(${pick.length}곳, ${formatDuration(minutes)})을 DAY ${target.day}로 옮기기`,
      minutes,
      ...(dayItems(target, pmChoice).some((i) => /미포함|불포함/.test(`${i.name} ${i.description}`))
        ? { note: `DAY ${target.day}는 가이드·차량 미포함 일정이라, 옮기면 그날 가이드·차량 비용이 늘어납니다 (업체에 확인)` }
        : {}),
    });
  }
  return out;
}

/** 시간이 바뀐 날의 식사 맞춤 자유시간을 다시 계산 (중간·끝에 항공이 있는 날은 그대로) */
export function refitDay(day: DayPlan): DayPlan {
  if (day.kind !== "linear") return day;
  const flightLater = day.items.some((it, i) => it.type === "flight" && day.items.slice(0, i).some((p) => p.type !== "flight"));
  return flightLater ? day : { ...day, items: refitMealWindows(day.items, dayTourStart(day)) };
}

/**
 * 묶음을 다른 날로 옮긴다 — 받는 날에 자유시간이 있으면 그 앞에 넣고 자유시간을 그만큼 줄이며(30분 안 남으면 뺀다),
 * 없으면 하루 끝 숙소 앞에 넣는다. 받는 날에 점심이 없으면 자유식 점심을, 시작 시각이 없으면 09:00 미팅을 함께 넣는다.
 * 두 날 모두 식사 맞춤 자유시간을 다시 계산한다.
 */
export function applyDayMove(days: DayPlan[], move: DayMove): DayPlan[] {
  const from = days.find((d) => d.day === move.fromDay);
  if (!from) return days;
  const ids = new Set(move.itemIds);
  const moving = from.items.filter((i) => ids.has(i.id));
  if (moving.length === 0) return days;
  // 옮기는 묶음의 마지막 이동은 받는 날 앞뒤가 달라지므로 짧게(10분) 둔다
  const block = moving.map((i, k) => (k === moving.length - 1 ? { ...i, travelMinutesToNext: 10 } : i));
  return days.map((d) => {
    if (d.day === move.fromDay) return refitDay({ ...d, items: d.items.filter((i) => !ids.has(i.id)) });
    if (d.day !== move.toDay) return d;
    const items = d.items.slice();
    // 점심이 없는 날(자유일정 날)에 관광이 2시간 넘게 되면 묶음 뒤에 자유식 점심을 함께 넣는다
    const lunch: ItineraryItem[] =
      lunchNeeded(items, move.minutes)
        ? [
            {
              id: `lunch-${d.day}-${move.fromDay}`,
              type: "meal",
              name: "점심 식사 (자유식)",
              description: "관광을 옮겨 오며 넣은 점심입니다. 포함 여부·식대는 업체와 확인하세요.",
              stayMinutes: 60,
              travelMinutesToNext: 10,
              entryFee: 0,
              mealCost: 0,
              isEstimated: true,
              admission: "none",
            },
          ]
        : [];
    const added = [...block, ...lunch];
    const addedMinutes = move.minutes + lunch.reduce((s, i) => s + i.stayMinutes + (i.travelMinutesToNext ?? 0), 0);
    const freeIdx = items.findIndex((i) => i.type === "free_time");
    if (freeIdx >= 0) {
      const free = items[freeIdx];
      const left = free.stayMinutes - addedMinutes;
      items.splice(freeIdx, 1, ...added, ...(left >= 30 ? [{ ...free, stayMinutes: left }] : []));
    } else {
      const endIdx = items.findIndex((i) => i.type === "hotel");
      items.splice(endIdx >= 0 ? endIdx : items.length, 0, ...added);
    }
    return refitDay({ ...d, ...(d.meetingTime?.trim() ? {} : { meetingTime: MOVED_MEETING }), items });
  });
}

/**
 * 쉬는 틈(식사·카페·자유시간) 없이 4시간 넘게 이어지는 곳 가운데쯤에 30분 휴식(카페·자유시간)을 넣는다. 넣을 곳이 없으면 그대로.
 */
export function insertBreak(day: DayPlan, minutes = 30): DayPlan {
  if (day.kind !== "linear") return day;
  const items = day.items;
  let run = 0;
  let runStart = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.type === "meal" || it.type === "free_time" || it.type === "flight" || it.type === "hotel") {
      run = 0;
      runStart = i + 1;
      continue;
    }
    // 코스 엔진과 같은 기준 — 체류 + 이 장소까지 오는 이동 (식사 뒤 첫 이동도 센다)
    run += Math.max(0, it.stayMinutes) + (i > 0 ? Math.max(0, items[i - 1].travelMinutesToNext ?? 0) : 0);
    if (run > 240) {
      // 쉬지 않고 이어진 구간의 가운데쯤에 넣는다
      const at = Math.max(runStart + 1, Math.floor((runStart + i) / 2) + 1);
      const rest: ItineraryItem = {
        id: `break-${day.day}-${at}`,
        type: "free_time",
        name: "휴식 · 카페",
        description: "쉬지 않고 4시간 넘게 이어져 중간에 넣은 휴식 시간입니다.",
        stayMinutes: minutes,
        travelMinutesToNext: 0,
        entryFee: 0,
        mealCost: 0,
        isEstimated: false,
        admission: "none",
      };
      return refitDay({ ...day, items: [...items.slice(0, at), rest, ...items.slice(at)] });
    }
  }
  return day;
}
