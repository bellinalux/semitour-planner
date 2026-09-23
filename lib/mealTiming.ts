import { clockMinutes, DEFAULT_MEETING_TIME } from "@/lib/dayLoad";
import { isBreakfastItem } from "@/lib/documents";
import type { ItineraryItem } from "@/types";

/** 여행사들이 실무에서 잡는 통상적인 식사 시간대 */
const LUNCH_WINDOW_START = "11:30";
const DINNER_WINDOW_START = "18:00";

/** 조식은 계산에서 빠지므로(투어 시작 전) 다루지 않는다. 중식·석식만 시간대를 확인한다. */
function mealWindowStart(item: ItineraryItem): string | null {
  if (item.type !== "meal" || isBreakfastItem(item)) return null;
  const text = `${item.name} ${item.description ?? ""}`;
  if (/중식|점심|런치|lunch/i.test(text)) return LUNCH_WINDOW_START;
  if (/석식|저녁|디너|dinner/i.test(text)) return DINNER_WINDOW_START;
  return null;
}

function freeTimeItem(id: string, minutes: number): ItineraryItem {
  return {
    id,
    type: "free_time",
    admission: "none",
    name: "자유시간",
    description: "다음 식사 시간에 맞춰 비워 둔 자유시간입니다.",
    stayMinutes: minutes,
    travelMinutesToNext: 0,
    entryFee: 0,
    mealCost: 0,
    isEstimated: true,
  };
}

/**
 * 붙여넣은 코스(kind: "linear")의 항목들을, 중식·석식이 통상적인 시간대(중식 11:30~, 석식 18:00~)
 * 이후에 오도록 다듬는다. 업체 코스는 이동 시간을 적어 두지 않는 경우가 많아, 그대로 시각을 이어 붙이면
 * "중식 09:00", "석식 14:53"처럼 실제로 그 시각에 문을 열지 않는 결과가 나온다. 식사가 시간대보다
 * 일찍 계산되면, 그 앞에 "자유시간" 항목을 끼워 넣어 식사 시각이 시간대 안으로 들어오게 한다.
 * 이미 시간대를 지났으면(식당 폐점 임박 등) 억지로 당기지 않고 그대로 둔다 — 원문 순서를 지키기 위함이다.
 */
export function enforceMealWindows(items: ItineraryItem[], meetingTime: string = DEFAULT_MEETING_TIME): ItineraryItem[] {
  const start = clockMinutes(meetingTime);
  if (start === null) return items;

  const result: ItineraryItem[] = [];
  let clock = start;
  let freeTimeSeq = 0;

  for (const item of items) {
    if (isBreakfastItem(item)) {
      result.push(item);
      continue;
    }
    const windowStart = mealWindowStart(item);
    if (windowStart !== null) {
      const windowStartMinutes = clockMinutes(windowStart);
      if (windowStartMinutes !== null && clock < windowStartMinutes) {
        const gap = windowStartMinutes - clock;
        result.push(freeTimeItem(`${item.id}-free-${freeTimeSeq++}`, gap));
        clock = windowStartMinutes;
      }
    }
    result.push(item);
    clock += Math.max(0, item.stayMinutes) + Math.max(0, item.travelMinutesToNext ?? 0);
  }
  return result;
}
