import type { DayPlan, PmFreeOption } from "@/types";

export type PmChoice = Record<number, PmFreeOption["id"]>;

/** 그날 고객이 선택한 오후 코스 (선택이 없으면 첫 번째 옵션) */
export function pickPmOption(day: DayPlan, pmChoice: PmChoice): PmFreeOption | undefined {
  return day.pmFreeOptions.find((o) => o.id === pmChoice[day.day]) ?? day.pmFreeOptions[0];
}

/** 일정 생성 직후의 기본 선택: 모든 날짜 오후 A 코스 */
export function defaultPmChoice(days: DayPlan[]): PmChoice {
  return Object.fromEntries(days.map((d) => [d.day, d.pmFreeOptions[0]?.id ?? "A"]));
}
