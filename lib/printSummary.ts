import { isTourItem, untimedIds } from "@/lib/feasibility";
import { dayIntensity } from "@/lib/intensity";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import type { DayPlan } from "@/types";

/** 일정표 날 머리의 하루 요약 — "장소 4곳 · 걷기 약 3km · 끝 20:40" (항공 시각을 모르면 끝 시각은 쓰지 않는다) */
export function daySummary(day: DayPlan, pmChoice: PmChoice, timings: Map<string, { start: string; end: string }>): string {
  const items = dayItems(day, pmChoice);
  const places = items.filter((i) => isTourItem(i) && i.type !== "meal").length;
  if (places === 0) return "";
  const km = dayIntensity(day, pmChoice).km;
  const untimed = untimedIds(day, pmChoice);
  const ends = items.filter((i) => isTourItem(i) && !untimed.has(i.id)).map((i) => timings.get(i.id)?.end).filter((e): e is string => Boolean(e));
  const end = ends.length ? ends[ends.length - 1] : "";
  return [`장소 ${places}곳`, km > 0 ? `걷기 약 ${km}km` : "", end ? `끝 ${end}` : ""].filter(Boolean).join(" · ");
}
