import { refitDay } from "@/lib/dayBalance";
import { isCafeMeal, isFixedMove } from "@/lib/engineDay";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import type { DayPlan, ItineraryItem } from "@/types";

/**
 * 동선 방향 — 코스는 구역(걸어서 함께 도는 장소 묶음)을 한 방향으로 돌아야 한다.
 * 한 번 떠난 구역으로 다시 돌아오는 지그재그는 이동 시간만 늘리므로 찾아서 알려 주고, 구역 순서대로 묶어 고친다.
 * 숙소·공항 복귀 이동, 자유시간, 야경·분수쇼 같은 밤 일정은 되돌아와도 괜찮다(복귀 동선).
 * 식사는 위치(구역)를 알면 흐름에 넣는다 — 다른 지역 식당에 갔다가 되돌아오는 것도 지그재그다.
 * 지그재그는 큰 지역(마카오 반도·타이파…) 기준으로 본다(없으면 구역). '시간 검증'(구역 단위 웹 확인)으로 붙은 것을 쓰고, 확인 전이면 판단하지 않는다.
 */

const NIGHT = /야경|야시장|야간|분수쇼|나이트|night/i;
const FIXED_TYPES = new Set(["flight", "transfer", "hotel", "free_time"]);

/** 되돌아와도 되는 항목 (복귀 이동·자유시간·밤 일정) */
function returnOk(i: ItineraryItem): boolean {
  return FIXED_TYPES.has(i.type ?? "sightseeing") || isFixedMove(i) || NIGHT.test(`${i.name} ${i.description}`);
}
/** 묶을 때 제자리에 두는 항목 — 위에 더해 점심·저녁(시간대가 정해진 식사) */
function isAnchor(i: ItineraryItem): boolean {
  return returnOk(i) || (i.type === "meal" && !isCafeMeal(i));
}

const areaOf = (i: ItineraryItem) => (i.timeCheck?.basis === "area" && i.timeCheck.area ? i.timeCheck.area : null);
/** 지그재그를 보는 단위 — 큰 지역, 없으면 구역 */
const regionOf = (i: ItineraryItem) => (i.timeCheck?.basis === "area" ? i.timeCheck.region || i.timeCheck.area || null : null);

export interface Zigzag {
  /** 되돌아온 구역 */
  area: string;
  /** 그 앞에 있던 구역 */
  from: string;
}

/** 떠났던 구역으로 되돌아온 곳들. 구역을 모르는 항목은 판단에서 뺀다 */
export function findZigzag(day: DayPlan, pmChoice: PmChoice): Zigzag[] {
  const out: Zigzag[] = [];
  const left = new Set<string>();
  let cur: string | null = null;
  for (const it of dayItems(day, pmChoice)) {
    if (returnOk(it)) continue;
    const area = regionOf(it);
    if (!area || area === cur) continue;
    if (left.has(area) && cur) out.push({ area, from: cur });
    if (cur) left.add(cur);
    cur = area;
  }
  return out;
}

/**
 * 큰 지역 → 구역이 처음 나온 순서대로 같은 곳 장소를 붙여 놓는다 (구역 안은 원래 순서, 복귀 이동·식사·밤 일정은 제자리).
 * 바꿀 게 없으면 그대로. 다른 지역 식당 때문에 생긴 지그재그는 식사 시간대가 걸려 여기서 고치지 않는다(코스 엔진 점검으로).
 */
export function groupByArea(day: DayPlan): DayPlan {
  if (day.kind !== "linear") return day;
  const items = day.items;
  const slots = items.map((it, i) => (isAnchor(it) ? -1 : i)).filter((i) => i >= 0);
  const movable = slots.map((i) => items[i]);
  const keyOf = (i: ItineraryItem) => areaOf(i) ?? `#${i.id}`;
  const regionKey = (i: ItineraryItem) => regionOf(i) ?? keyOf(i);
  const regions: string[] = [];
  for (const it of movable) if (!regions.includes(regionKey(it))) regions.push(regionKey(it));
  const grouped = regions.flatMap((r) => {
    const inRegion = movable.filter((it) => regionKey(it) === r);
    const areas: string[] = [];
    for (const it of inRegion) if (!areas.includes(keyOf(it))) areas.push(keyOf(it));
    return areas.flatMap((a) => inRegion.filter((it) => keyOf(it) === a));
  });
  if (grouped.every((it, n) => it.id === movable[n].id)) return day;

  // 이동 시간: 같은 구역 안은 원래 구역 안 걷기 시간(없으면 5분), 구역을 떠날 때는 원래 그 구역을 떠날 때 걸린 시간(없으면 20분)
  const walk = new Map<string, number>();
  const leave = new Map<string, number>();
  items.forEach((it, i) => {
    const next = items[i + 1];
    if (isAnchor(it) || !next) return;
    const t = Math.max(0, it.travelMinutesToNext ?? 0);
    if (!isAnchor(next) && keyOf(next) === keyOf(it)) walk.set(keyOf(it), Math.max(walk.get(keyOf(it)) ?? 0, t));
    else leave.set(keyOf(it), Math.max(leave.get(keyOf(it)) ?? 0, t));
  });
  const next = items.slice();
  slots.forEach((slot, n) => (next[slot] = grouped[n]));
  const fixed = next.map((it, i) => {
    if (isAnchor(it)) return it;
    const after = next[i + 1];
    if (!after) return it;
    const same = !isAnchor(after) && keyOf(after) === keyOf(it);
    return { ...it, travelMinutesToNext: same ? (walk.get(keyOf(it)) ?? 5) : (leave.get(keyOf(it)) ?? 20) };
  });
  return refitDay({ ...day, items: fixed });
}

export interface OffRouteMeal {
  mealId: string;
  mealName: string;
  /** 식당이 있는 지역 */
  mealRegion: string;
  /** 식사 무렵 일행이 있는 지역 (앞 장소 지역) */
  hereRegion: string;
  /** 식당을 찾을 기준 장소 (앞뒤로 들르는 그 지역 장소) */
  nearPlaces: string[];
  meal: "lunch" | "dinner";
  cuisine: string;
}

/**
 * 동선에서 벗어난 식당 — 점심·저녁 식당이 앞 장소와 다른 지역에 있고, 식사 뒤에 다시 앞 지역으로 돌아오는 경우
 * (예: 콜로안 → 점심(코타이) → 콜로안). 그 지역 안 식당으로 바꾸면 되돌아오는 이동이 사라진다.
 * 식당 위치(구역)를 모르면 판단하지 않는다.
 */
export function offRouteMeals(day: DayPlan, pmChoice: PmChoice): OffRouteMeal[] {
  const items = dayItems(day, pmChoice);
  const out: OffRouteMeal[] = [];
  items.forEach((it, i) => {
    if (it.type !== "meal" || isCafeMeal(it)) return;
    const mealRegion = regionOf(it);
    if (!mealRegion) return;
    const before = items.slice(0, i).reverse().find((x) => !returnOk(x) && x.type !== "meal" && regionOf(x));
    const after = items.slice(i + 1).find((x) => !returnOk(x) && x.type !== "meal" && regionOf(x));
    const here = before ? regionOf(before) : null;
    if (!here || here === mealRegion || !after || regionOf(after) !== here) return;
    out.push({
      mealId: it.id,
      mealName: it.name,
      mealRegion,
      hereRegion: here,
      nearPlaces: [before!.name, after.name],
      meal: /저녁|석식|디너|dinner/i.test(`${it.name} ${it.description}`) ? "dinner" : "lunch",
      cuisine: it.cuisine ?? (/\(([^)]+)\)/.exec(it.name)?.[1] ?? ""),
    });
  });
  return out;
}
