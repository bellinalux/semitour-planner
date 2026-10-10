import { applyDayMove, blockMinutes, movable, refitDay, roomOf } from "@/lib/dayBalance";
import { calcDayLoad, dayMeetingTime, dayTourStart, parseClock, timelineEndMinutes } from "@/lib/dayLoad";
import { isCafeMeal } from "@/lib/engineDay";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import type { DayPlan, ItineraryItem, TripPace } from "@/types";

/**
 * 일정 강도 — 업계 관행(힘든 날 다음은 가볍게, 4박 이상이면 자유일)을 점검하고 고치는 제안을 만든다.
 *  - 힘든 날: 관광 9시간 이상 / 한 번에 2시간 넘는 이동 / 07:30 전 출발 / 21:00 넘어 끝남
 *  - 다음 날 제안: 늦은 출발(10:00 미팅) · 오후 자유(점심 뒤 관광을 여유 있는 날로 옮김)
 *  - 여행 전체: 5일 이상인데 쉬는 날이 없으면 가장 가벼운 가운데 날을 전일 자유로 (관광은 다른 날로)
 * 쉬게 한 날은 rest 표시가 붙어 빈 시간 채우기·날짜 옮기기가 다시 채우지 않는다. AI를 쓰지 않는다.
 */

export const HEAVY_LOAD = 540;
const LONG_LEG = 120;
const EARLY = 7 * 60 + 30;
const LATE_END = 21 * 60;
export const LATE_MEETING = "10:00";

const flightMinutes = (items: ItineraryItem[]) => items.filter((i) => i.type === "flight").reduce((s, i) => s + Math.max(0, i.stayMinutes) + Math.max(0, i.travelMinutesToNext ?? 0), 0);

/** 그날이 힘든 이유 (없으면 빈 배열) */
export function heavyReasons(day: DayPlan, pmChoice: PmChoice): string[] {
  const items = dayItems(day, pmChoice);
  if (items.length === 0 || day.rest === "free") return [];
  const out: string[] = [];
  const load = calcDayLoad(day, pmChoice).totalMinutes - flightMinutes(items);
  if (load >= HEAVY_LOAD) out.push(`관광 ${Math.floor(load / 60)}시간${load % 60 ? ` ${load % 60}분` : ""}`);
  const longLeg = Math.max(0, ...items.filter((i) => i.type !== "flight").map((i) => i.travelMinutesToNext ?? 0));
  if (longLeg >= LONG_LEG) out.push(`한 번에 ${Math.floor(longLeg / 60)}시간${longLeg % 60 ? ` ${longLeg % 60}분` : ""} 이동`);
  // 이른 출발은 미팅(기상) 시각으로 본다
  const meet = parseClock(dayMeetingTime(day));
  if (meet !== null && meet < EARLY && !items.some((i) => i.type === "flight")) out.push(`${dayMeetingTime(day)} 이른 출발`);
  const end = timelineEndMinutes(items, dayTourStart(day));
  if (end !== null && end > LATE_END) out.push(`${String(Math.floor(end / 60) % 24).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}에 끝남`);
  return out;
}

export type PaceFixKind = "late" | "pmfree" | "free";

export interface PaceFix {
  kind: PaceFixKind;
  day: number;
  label: string;
  /** 적용할 수 없으면 이유 */
  blocked?: string;
  /** 적용 결과 (blocked면 없음) */
  days?: DayPlan[];
}

export interface PaceIssue {
  /** 힘든 날 (전체 점검이면 0) */
  day: number;
  text: string;
  fixes: PaceFix[];
}

const isLastFlightDay = (days: DayPlan[], d: DayPlan) => d.day === days[days.length - 1].day && d.items.some((i) => i.type === "flight");

/** 늦은 출발 — 미팅을 10:00으로 (이미 늦으면 그대로) */
export function lateStart(days: DayPlan[], dayNo: number): DayPlan[] {
  return days.map((d) => (d.day === dayNo ? refitDay({ ...d, meetingTime: LATE_MEETING, rest: d.rest ?? "late" }) : d));
}

/** 관광을 여유 있는 다른 날로 옮긴다 (쉬는 날·마지막 항공일 빼고, 여유 큰 날부터). 다 못 옮기면 null */
function moveAway(days: DayPlan[], dayNo: number, moving: ItineraryItem[], pmChoice: PmChoice): DayPlan[] | null {
  let work = days;
  // 이어진 묶음 단위로 (중간에 식사가 끼면 나눈다)
  const groups: ItineraryItem[][] = [];
  for (const it of moving) {
    const last = groups[groups.length - 1];
    const src = work.find((d) => d.day === dayNo)!.items;
    if (last && src.indexOf(it) === src.indexOf(last[last.length - 1]) + 1) last.push(it);
    else groups.push([it]);
  }
  for (const g of groups) {
    const minutes = blockMinutes(g);
    const target = work
      .filter((d) => d.day !== dayNo && d.kind === "linear" && !d.rest && !isLastFlightDay(work, d))
      .map((d) => ({ d, room: roomOf(d, pmChoice) }))
      .filter((x) => x.room >= minutes)
      .sort((a, b) => b.room - a.room)[0];
    if (!target) return null;
    work = applyDayMove(work, { fromDay: dayNo, toDay: target.d.day, itemIds: g.map((i) => i.id), label: "", minutes });
  }
  return work;
}

const freeItem = (id: string, name: string, minutes: number, description: string): ItineraryItem => ({
  id,
  type: "free_time",
  admission: "none",
  name,
  description,
  stayMinutes: minutes,
  travelMinutesToNext: 0,
  entryFee: 0,
  mealCost: 0,
  isEstimated: false,
});

/** 오후 자유 — 점심 뒤 관광을 다른 날로 옮기고 오후 자유시간을 둔다 (업체 코스·하루 관광 날만) */
export function afternoonFree(days: DayPlan[], dayNo: number, pmChoice: PmChoice): DayPlan[] | null {
  const day = days.find((d) => d.day === dayNo);
  if (!day || day.kind !== "linear") return null;
  const lunch = day.items.findIndex((i) => i.type === "meal" && !isCafeMeal(i));
  if (lunch < 0) return null;
  const after = day.items.slice(lunch + 1).filter((i) => movable(i));
  if (after.length === 0) return null;
  const moved = moveAway(days, dayNo, after, pmChoice);
  if (!moved) return null;
  return moved.map((d) => {
    if (d.day !== dayNo) return d;
    const at = d.items.findIndex((i) => i.type === "meal" && !isCafeMeal(i));
    const items = [...d.items.slice(0, at + 1).map((i, k) => (k === at ? { ...i, travelMinutesToNext: 10 } : i)), freeItem(`pmfree-${dayNo}`, "오후 자유시간", 210, "호텔 휴식 또는 개별 관광 (가이드·차량 없음)"), ...d.items.slice(at + 1)];
    return refitDay({ ...d, items, rest: "pmfree" });
  });
}

/** 전일 자유 — 그날 관광을 모두 다른 날로 옮기고 전일 자유일정 한 줄만 둔다 */
export function fullFree(days: DayPlan[], dayNo: number, pmChoice: PmChoice): DayPlan[] | null {
  const day = days.find((d) => d.day === dayNo);
  if (!day || day.kind !== "linear") return null;
  const tour = day.items.filter((i) => movable(i));
  const moved = tour.length > 0 ? moveAway(days, dayNo, tour, pmChoice) : days;
  if (!moved) return null;
  return moved.map((d) =>
    d.day === dayNo
      ? {
          ...d,
          items: [
            ...d.items.filter((i) => i.type === "hotel" || i.type === "flight" || i.type === "transfer"),
            freeItem(`free-${dayNo}`, "전일 자유일정", 480, "가이드·차량 없이 자유롭게 보내는 날입니다. 선택관광·스파·쇼핑을 안내하세요."),
          ],
          rest: "free" as const,
        }
      : d,
  );
}

/** 일정 강도 점검 — 힘든 날 다음 날 제안, 이틀 연속 힘든 날, 긴 여행의 쉬는 날 */
export function paceIssues(days: DayPlan[], pmChoice: PmChoice, pace: TripPace): PaceIssue[] {
  if (days.length < 2) return [];
  const out: PaceIssue[] = [];
  const heavy = days.map((d) => heavyReasons(d, pmChoice));
  for (let i = 0; i < days.length - 1; i++) {
    if (heavy[i].length === 0) continue;
    const next = days[i + 1];
    if (next.rest || isLastFlightDay(days, next) || dayItems(next, pmChoice).length === 0) continue;
    const nextHeavy = heavy[i + 1].length > 0;
    const startNext = parseClock(dayTourStart(next));
    if (!nextHeavy && startNext !== null && startNext >= 9 * 60 + 30) continue;
    const fixes: PaceFix[] = [];
    fixes.push({ kind: "late", day: next.day, label: `DAY ${next.day} 늦은 출발 (${LATE_MEETING} 미팅)`, days: lateStart(days, next.day) });
    if (next.kind === "linear") {
      const r = afternoonFree(days, next.day, pmChoice);
      fixes.push(r ? { kind: "pmfree", day: next.day, label: `DAY ${next.day} 오후 자유 (점심 뒤 관광은 다른 날로)`, days: r } : { kind: "pmfree", day: next.day, label: `DAY ${next.day} 오후 자유`, blocked: "점심 뒤 관광을 옮길 날의 여유가 없습니다" });
    }
    out.push({
      day: days[i].day,
      text: `DAY ${days[i].day}이(가) 힘든 날(${heavy[i].join(" · ")})인데 DAY ${next.day}도 ${nextHeavy ? `힘든 날(${heavy[i + 1].join(" · ")})` : "일찍 시작"}입니다`,
      fixes,
    });
  }
  // 5일 이상인데 쉬는 날(반나절 이상)이 없으면 — 알참은 빼고
  const restCount = days.filter((d) => d.rest).length;
  const middle = days.filter((d, i) => i > 0 && i < days.length - 1 && d.kind === "linear" && !d.rest && dayItems(d, pmChoice).length > 0);
  if (pace !== "packed" && days.length >= 5 && restCount === 0 && middle.length > 0) {
    const lightest = [...middle].sort((a, b) => calcDayLoad(a, pmChoice).totalMinutes - calcDayLoad(b, pmChoice).totalMinutes)[0];
    const free = fullFree(days, lightest.day, pmChoice);
    const pm = afternoonFree(days, lightest.day, pmChoice);
    out.push({
      day: 0,
      text: `${days.length}일 여행에 쉬는 날이 없습니다 — 업계는 4박 이상이면 반나절~하루 자유를 둡니다${pace === "relaxed" ? " (일정 강도: 여유)" : ""}`,
      fixes: [
        free ? { kind: "free", day: lightest.day, label: `DAY ${lightest.day} 전일 자유 (관광은 다른 날로)`, days: free } : { kind: "free", day: lightest.day, label: `DAY ${lightest.day} 전일 자유`, blocked: "관광을 옮길 날의 여유가 없습니다" },
        ...(pm ? [{ kind: "pmfree" as const, day: lightest.day, label: `DAY ${lightest.day} 오후 자유`, days: pm }] : []),
        { kind: "late", day: lightest.day, label: `DAY ${lightest.day} 늦은 출발 (${LATE_MEETING} 미팅)`, days: lateStart(days, lightest.day) },
      ],
    });
  }
  return out;
}

export const REST_LABEL: Record<NonNullable<DayPlan["rest"]>, string> = { late: "오전 자유 · 늦은 출발", pmfree: "오후 자유", free: "전일 자유" };
