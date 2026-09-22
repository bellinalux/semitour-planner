import { mapDayItems } from "@/lib/itinerary";
import type { AccessibilityResult } from "@/lib/schemas/accessibility";
import type { DayPlan, ItineraryItem } from "@/types";

/** "확인 못함"으로 남아 있는 코스들 (모든 날, 오후 A/B 코스 포함). 확인된 항목은 다시 조사하지 않는다. */
export function accessibilityCheckTargets(days: DayPlan[]): { id: string; name: string; city?: string }[] {
  const out: { id: string; name: string; city?: string }[] = [];
  for (const day of days) {
    const city = (day.overnightCity ?? "").trim() || undefined;
    const all = [...day.items, ...day.amGuided, ...day.pmFreeOptions.flatMap((o) => o.items)];
    for (const item of all) {
      if (item.accessibility && item.accessibility.level === "unknown") out.push({ id: item.id, name: item.name, city });
    }
  }
  return out;
}

export interface AccessibilityApplySummary {
  /** 새로 확인된(unknown이 아니게 바뀐) 항목 수 */
  confirmed: number;
  /** 여전히 확인하지 못한 항목 수 */
  stillUnknown: number;
}

/** 재검색 결과를 일정 항목에 반영한다. */
export function applyAccessibilityResults(days: DayPlan[], results: AccessibilityResult[]): { days: DayPlan[]; summary: AccessibilityApplySummary } {
  const byId = new Map(results.map((r) => [r.id, r]));
  const summary: AccessibilityApplySummary = { confirmed: 0, stillUnknown: 0 };

  const next = days.map((day) =>
    mapDayItems(day, (item: ItineraryItem) => {
      const r = byId.get(item.id);
      if (!r) return item;
      if (r.level === "unknown") summary.stillUnknown++;
      else summary.confirmed++;
      return {
        ...item,
        accessibility: {
          level: r.level,
          wheelchairAccessible: r.wheelchairAccessible,
          accessibleRestroom: r.accessibleRestroom,
          elevator: r.elevator,
          ramp: r.ramp,
          note: r.note,
          mustSeeButHard: item.accessibility?.mustSeeButHard ?? false,
        },
      };
    }),
  );

  return { days: next, summary };
}
