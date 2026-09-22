import { insertItems } from "@/lib/tourItem";
import type { DayPlan, ItineraryItem, PmFreeOption, TourSlot, TripInput } from "@/types";

export type PmChoice = Record<number, PmFreeOption["id"]>;

/** 그날 고객이 선택한 오후 코스 (선택이 없으면 첫 번째 옵션) */
export function pickPmOption(day: DayPlan, pmChoice: PmChoice): PmFreeOption | undefined {
  return day.pmFreeOptions.find((o) => o.id === pmChoice[day.day]) ?? day.pmFreeOptions[0];
}

/** 일정 생성 직후의 기본 선택: 모든 날짜 오후 A 코스 */
export function defaultPmChoice(days: DayPlan[]): PmChoice {
  return Object.fromEntries(days.map((d) => [d.day, d.pmFreeOptions[0]?.id ?? "A"]));
}

/** 실제로 진행되는 그날의 항목 (세미투어: 오전 전체 + 선택한 오후 코스 / 업체 코스: 전체) */
export function dayItems(day: DayPlan, pmChoice: PmChoice): ItineraryItem[] {
  if (day.kind === "linear") return day.items;
  return [...day.amGuided, ...(pickPmOption(day, pmChoice)?.items ?? [])];
}

/** 하루 안의 모든 항목(선택되지 않은 오후 코스 포함)에 변환을 적용한다. null을 반환하면 그 항목을 삭제한다. */
export function mapDayItems(day: DayPlan, fn: (item: ItineraryItem) => ItineraryItem | null): DayPlan {
  const apply = (items: ItineraryItem[]) => items.flatMap((item) => fn(item) ?? []);
  return {
    ...day,
    items: apply(day.items),
    amGuided: apply(day.amGuided),
    pmFreeOptions: day.pmFreeOptions.map((o) => ({ ...o, items: apply(o.items) })),
  };
}

/** 차량·가이드가 실제로 붙는 일수: 항공 외의 일정이 하나라도 있는 날 */
export function groundDays(days: DayPlan[], pmChoice: PmChoice): number {
  return days.filter((d) => dayItems(d, pmChoice).some((i) => (i.type ?? "sightseeing") !== "flight")).length;
}

/** 도시별 숙박 수 (일정의 "그날 밤 숙박 도시" 기준, 처음 나온 순서) */
export function overnightNights(days: DayPlan[]): { city: string; nights: number }[] {
  const counts = new Map<string, number>();
  for (const d of days) {
    const city = (d.overnightCity ?? "").trim();
    if (city) counts.set(city, (counts.get(city) ?? 0) + 1);
  }
  return [...counts].map(([city, nights]) => ({ city, nights }));
}

/** 항공 이동일 항목은 비용이 없는 고정 문구다 */
function travelItem(id: string, type: "flight" | "transfer" | "hotel", name: string): ItineraryItem {
  return {
    id,
    type,
    name,
    description: "",
    stayMinutes: 0,
    travelMinutesToNext: null,
    entryFee: 0,
    mealCost: 0,
    isEstimated: false,
    admission: "none",
  };
}

/** 항공 이동일 계획: 첫날(출발·도착·체크인)과 마지막 날(체크아웃·공항·귀국) */
export function withTravelDays(tourDays: DayPlan[], input: Pick<TripInput, "originCity" | "destination">): DayPlan[] {
  const origin = input.originCity.trim() || "출발지";
  const destination = input.destination.trim() || "현지";
  const empty = { amGuided: [], pmFreeOptions: [] };

  const arrival: DayPlan = {
    ...empty,
    day: 1,
    theme: "출국 · 도착",
    kind: "linear",
    overnightCity: destination,
    items: [
      travelItem("tv-in-1", "flight", `${origin} 출발`),
      travelItem("tv-in-2", "transfer", `${destination} 도착 · 호텔 이동`),
      travelItem("tv-in-3", "hotel", "호텔 체크인 및 휴식"),
    ],
  };
  const departure: DayPlan = {
    ...empty,
    day: tourDays.length + 2,
    theme: "귀국",
    kind: "linear",
    overnightCity: "",
    items: [
      travelItem("tv-out-1", "hotel", "호텔 체크아웃"),
      travelItem("tv-out-2", "transfer", "공항 이동"),
      travelItem("tv-out-3", "flight", `${origin} 도착`),
    ],
  };

  return [arrival, ...tourDays.map((d, i) => ({ ...d, day: i + 2 })), departure];
}

/** 항공 이동일을 제외하고 AI가 만들어야 하는 관광일 수 */
export function tourDayCount(input: Pick<TripInput, "days" | "includesFlights">): number {
  return input.includesFlights ? Math.max(1, input.days - 2) : input.days;
}

/** ---------- 항목 재정렬·이동·복사, 날짜 가져오기 ---------- */

/** item이 들어있는 목록과, 그 목록을 바꿔 day에 다시 넣는 함수. 못 찾으면 null. */
function locateList(day: DayPlan, itemId: string): { items: ItineraryItem[]; set: (items: ItineraryItem[]) => DayPlan } | null {
  if (day.items.some((i) => i.id === itemId)) return { items: day.items, set: (items) => ({ ...day, items }) };
  if (day.amGuided.some((i) => i.id === itemId)) return { items: day.amGuided, set: (items) => ({ ...day, amGuided: items }) };
  for (const opt of day.pmFreeOptions) {
    if (opt.items.some((i) => i.id === itemId)) {
      return {
        items: opt.items,
        set: (items) => ({ ...day, pmFreeOptions: day.pmFreeOptions.map((o) => (o.id === opt.id ? { ...o, items } : o)) }),
      };
    }
  }
  return null;
}

/** 같은 목록(오전/오후 코스/하루 일정) 안에서 항목 순서를 한 칸 위·아래로 옮긴다. */
export function moveItem(days: DayPlan[], itemId: string, direction: "up" | "down"): DayPlan[] {
  return days.map((day) => {
    const found = locateList(day, itemId);
    if (!found) return day;
    const idx = found.items.findIndex((i) => i.id === itemId);
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= found.items.length) return day;
    const next = [...found.items];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    return found.set(next);
  });
}

/** 항목을 찾아 꺼낸다 (제거한 뒤의 days도 함께 돌려준다). 없으면 null. */
function extractItem(days: DayPlan[], itemId: string): { item: ItineraryItem; without: DayPlan[] } | null {
  let extracted: ItineraryItem | null = null;
  const without = days.map((day) => {
    const found = locateList(day, itemId);
    if (!found) return day;
    const idx = found.items.findIndex((i) => i.id === itemId);
    extracted = found.items[idx];
    return found.set(found.items.filter((i) => i.id !== itemId));
  });
  return extracted ? { item: extracted, without } : null;
}

/** 항목을 다른 날짜·위치로 옮기거나(move) 복사한다(copy). 대상을 못 찾으면 그대로 돌려준다. */
export function relocateItem(days: DayPlan[], itemId: string, targetDay: number, targetSlot: TourSlot, mode: "move" | "copy"): DayPlan[] {
  const found = extractItem(days, itemId);
  if (!found) return days;
  const toInsert = mode === "copy" ? { ...found.item, id: `cp-${crypto.randomUUID().slice(0, 8)}` } : found.item;
  const base = mode === "copy" ? days : found.without;
  return base.map((day) => (day.day === targetDay ? insertItems(day, targetSlot, [toInsert]) : day));
}

/** 새 항목 목록을 하루 전체(linear)로 만들어 맨 뒤에 추가한다. 항목 id는 새로 발급한다. */
export function appendDay(days: DayPlan[], items: ItineraryItem[], theme: string): DayPlan[] {
  const nextDayNo = (days[days.length - 1]?.day ?? 0) + 1;
  const fresh = items.map((item) => ({ ...item, id: `imp-${crypto.randomUUID().slice(0, 8)}` }));
  const day: DayPlan = { day: nextDayNo, theme, kind: "linear", items: fresh, amGuided: [], pmFreeOptions: [] };
  return [...days, day];
}
