import { dayTourStart, formatClock, timelineEndMinutes } from "@/lib/dayLoad";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import { isMealFiller } from "@/lib/mealTiming";
import type { DayPlan } from "@/types";

/**
 * 코스 재정렬 미리보기 — 바꾸기 전·후를 날마다 비교한다 (순서·끝나는 시각·이동 시간·점검 점수·무엇을 했는지).
 * 재정렬 자체는 useCourseEngine.reorder: 여러 날 지역 묶기 → 날마다 엔진 추천 순서(영업시간·식사 시간대·이동·일몰/밤) → 식사 시간 맞추기.
 */

export interface DayDiff {
  day: number;
  before: string[];
  after: string[];
  endBefore: string;
  endAfter: string;
  travelBefore: number;
  travelAfter: number;
  scoreBefore: number | null;
  scoreAfter: number | null;
  notes: string[];
  changed: boolean;
}

const names = (d: DayPlan, pm: PmChoice) => dayItems(d, pm).filter((i) => !isMealFiller(i) && i.type !== "flight").map((i) => i.name);
const travel = (d: DayPlan, pm: PmChoice) => dayItems(d, pm).filter((i) => i.type !== "flight").reduce((s, i) => s + Math.max(0, i.travelMinutesToNext ?? 0), 0);
const end = (d: DayPlan, pm: PmChoice) => {
  const m = timelineEndMinutes(dayItems(d, pm), dayTourStart(d));
  return m === null ? "" : formatClock(m);
};

export function diffDays(
  before: DayPlan[],
  after: DayPlan[],
  pmChoice: PmChoice,
  info: { scores?: Record<number, { before: number; after: number }>; notes?: Record<number, string[]> } = {},
): DayDiff[] {
  return after.map((a) => {
    const b = before.find((x) => x.day === a.day) ?? a;
    const nb = names(b, pmChoice);
    const na = names(a, pmChoice);
    const sc = info.scores?.[a.day];
    return {
      day: a.day,
      before: nb,
      after: na,
      endBefore: end(b, pmChoice),
      endAfter: end(a, pmChoice),
      travelBefore: travel(b, pmChoice),
      travelAfter: travel(a, pmChoice),
      scoreBefore: sc?.before ?? null,
      scoreAfter: sc?.after ?? null,
      notes: info.notes?.[a.day] ?? [],
      changed: nb.join("|") !== na.join("|") || end(b, pmChoice) !== end(a, pmChoice),
    };
  });
}
