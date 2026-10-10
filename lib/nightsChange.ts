import { applyDayMove, blockMinutes, movable, roomOf } from "@/lib/dayBalance";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import type { DayPlan, TourOption } from "@/types";

/**
 * 박수 바꾸기 — 3박 4일 ↔ 4박 5일·2박 3일.
 *  줄이기: 가운데 날 중 근거(지식 창고 인기)가 적고 가벼운 날을 빼고, 그날 장소는 근거 있는 곳부터 여유 있는 날로 옮긴다 (못 옮기면 빠짐)
 *  늘리기: 새 날(AI가 이미 있는 곳을 빼고 만든 날)을 마지막 날 앞에 넣는다
 * 날 번호·선택관광 날짜를 다시 맞춘다.
 */

export interface ShortenResult {
  days: DayPlan[];
  removedDay: number;
  moved: string[];
  dropped: string[];
}

const hasFlight = (d: DayPlan) => [...d.items, ...d.amGuided].some((i) => i.type === "flight");

/** 날 번호를 1부터 다시 */
export function renumber(days: DayPlan[]): DayPlan[] {
  return days.map((d, i) => (d.day === i + 1 ? d : { ...d, day: i + 1 }));
}

/** 빠진·들어간 날에 맞춰 선택관광 날짜를 옮긴다 (빠진 날의 것은 날짜 미정으로) */
export function shiftOptions(options: TourOption[], removedDay: number | null, insertedAt: number | null, count = 1): TourOption[] {
  return options.map((o) => {
    if (!o.dayNo) return o;
    if (removedDay !== null) return o.dayNo === removedDay ? { ...o, dayNo: 0 } : o.dayNo > removedDay ? { ...o, dayNo: o.dayNo - 1 } : o;
    if (insertedAt !== null && o.dayNo >= insertedAt) return { ...o, dayNo: o.dayNo + count };
    return o;
  });
}

/** 하루 줄이기 — 뺄 날을 고르고 장소를 다른 날로 */
export function shortenOne(days: DayPlan[], pmChoice: PmChoice): ShortenResult | null {
  const middle = days.filter((d, i) => i > 0 && i < days.length - 1 && !hasFlight(d));
  if (middle.length === 0) return null;
  const weight = (d: DayPlan) => {
    const items = dayItems(d, pmChoice);
    return items.filter((i) => i.reason).length * 100 + blockMinutes(items.filter((i) => i.type !== "free_time"));
  };
  const target = [...middle].sort((a, b) => weight(a) - weight(b) || b.day - a.day)[0];
  let work = days;
  const moved: string[] = [];
  const dropped: string[] = [];
  const places = dayItems(target, pmChoice)
    .filter((i) => movable(i) && i.type !== "meal")
    .sort((a, b) => Number(!!b.reason) - Number(!!a.reason));
  for (const it of places) {
    if (target.kind !== "linear") {
      dropped.push(it.name);
      continue;
    }
    const minutes = blockMinutes([it]);
    const to = work
      .filter((d) => d.day !== target.day && d.kind === "linear" && !d.rest && !(d === work[work.length - 1] && hasFlight(d)))
      .map((d) => ({ d, room: roomOf(d, pmChoice) }))
      .filter((x) => x.room >= minutes)
      .sort((a, b) => b.room - a.room)[0];
    if (!to) {
      dropped.push(it.name);
      continue;
    }
    work = applyDayMove(work, { fromDay: target.day, toDay: to.d.day, itemIds: [it.id], label: "", minutes });
    moved.push(`${it.name} → DAY ${to.d.day < target.day ? to.d.day : to.d.day - 1}`);
  }
  return { days: renumber(work.filter((d) => d.day !== target.day)), removedDay: target.day, moved, dropped };
}

/** 새 날을 넣는다 (마지막 날에 항공이 있으면 그 앞, 아니면 맨 뒤) */
export function insertDays(days: DayPlan[], extra: DayPlan[]): { days: DayPlan[]; insertedAt: number } {
  const last = days[days.length - 1];
  const at = last && hasFlight(last) ? days.length - 1 : days.length;
  const next = [...days.slice(0, at), ...extra, ...days.slice(at)];
  return { days: renumber(next), insertedAt: at + 1 };
}

/** 지금 일정의 장소 이름 (새 날을 만들 때 빼 달라고 한다) */
export function placeNames(days: DayPlan[]): string[] {
  return [...new Set(days.flatMap((d) => [...d.items, ...d.amGuided, ...d.pmFreeOptions.flatMap((o) => o.items)]).filter((i) => !["flight", "transfer", "hotel", "free_time"].includes(i.type ?? "sightseeing")).map((i) => i.name))].slice(0, 60);
}
