import { refitDay } from "@/lib/dayBalance";
import { morningMeeting, parseClock } from "@/lib/dayLoad";
import { isBreakfastItem, isHotelBreakfast } from "@/lib/documents";
import { stripMealPads } from "@/lib/mealTiming";
import type { DayPlan, ItineraryItem } from "@/types";

/**
 * 하루 구성 점검 — 업계 일정표 기준으로 이해 안 되는 구성을 찾아 한 번에 고친다.
 *  ① 호텔 조식이 코스 항목으로 들어 있음 → 뺀다 ("호텔 조식 후"·조: 호텔식은 일정표가 알아서 쓴다)
 *  ② 자유시간이 연달아 나옴 (수영장 자유시간 + 식사 맞춤 자유시간 등) → 한 줄로
 *  ③ 오전 자유인데 미팅이 이름 (08:00 미팅 → 08:00부터 자유시간) → 자유시간 뒤 미팅 (점심이면 11:30 도착에 맞춤)
 */

const GENERIC_FREE = /^\s*자유\s*시간\s*$/;

/** 이어진 자유시간을 한 줄로 — 이름은 구체적인 쪽, 설명은 비어 있지 않은 쪽, 시간은 합, 다음 이동은 마지막 줄 것 */
export function mergeFreeRuns(items: ItineraryItem[]): ItineraryItem[] {
  const out: ItineraryItem[] = [];
  for (const it of items) {
    const prev = out.at(-1);
    if (prev?.type === "free_time" && it.type === "free_time") {
      out[out.length - 1] = {
        ...prev,
        name: GENERIC_FREE.test(prev.name) && !GENERIC_FREE.test(it.name) ? it.name : prev.name,
        description: prev.description?.trim() ? prev.description : it.description,
        stayMinutes: Math.max(0, prev.stayMinutes) + Math.max(0, it.stayMinutes),
        travelMinutesToNext: it.travelMinutesToNext,
      };
      continue;
    }
    out.push(it);
  }
  return out;
}

const tourList = (day: DayPlan) => (day.kind === "semi" ? day.amGuided : day.items);

function hasFreeRun(items: ItineraryItem[]): boolean {
  const list = items.filter((i) => !isBreakfastItem(i));
  return list.some((it, k) => k > 0 && it.type === "free_time" && list[k - 1].type === "free_time");
}

/** 오전 자유인데 직접 정한 미팅이 자유시간 뒤 미팅보다 이르면 [정한 시각, 맞는 시각] */
function earlyMeeting(day: DayPlan): [string, string] | null {
  const set = day.meetingTime?.trim();
  const auto = morningMeeting(day);
  if (!set || !auto) return null;
  const a = parseClock(set);
  const b = parseClock(auto);
  return a !== null && b !== null && a < b ? [set, auto] : null;
}

/** 이 날 확인할 것 — 구성 문제 (없으면 빈 배열) */
export function dayStructureIssues(day: DayPlan): string[] {
  const out: string[] = [];
  const list = tourList(day);
  const breakfast = list.filter(isHotelBreakfast);
  if (breakfast.length > 0) out.push(`호텔 조식이 코스 항목으로 들어 있음 — 업계 일정표는 첫 줄을 "호텔 조식 후"로 쓰고 식사 칸에 "조: 호텔식"만 적습니다`);
  if (hasFreeRun(list)) out.push("자유시간이 연달아 나옴 — 업계 일정표는 자유시간을 한 줄로 씁니다");
  const early = earlyMeeting(day);
  if (early) out.push(`오전 자유인데 미팅이 ${early[0]} — 자유시간은 미팅 전이라, 자유시간 뒤 ${early[1]} 호텔 로비 미팅이 맞습니다`);
  return out;
}

/** 구성 문제를 한 번에 고친다 — 조식 빼기, 자유시간 합치기, 오전 자유 뒤 미팅, 식사 시간대 다시 맞추기. 고칠 게 없으면 같은 객체 */
export function fixDayStructure(day: DayPlan): DayPlan {
  if (dayStructureIssues(day).length === 0) return day;
  const clean = (list: ItineraryItem[], pads: boolean) => mergeFreeRuns((pads ? stripMealPads(list) : list).filter((i) => !isHotelBreakfast(i)));
  const next: DayPlan = { ...day, items: clean(day.items, day.kind === "linear"), amGuided: clean(day.amGuided, false) };
  if (earlyMeeting(day)) delete next.meetingTime;
  return day.kind === "linear" ? refitDay(next) : next;
}
