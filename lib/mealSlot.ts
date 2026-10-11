import type { ItineraryItem, MealSlotKind } from "@/types";

/**
 * 식사 구분 — 조식·중식·석식·카페. 업계 일정표는 모든 식사를 조·중·석으로 나눈다.
 * 항목에 구분(mealSlot)이 있으면 그것, 없으면 이름·설명의 글자("중식", "석식"), 그것도 없으면 null —
 * 이름만 있는 식당("마담란")은 일정을 정리할 때(inferMealSlots) 순서와 시각으로 정해 항목에 남긴다.
 */

const BREAKFAST = /조식|아침\s*식사|브런치|breakfast/i;
const LUNCH = /중식|점심|런치|lunch/i;
const DINNER = /석식|저녁|디너|dinner|야식/i;
/** 카페·디저트·간식·바 — 식사 시간대를 따르지 않는다 */
const CAFE = /카페|커피|cafe|coffee|디저트|베이커리|에그타르트|타르트|빙수|티룸|찻집|젤라또|아이스크림|루프탑\s*바|펍|pub|\bbar\b|칵테일|맥주/i;

/** 식사 항목인가 (유형이 식사거나, 유형이 없는데 식대가 있는 항목) */
export const isMealItem = (i: ItineraryItem) => i.type === "meal" || (i.type === undefined && i.mealCost > 0);

/** 글자로 아는 식사 구분 (모르면 null) */
export function mealSlotByText(i: ItineraryItem): MealSlotKind | null {
  if (BREAKFAST.test(i.name)) return "breakfast";
  const text = `${i.name} ${i.description ?? ""}`;
  if (LUNCH.test(text)) return "lunch";
  if (DINNER.test(text)) return "dinner";
  if (CAFE.test(`${i.name} ${i.cuisine ?? ""}`)) return "cafe";
  return null;
}

/** 이 항목의 식사 구분 — 식사가 아니면 null, 식사인데 모르면 null (정리할 때 정해진다) */
export function mealSlotOf(i: ItineraryItem): MealSlotKind | null {
  if (!isMealItem(i)) return null;
  return i.mealSlot ?? mealSlotByText(i);
}

/** 점심·저녁 식사인가 (카페·조식 제외) */
export const isMainMealItem = (i: ItineraryItem) => {
  const s = mealSlotOf(i);
  return s === "lunch" || s === "dinner";
};

/**
 * 구분 없는 식사에 구분을 정한다 — 카페 글자가 있으면 카페, 아니면 그날 식사 순서와 시각으로:
 * 식사가 둘 이상이면 첫 끼는 중식·마지막 끼는 석식(가운데는 15:30 기준), 하나면 15:30 전 중식·뒤 석식.
 * start: 그날 타임라인의 시작 시각(분). 바뀐 게 없으면 같은 배열.
 */
export function inferMealSlots(items: ItineraryItem[], start: (i: ItineraryItem) => number | null): ItineraryItem[] {
  const meals = items.filter((i) => isMealItem(i) && !i.mealSlot);
  if (meals.length === 0) return items;
  const slot = new Map<ItineraryItem, MealSlotKind>();
  for (const m of meals) {
    const t = mealSlotByText(m);
    if (t) slot.set(m, t);
  }
  // 글자로 모르는 식당 — 그날 점심·저녁 자리 중 비어 있는 쪽으로
  const taken = new Set(items.map((i) => (isMealItem(i) ? (i.mealSlot ?? slot.get(i) ?? null) : null)).filter(Boolean));
  const unknown = meals.filter((m) => !slot.has(m));
  const late = (m: ItineraryItem) => ((start(m) ?? 0) % 1440) >= 15 * 60 + 30;
  unknown.forEach((m, k) => {
    let s: MealSlotKind;
    if (unknown.length >= 2) s = k === 0 ? "lunch" : k === unknown.length - 1 ? "dinner" : late(m) ? "dinner" : "lunch";
    else s = late(m) ? "dinner" : "lunch";
    // 이미 그 끼니가 있으면 다른 쪽, 둘 다 있으면 카페(간식)로
    if (taken.has(s)) s = s === "lunch" && !taken.has("dinner") ? "dinner" : s === "dinner" && !taken.has("lunch") ? "lunch" : "cafe";
    taken.add(s);
    slot.set(m, s);
  });
  return items.map((i) => (slot.has(i) ? { ...i, mealSlot: slot.get(i)! } : i));
}
