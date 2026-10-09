import { calcDayLoad, DAY_LOAD_TIGHT_MAX } from "@/lib/dayLoad";
import { roundMinutes } from "@/lib/format";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import { isMealFiller } from "@/lib/mealTiming";
import type { DayTimeArea, DayTimeRequest } from "@/lib/schemas/dayTime";
import type { DayPlan, ItineraryItem } from "@/types";

/**
 * 일정 시간 검증 결과를 하루 일정에 반영한다 — 구역(걸어서 함께 도는 장소 묶음)마다
 *  - 구역 안 관광 항목의 체류시간 합 = 구역 총시간 − 도보 이동 합 (지금 체류시간 비율대로 나누고, 장소마다 최소 10분)
 *  - 구역 안 이동 = 도보 시간, 구역 마지막 → 다음 항목 = 확인된 이동 시간
 *  - 식사·카페는 체류시간을 그대로 두고(식사 시간은 구역 총시간에서 빠져 있다) 이동만 맞춘다
 * 사람이 직접 고친 체류시간은 바꾸지 않는다.
 */

const UNIT = 10;
const NOT_A_PLACE = new Set(["flight", "transfer", "hotel"]);
/** 이보다 짧은 도보는 따로 이동으로 두지 않고 체류시간에 넣는다 — 일정표는 시작 시각을 10분 단위로 올려서, 3분 도보도 10분이 되어 버린다 */
const FOLD_WALK_UNDER = 10;

/** 사람이 직접 고친 체류시간인지 */
const editedByHand = (item: ItineraryItem) => item.stayEdited === true;

/** total(10분 단위)을 weights 비율대로 10분 단위로 나눈다 — 각 최소 10분, 합은 정확히 total (큰 나머지부터 10분씩) */
function splitUnits(total: number, weights: number[]): number[] {
  const n = weights.length;
  const units = Math.max(n, Math.round(total / UNIT));
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  const raw = weights.map((w) => (sum > 0 ? (Math.max(0, w) / sum) * units : units / n));
  const base = raw.map((r) => Math.max(1, Math.floor(r)));
  let left = units - base.reduce((s, b) => s + b, 0);
  const order = raw.map((r, i) => ({ i, rest: r - Math.floor(r) })).sort((a, b) => b.rest - a.rest);
  for (let k = 0; left > 0 && n > 0; k = (k + 1) % n, left--) base[order[k].i]++;
  return base.map((b) => b * UNIT);
}

function fitList(items: ItineraryItem[], areas: DayTimeArea[], checkedAt: string): ItineraryItem[] {
  const next = items.map((i) => ({ ...i }));
  const pos = new Map(next.map((i, idx) => [i.id, idx]));
  for (const area of areas) {
    const idxs = area.itemIds
      .map((id) => pos.get(id))
      .filter((i): i is number => i !== undefined)
      .sort((a, b) => a - b);
    if (idxs.length === 0) continue;
    const members = idxs.map((i) => next[i]);
    const sights = members.filter((m) => m.type !== "meal" && !NOT_A_PLACE.has(m.type ?? ""));
    const fixed = sights.filter(editedByHand);
    const flexible = sights.filter((m) => !editedByHand(m));
    // 짧은 도보는 체류에 넣어(이동 0) 구역 총시간이 일정표에 그대로 나오게 하고, 긴 도보만 이동으로 둔다
    const foldWalk = area.walkMinutes < FOLD_WALK_UNDER;
    const walk = foldWalk ? 0 : roundMinutes(area.walkMinutes);
    const walkTotal = walk * Math.max(0, idxs.length - 1);
    const budget = area.totalMinutes - walkTotal - fixed.reduce((s, m) => s + m.stayMinutes, 0);
    if (flexible.length > 0) {
      const stays = splitUnits(
        Math.max(flexible.length * UNIT, budget),
        flexible.map((m) => m.stayMinutes),
      );
      flexible.forEach((m, k) => (m.stayMinutes = stays[k]));
    }
    // 이동: 구역 안은 도보(짧으면 0), 구역 마지막은 다음 항목까지 확인된 이동
    idxs.forEach((i, k) => {
      const nextIdx = i + 1;
      if (nextIdx >= next.length) return;
      const nextInArea = idxs[k + 1] === nextIdx;
      if (nextInArea) next[i].travelMinutesToNext = walk;
      else if (k === idxs.length - 1 && area.travelToNextMinutes > 0) next[i].travelMinutesToNext = roundMinutes(area.travelToNextMinutes) || UNIT;
    });
    for (const [k, m] of members.entries()) {
      m.timeCheck = {
        basis: "area",
        area: area.name,
        ...(k === 0 && area.dropOff ? { dropOff: area.dropOff } : {}),
        ...(k === 0 && area.pickUp ? { pickUp: area.pickUp } : {}),
        ...(area.region ? { region: area.region } : {}),
        sourceName:
          [area.sourceName, foldWalk && area.walkMinutes > 0 ? `구역 안 도보 ${area.walkMinutes}분 포함` : ""].filter(Boolean).join(" · ") || undefined,
        checkedAt,
      };
    }
  }
  return next;
}

/** 검증 결과(구역)를 하루 일정의 모든 목록(하루 전체·오전·오후 A/B)에 반영한다 */
export function fitDayTimes(day: DayPlan, areas: DayTimeArea[], checkedAt: string): DayPlan {
  if (areas.length === 0) return day;
  return {
    ...day,
    items: fitList(day.items, areas, checkedAt),
    amGuided: fitList(day.amGuided, areas, checkedAt),
    pmFreeOptions: day.pmFreeOptions.map((o) => ({ ...o, items: fitList(o.items, areas, checkedAt) })),
  };
}

/** 하루 일정을 검증 요청으로 — 식사 맞춤 자유시간(앱이 넣은 것)은 빼고, 실제 진행 순서대로 */
export function dayTimeRequestDay(day: DayPlan, pmChoice: PmChoice): DayTimeRequest["days"][number] | null {
  const items = dayItems(day, pmChoice)
    .filter((i) => !isMealFiller(i))
    .map((i) => ({ id: i.id, name: i.name.slice(0, 120), type: i.type ?? "sightseeing", stayMinutes: Math.max(0, i.stayMinutes) }));
  const places = items.filter((i) => !NOT_A_PLACE.has(i.type));
  if (places.length < 2) return null;
  return { day: day.day, city: (day.overnightCity ?? "").trim(), items: items.slice(0, 40) };
}

/** 시간 검증이 필요해 보이는 날 — 체류+이동이 10시간을 넘는 날 */
export function daysNeedingTimeCheck(days: DayPlan[], pmChoice: PmChoice): number[] {
  return days.filter((d) => calcDayLoad(d, pmChoice).totalMinutes > DAY_LOAD_TIGHT_MAX).map((d) => d.day);
}
