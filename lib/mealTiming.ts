import { clockMinutes, DEFAULT_MEETING_TIME, morningFreeItems, snapUp } from "@/lib/dayLoad";
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

const FILLER_NOTE = "다음 식사 시간에 맞춰 비워 둔 자유시간입니다.";
/**
 * 식사 시간대보다 이만큼 이른 것은 그대로 둔다 (분) — 식당은 보통 11시·17시 반에 열고, 여행사 일정표도 11시 점심을 흔히 쓴다.
 * 이보다 더 이르면 그때만 자유시간을 넣는다 ("자유시간 10분" 같은 이해 안 되는 항목을 만들지 않는다).
 */
export const MEAL_EARLY_OK = 30;

function freeTimeItem(id: string, minutes: number): ItineraryItem {
  return {
    id,
    type: "free_time",
    admission: "none",
    name: "자유시간",
    description: FILLER_NOTE,
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
 * 식사 바로 앞이 이미 자유시간이면 새 줄을 끼우지 않고 그 자유시간을 늘린다 (업계 일정표는 자유시간을 한 줄로 쓴다).
 * 오전 자유(미팅 전 자유시간)는 시각을 매기지 않으므로 늘리지도 끼우지도 않는다 — 미팅 시각으로 맞춘다.
 */
export function enforceMealWindows(items: ItineraryItem[], meetingTime: string = DEFAULT_MEETING_TIME): ItineraryItem[] {
  const start = clockMinutes(meetingTime);
  if (start === null) return items;

  const result: ItineraryItem[] = [];
  let clock = start;
  let freeTimeSeq = 0;
  const beforeMeeting = new Set(morningFreeItems(items));

  for (const item of items) {
    if (isBreakfastItem(item) || beforeMeeting.has(item)) {
      result.push(item);
      continue;
    }
    // 시각 계산은 일정표와 같게 — 원문 시각이 있으면 그때까지 기다리고, 항공 외 항목은 10분 단위로 올려서 시작한다 (walkTimeline)
    const fixed = item.fixedTime ? clockMinutes(item.fixedTime) : null;
    if (fixed !== null && fixed > clock) clock = fixed;
    if (item.type !== "flight") clock = snapUp(clock);
    const windowStart = mealWindowStart(item);
    if (windowStart !== null) {
      const windowStartMinutes = clockMinutes(windowStart);
      if (windowStartMinutes !== null && windowStartMinutes - clock > MEAL_EARLY_OK) {
        const gap = windowStartMinutes - clock;
        const prev = result.at(-1);
        if (prev && beforeMeeting.has(prev)) {
          // 오전 자유 바로 뒤 — 미팅 시각을 고칠 일이다 (일정 카드 점검에 나온다)
        } else if (prev?.type === "free_time" && !isBreakfastItem(prev)) {
          result[result.length - 1] = { ...prev, stayMinutes: prev.stayMinutes + gap, mealPadMinutes: (prev.mealPadMinutes ?? 0) + gap };
          clock = windowStartMinutes;
        } else {
          result.push(freeTimeItem(`${item.id}-free-${freeTimeSeq++}`, gap));
          clock = windowStartMinutes;
        }
      }
    }
    result.push(item);
    const end = clock + Math.max(0, item.stayMinutes);
    clock = (item.type === "flight" ? end : snapUp(end)) + Math.max(0, item.travelMinutesToNext ?? 0);
  }
  return result;
}

/** enforceMealWindows가 끼워 넣은 자유시간인지 (사람이 넣은 자유시간은 건드리지 않는다) */
export const isMealFiller = (item: ItineraryItem) => item.type === "free_time" && /-free-\d+$/.test(item.id) && item.description === FILLER_NOTE;

/**
 * 하루 일정의 시작 시각이 바뀐 뒤(예: 항공 시각을 맞춘 뒤) 식사 시간대 맞춤 자유시간을 다시 계산한다.
 * 예전 시각 기준으로 넣어 둔 자유시간은 빼고, 지금 미팅 시각으로 다시 넣는다.
 */
export function refitMealWindows(items: ItineraryItem[], meetingTime: string): ItineraryItem[] {
  return enforceMealWindows(stripMealPads(items), meetingTime);
}

/** 앱이 식사 시간대에 맞추려고 넣은 것을 되돌린다 — 끼운 자유시간은 빼고, 늘린 자유시간은 원래 길이로 */
export function stripMealPads(items: ItineraryItem[]): ItineraryItem[] {
  return items
    .filter((i) => !isMealFiller(i))
    .map((i) => {
      if (!i.mealPadMinutes) return i;
      const { mealPadMinutes, ...rest } = i;
      return { ...rest, stayMinutes: Math.max(0, i.stayMinutes - mealPadMinutes) };
    });
}

/** 점심·저녁 식사인지 (이름·설명으로) — 아니면 카페·디저트·간식으로 본다 */
export const isMainMeal = (text: string) => /중식|점심|런치|lunch|석식|저녁|디너|dinner|식사/i.test(text);

/**
 * 식사 항목 체류시간의 현실적인 범위 — 점심·저녁 40~90분, 카페·디저트 20~60분.
 * AI가 문화공간 같은 곳을 카페로 분류해 90분 넘게 잡는 일을 막는다. 0(모름)은 그대로 둔다.
 */
export function clampMealStay(type: string | undefined, text: string, minutes: number): number {
  if (type !== "meal" || minutes <= 0) return minutes;
  const [min, max] = isMainMeal(text) ? [40, 90] : [20, 60];
  return Math.min(max, Math.max(min, minutes));
}
