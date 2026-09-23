import { TOUR_CATEGORY_MAP } from "@/lib/itemTypes";
import { roundMinutes } from "@/lib/format";
import { midpoint } from "@/lib/travelEstimate";
import type { DayFillSuggestion } from "@/lib/schemas/dayFill";
import type { DayPlan, ItineraryItem, TourCandidate, TourSlot } from "@/types";

/** 투어 후보를 일정 항목으로 바꾼다. 1인 요금은 검색 범위의 중간값(추정)으로 넣는다. */
export function tourToItem(tour: TourCandidate): ItineraryItem {
  const category = TOUR_CATEGORY_MAP[tour.category];
  return {
    id: `tour-${crypto.randomUUID().slice(0, 8)}`,
    type: category.itemType,
    admission: tour.category === "museum" ? "enter" : "none",
    name: tour.name,
    description: [tour.description, tour.includes ? `포함: ${tour.includes}` : ""].filter(Boolean).join(" · "),
    stayMinutes: roundMinutes(tour.durationMinutes),
    travelMinutesToNext: null,
    entryFee: midpoint(tour.priceLow, tour.priceHigh),
    mealCost: 0,
    isEstimated: true,
    caution: tour.booking || undefined,
    link: tour.searchUrl,
    fromCatalog: true,
  };
}

/** "추천일정 채우기"로 받은 추천 하나를 일정 항목으로 바꾼다. id는 넣는 쪽(insertSegment)에서 새로 발급한다. */
export function dayFillToItem(s: DayFillSuggestion, isLast: boolean): ItineraryItem {
  return {
    id: `fill-${crypto.randomUUID().slice(0, 8)}`,
    name: s.name,
    description: [s.description, s.reason ? `— ${s.reason}` : ""].filter(Boolean).join(" "),
    stayMinutes: roundMinutes(s.stayMinutes),
    travelMinutesToNext: isLast ? null : roundMinutes(s.travelMinutesToNext),
    entryFee: Math.max(0, s.entryFee),
    mealCost: Math.max(0, s.mealCost),
    isEstimated: true,
    caution: s.caution || undefined,
    cuisine: s.cuisine || undefined,
  };
}

/** 그날에 넣을 수 있는 위치 목록 */
export function slotOptions(day: DayPlan): { slot: TourSlot; label: string }[] {
  if (day.kind === "linear") return [{ slot: "day", label: "하루 일정 (호텔 복귀 전)" }];
  return [
    { slot: "am", label: "오전 (점심 전)" },
    ...day.pmFreeOptions.map((o) => ({ slot: `pm:${o.id}` as TourSlot, label: `오후 ${o.id} 코스` })),
  ];
}

/** 항목 여러 개를 그날의 지정한 위치에 한 번에 끼워 넣는다. 마지막 항목이 점심/호텔이면 그 앞에 넣는다. */
export function insertItems(day: DayPlan, slot: TourSlot, items: ItineraryItem[]): DayPlan {
  if (items.length === 0) return day;
  const beforeLast = <T extends { type?: string }>(list: T[], toAdd: T[], keepLastTypes: string[]) => {
    const copy = [...list];
    const last = copy[copy.length - 1];
    if (copy.length > 1 && last && keepLastTypes.includes(last.type ?? "")) copy.splice(copy.length - 1, 0, ...toAdd);
    else copy.push(...toAdd);
    return copy;
  };

  if (day.kind === "linear") return { ...day, items: beforeLast(day.items, items, ["hotel"]) };

  if (slot === "am") {
    // 오전 목록의 마지막은 점심 식당이므로 그 앞에 넣는다
    const list = [...day.amGuided];
    if (list.length > 1) list.splice(list.length - 1, 0, ...items);
    else list.push(...items);
    return { ...day, amGuided: list };
  }

  const optionId = slot === "pm:B" ? "B" : "A";
  return {
    ...day,
    pmFreeOptions: day.pmFreeOptions.map((o) => (o.id === optionId ? { ...o, items: [...o.items, ...items] } : o)),
  };
}

/** 항목 하나를 그날의 지정한 위치에 끼워 넣는다. */
export function insertItem(day: DayPlan, slot: TourSlot, item: ItineraryItem): DayPlan {
  return insertItems(day, slot, [item]);
}
