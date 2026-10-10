import { refitDay } from "@/lib/dayBalance";
import { dayTourStart, formatClock, parseClock, walkTimeline } from "@/lib/dayLoad";
import { isBreakfastItem } from "@/lib/documents";
import { dayStructureIssues, fixDayStructure } from "@/lib/dayStructure";
import { isCafeMeal } from "@/lib/engineDay";
import { stripMealPads } from "@/lib/mealTiming";
import { estimateTravel, km } from "@/lib/courseEngine/time";
import { formatDuration } from "@/lib/format";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import type { DayPlan, ItineraryItem } from "@/types";

/**
 * 코스 시간 다듬기 — 업체 코스를 읽은 직후(자동)와 일정 카드의 [식사 시간 맞추기]에서 쓴다.
 *  ① 도보 구역: 걸어서 잇는 곳이 5곳 넘게 이어지는데 합계가 지나치게 길면(장소마다 20~30분) 구역 전체 시간으로 줄인다
 *  ② 같은 식사 합치기: "저녁 식사 (포르투갈식)" 같은 일반 줄과 같은 날의 그 음식 식당(알베르게1601)을 한 줄로
 *  ③ 늦은 식사 당기기: 점심이 14:00, 저녁이 20:30을 넘으면 그 시간대가 처음 되는 자리로 옮긴다 (밤 일정은 그 뒤 그대로)
 *  ④ 점검: 늦은 식사·저녁 두 번·저녁 전 밤 일정·원문 시각을 못 지킨 곳
 * 업계 일정표는 석식 18:00~19:30 → 야경·공연 → 호텔 순이다.
 */

const LUNCH_FROM = 11 * 60 + 30;
const DINNER_FROM = 18 * 60;
const EARLY_OK = 30;
export const LUNCH_LATE = 14 * 60;
export const DINNER_LATE = 20 * 60 + 30;
const CAFE_NAME = /카페|커피|cafe|coffee|디저트|베이커리|에그타르트|타르트|빙수|티룸/i;
const NIGHT = /야경|야시장|야간|분수쇼|나이트|night|공연|쇼\b/i;

export type MealSlot = "lunch" | "dinner";

export function mealSlotOf(item: ItineraryItem): MealSlot | null {
  if (item.type !== "meal" || isBreakfastItem(item) || isCafeMeal(item)) return null;
  const text = `${item.name} ${item.description ?? ""}`;
  if (/석식|저녁|디너|dinner/i.test(text)) return "dinner";
  if (/중식|점심|런치|lunch/i.test(text)) return "lunch";
  return null;
}

/** "저녁 식사 (포르투갈식)"처럼 식당 이름 없이 식사만 적힌 줄 */
export function isGenericMeal(item: ItineraryItem): boolean {
  return item.type === "meal" && /^\s*(점심|저녁|중식|석식|런치|디너)\s*(식사)?\s*(\(|$|·|-)/.test(item.name);
}

/** 음식 종류 낱말 ("저녁 식사 (포르투갈식)" → "포르투갈") */
export function cuisineWord(item: ItineraryItem): string {
  const inName = /\(([^)]+?)\s*식?\s*\)/.exec(item.name)?.[1] ?? "";
  const raw = (inName || item.cuisine || "").replace(/(요리|식당|음식|식)$/, "").trim();
  return /^(현지|한|일반|자유|호텔)$/.test(raw) ? "" : raw;
}

const clone = (d: DayPlan, items: ItineraryItem[]): DayPlan => refitDay({ ...d, items });

const WALKABLE = new Set(["sightseeing", "shopping"]);
/** 도보로 둘러보는 곳 — 관광·쇼핑 거리, 그리고 도보 코스 중간에 이름으로 적힌 식당(점심·저녁 줄이 아닌 곳) */
const walkable = (x: ItineraryItem) => WALKABLE.has(x.type ?? "sightseeing") || (x.type === "meal" && !isGenericMeal(x) && !mealSlotOf(x) && !isBreakfastItem(x));
/** 도보 구역 — 관광·쇼핑 거리가 걸어서(10분 이하) 이어지는 묶음. 마지막 곳(다음으로 차 타고 가는 곳)까지 포함 */
export function walkRuns(items: ItineraryItem[]): [number, number][] {
  const out: [number, number][] = [];
  let i = 0;
  while (i < items.length) {
    if (!walkable(items[i])) {
      i += 1;
      continue;
    }
    let j = i;
    while (j + 1 < items.length && walkable(items[j + 1]) && (items[j].travelMinutesToNext ?? 0) <= 10) j += 1;
    out.push([i, j + 1]);
    i = j + 1;
  }
  return out;
}

/** ① 도보 구역 압축 (업체 코스를 읽은 직후에만) — 5곳 넘게 걸어서 잇는 구역이 너무 길면(곳당 20~30분) 구역 전체 2시간 반쯤으로 */
export function compressWalkRuns(day: DayPlan): { day: DayPlan; note: string | null } {
  if (day.kind !== "linear") return { day, note: null };
  const items = day.items.slice();
  const notes: string[] = [];
  for (const [i, j] of walkRuns(items)) {
    const n = j - i;
    if (n < 5 || items.slice(i, j).some((x) => x.stayEdited || x.timeCheck)) continue;
    const run = items.slice(i, j);
    const stay = run.reduce((s, x) => s + x.stayMinutes, 0);
    // 구역 안 이동만 (마지막 곳에서 다음 구역으로 가는 이동은 빼고) — 붙어 있는 곳끼리 걸어서 3~5분
    const walkBefore = run.slice(0, -1).reduce((s, x) => s + (x.travelMinutesToNext ?? 0), 0);
    const walk = run.slice(0, -1).reduce((s, x) => s + Math.min(5, x.travelMinutesToNext ?? 0), 0);
    const cap = Math.max(150, n * 20);
    if (stay + walkBefore <= cap || stay === 0) continue;
    const ratio = Math.min(1, Math.max(0, cap - walk) / stay);
    // 일정표 시각은 10분 단위라, 걸어서 옮기는 몇 분은 체류에 합쳐 10분 단위로 (따로 두면 곳마다 10분씩 늘어난다)
    for (let k = i; k < j; k++) {
      const own = items[k].stayMinutes * ratio + (k < j - 1 ? Math.min(5, items[k].travelMinutesToNext ?? 0) : 0);
      items[k] = { ...items[k], stayMinutes: Math.max(10, Math.round((own - 0.1) / 10) * 10), ...(k < j - 1 ? { travelMinutesToNext: 0 } : {}) };
    }
    const after = items.slice(i, j).reduce((s, x) => s + x.stayMinutes, 0);
    notes.push(`도보 구역 ${n}곳(${run[0].name}~${run[n - 1].name}) ${formatDuration(stay + walkBefore)} → ${formatDuration(after)}`);
  }
  return notes.length ? { day: clone(day, items), note: notes.join(", ") } : { day, note: null };
}

/** ② 같은 식사 합치기 — 일반 식사 줄에 같은 음식 식당 이름을 넣고 식당 줄은 뺀다 */
export function mergeMeals(day: DayPlan): { day: DayPlan; note: string | null } {
  if (day.kind !== "linear") return { day, note: null };
  let items = day.items.slice();
  const notes: string[] = [];
  for (const g of items.filter(isGenericMeal)) {
    const word = cuisineWord(g);
    if (!word) continue;
    // 체류가 짧아 카페로 보이는 식당도 후보 (이름이 카페·디저트인 곳만 뺀다)
    const r = items.find((x) => x !== g && x.type === "meal" && !isGenericMeal(x) && !isBreakfastItem(x) && !CAFE_NAME.test(x.name) && `${x.name} ${x.description} ${x.cuisine ?? ""}`.includes(word));
    if (!r) continue;
    const merged: ItineraryItem = { ...g, name: `${g.name.trim()} · ${r.name.trim()}`, description: r.description || g.description, mealCost: Math.max(g.mealCost, r.mealCost), ...(r.lat !== undefined ? { lat: r.lat, lng: r.lng } : {}) };
    // 식당이 도보 구역 안에 있던 곳이면, 그 구역이 끝나는 자리가 식사 시간대에 맞을 때 거기서 먹는다 (되돌아가지 않게)
    const slot = mealSlotOf(g);
    const run = walkRuns(items.map((x) => (x === r ? { ...x, type: "sightseeing" as const } : x))).find(([a2, b2]) => items.indexOf(r) >= a2 && items.indexOf(r) < b2);
    let placed: ItineraryItem[] | null = null;
    if (slot && run) {
      const runItems = items.slice(run[0], run[1]).filter((x) => x !== r);
      const lastOfRun = runItems[runItems.length - 1];
      const base = items.filter((x) => x !== r && x !== g);
      const at = base.indexOf(lastOfRun) + 1;
      const cand = [...base.slice(0, at), merged, ...base.slice(at)];
      const st = startOf(day, cand, merged.id);
      const from = slot === "lunch" ? LUNCH_FROM : DINNER_FROM;
      const late = slot === "lunch" ? LUNCH_LATE : DINNER_LATE;
      if (st !== null && st >= from - EARLY_OK && st <= late) placed = cand;
    }
    items = placed ?? items.filter((x) => x !== r).map((x) => (x === g ? merged : x));
    notes.push(`${r.name}을(를) ${g.name.replace(/\s*\(.*$/, "")}으로 합침${placed ? " (식당이 있는 구역이 끝나는 자리로)" : ""}`);
  }
  return notes.length ? { day: clone(day, items), note: notes.join(", ") } : { day, note: null };
}

function startOf(day: DayPlan, items: ItineraryItem[], id: string): number | null {
  const s = walkTimeline(items, dayTourStart({ ...day, items })).find((x) => x.item.id === id);
  return s ? s.start : null;
}

/** 식사 뒤에 남는 관광 시간이 이보다 길면 당기지 않는다 (문제를 밤으로 옮길 뿐이라 — 날을 나누라고 알린다) */
const MAX_AFTER_MEAL = 120;

/**
 * ③ 늦은 식사 당기기 — 그 식사 시간대가 처음 되는 "구역 경계"(도보 구역 한가운데는 아님)로 옮긴다.
 * 항공·앞 식사·원문 시각 항목 뒤로만, 그리고 식사 뒤에 남는 관광(밤 일정 빼고)이 2시간 이하일 때만.
 */
export function pullMeals(day: DayPlan): { day: DayPlan; note: string | null } {
  if (day.kind !== "linear") return { day, note: null };
  let items = day.items.slice();
  const notes: string[] = [];
  for (const slot of ["lunch", "dinner"] as MealSlot[]) {
    const meal = items.find((x) => mealSlotOf(x) === slot);
    if (!meal) continue;
    const from = startOf(day, items, meal.id);
    const late = slot === "lunch" ? LUNCH_LATE : DINNER_LATE;
    const windowStart = slot === "lunch" ? LUNCH_FROM : DINNER_FROM;
    if (from === null || from <= late) continue;
    const idx = items.indexOf(meal);
    let floor = 0;
    items.forEach((x, k) => {
      if (k < idx && (x.type === "flight" || x.fixedTime || (x !== meal && mealSlotOf(x)))) floor = k + 1;
    });
    const rest = items.filter((x) => x !== meal);
    // 도보 구역 한가운데에는 넣지 않는다
    const inside = new Set<number>();
    for (const [a, b] of walkRuns(rest)) for (let k = a + 1; k < b; k++) inside.add(k);
    let best: ItineraryItem[] | null = null;
    let at = 0;
    for (let k = floor; k < idx; k++) {
      if (inside.has(k)) continue;
      const cand = [...rest.slice(0, k), meal, ...rest.slice(k)];
      const s = startOf(day, cand, meal.id);
      if (s === null || s < windowStart - EARLY_OK || s > late) continue;
      // 식사 뒤로 밀리는 항목 = 원래 식사 앞에 있던 rest[k..idx-1]
      const tail = rest.slice(k, idx).filter((x) => x.type !== "meal" && x.type !== "hotel" && !NIGHT.test(x.name));
      const tailMinutes = tail.reduce((sum, x) => sum + x.stayMinutes + (x.travelMinutesToNext ?? 0), 0);
      if (tailMinutes > MAX_AFTER_MEAL) continue;
      best = cand;
      at = s;
      break;
    }
    if (!best) continue;
    items = best;
    notes.push(`${slot === "lunch" ? "점심" : "저녁"} ${formatClock(from)} → ${formatClock(at)}`);
  }
  return notes.length ? { day: clone(day, items), note: notes.join(", ") } : { day, note: null };
}

/** 식사를 맞출 목표 시각 — 업계 일정표의 점심 12:00, 저녁 18:30 */
const LUNCH_TARGET = 12 * 60;
const DINNER_TARGET = 18 * 60 + 30;

/**
 * 식사 자리 맞추기 (재정렬용) — 점심은 12:00, 저녁은 18:30에 가장 가까운 "구역 경계"로 옮긴다 (이르면 뒤로, 늦으면 앞으로).
 * 항공·원문 시각 항목 앞으로는 옮기지 않고, 점심은 저녁보다 앞, 밤 일정(야경·쇼)은 저녁 뒤에 둔다.
 * 지금 자리가 이미 목표에서 30분 안이면 그대로.
 */
export function slotMeals(day: DayPlan): { day: DayPlan; note: string | null } {
  if (day.kind !== "linear") return { day, note: null };
  // 식사를 기다리려고 넣었던 자유시간은 빼고 계산한다 (옮긴 뒤 다시 맞춘다)
  let items = stripMealPads(day.items);
  const notes: string[] = [];
  for (const slot of ["lunch", "dinner"] as MealSlot[]) {
    const meal = items.find((x) => mealSlotOf(x) === slot);
    if (!meal) continue;
    const target = slot === "lunch" ? LUNCH_TARGET : DINNER_TARGET;
    const from = startOf(day, items, meal.id);
    if (from === null || Math.abs(from - target) <= 30) continue;
    const rest = items.filter((x) => x !== meal);
    // 옮길 수 있는 범위: 항공·원문 시각 항목 뒤, 점심은 저녁 앞 / 저녁은 점심 뒤, 숙소 줄 앞
    let lo = 0;
    let hi = rest.length;
    rest.forEach((x, k) => {
      if (x.type === "flight" || x.fixedTime) lo = Math.max(lo, k + 1);
      if (slot === "dinner" && mealSlotOf(x) === "lunch") lo = Math.max(lo, k + 1);
      if (slot === "lunch" && mealSlotOf(x) === "dinner") hi = Math.min(hi, k);
      if (x.type === "hotel" && k > 0) hi = Math.min(hi, k);
    });
    const inside = new Set<number>();
    for (const [a, b] of walkRuns(rest)) for (let k = a + 1; k < b; k++) inside.add(k);
    let best: { cand: ItineraryItem[]; at: number; cost: number } | null = null;
    for (let k = lo; k <= hi; k++) {
      if (inside.has(k)) continue;
      // 밤 일정이 저녁보다 앞에 오면 안 된다
      if (slot === "dinner" && rest.slice(0, k).some((x) => NIGHT.test(x.name) && x.type !== "meal")) continue;
      const cand = [...rest.slice(0, k), meal, ...rest.slice(k)];
      const s = startOf(day, cand, meal.id);
      if (s === null) continue;
      const windowStart = slot === "lunch" ? LUNCH_FROM : DINNER_FROM;
      const late = slot === "lunch" ? LUNCH_LATE : DINNER_LATE;
      if (s < windowStart - EARLY_OK || s > late) continue;
      const cost = Math.abs(s - target) + Math.abs(k - items.indexOf(meal)) * 2;
      if (!best || cost < best.cost) best = { cand, at: s, cost };
    }
    if (!best || Math.abs(best.at - target) >= Math.abs(from - target)) continue;
    items = best.cand;
    notes.push(`${slot === "lunch" ? "점심" : "저녁"} ${formatClock(from)} → ${formatClock(best.at)}`);
  }
  return notes.length ? { day: clone(day, items), note: notes.join(", ") } : { day, note: null };
}

/**
 * 가까운 순서 (엔진을 못 쓸 때) — 식사·항공·숙소·원문 시각 항목은 제자리에 두고, 그 사이 관광을 좌표로 가까운 곳부터 잇는다.
 * 좌표가 없는 곳이 끼어 있는 구간은 그대로. 이동 시간은 직선거리로 다시 어림한다.
 */
export function nearestOrder(items: ItineraryItem[]): ItineraryItem[] {
  const fixed = (x: ItineraryItem) => !WALKABLE.has(x.type ?? "sightseeing") || !!x.fixedTime || NIGHT.test(x.name);
  const out: ItineraryItem[] = [];
  let k = 0;
  while (k < items.length) {
    if (fixed(items[k])) {
      out.push(items[k]);
      k += 1;
      continue;
    }
    let j = k;
    while (j < items.length && !fixed(items[j])) j += 1;
    const seg = items.slice(k, j);
    if (seg.length >= 3 && seg.every((x) => typeof x.lat === "number" && typeof x.lng === "number")) {
      const prev = out[out.length - 1];
      let cur = prev && typeof prev.lat === "number" ? { lat: prev.lat!, lng: prev.lng! } : { lat: seg[0].lat!, lng: seg[0].lng! };
      const left = seg.slice();
      const ordered: ItineraryItem[] = [];
      while (left.length) {
        left.sort((a, b) => kmBetween(cur, a) - kmBetween(cur, b));
        const nx = left.shift()!;
        ordered.push(nx);
        cur = { lat: nx.lat!, lng: nx.lng! };
      }
      ordered.forEach((x, n) => {
        const next = ordered[n + 1] ?? items[j];
        const minutes = next && typeof next.lat === "number" ? Math.max(5, Math.round(estimateTravel(x, next, kmBetween(x, next) < 1.2 ? "walk" : "car") / 5) * 5) : x.travelMinutesToNext;
        out.push({ ...x, travelMinutesToNext: minutes });
      });
    } else out.push(...seg);
    k = j;
  }
  return out;
}

const kmBetween = (a: { lat?: number; lng?: number }, b: { lat?: number; lng?: number }) => km({ lat: a.lat ?? 0, lng: a.lng ?? 0 }, { lat: b.lat ?? 0, lng: b.lng ?? 0 });

export interface FitChange {
  day: number;
  note: string;
}

/** ⓪ 구성 정리 — 호텔 조식 빼기·이어진 자유시간 합치기·오전 자유 뒤 미팅 (lib/dayStructure) */
function structure(day: DayPlan): { day: DayPlan; note: string | null } {
  const issues = dayStructureIssues(day);
  if (issues.length === 0) return { day, note: null };
  return { day: fixDayStructure(day), note: issues.map((t) => t.split(" — ")[0]).join(" · ") + " 정리" };
}

/**
 * 업체 코스를 읽은 직후 — 구성 정리 → 도보 구역 압축(업체 코스만) → 같은 식사 합치기 → 늦은 식사 당기기.
 * slot이면(코스 재정렬) 늦은 식사 당기기 대신 식사 자리 맞추기(이르면 뒤로·늦으면 앞으로)
 */
export function fitCourse(days: DayPlan[], o: { walk: boolean; slot?: boolean }): { days: DayPlan[]; changes: FitChange[] } {
  const changes: FitChange[] = [];
  const next = days.map((d) => {
    let cur = d;
    const notes: string[] = [];
    for (const step of [structure, ...(o.walk ? [compressWalkRuns] : []), mergeMeals, o.slot ? slotMeals : pullMeals]) {
      const r = step(cur);
      cur = r.day;
      if (r.note) notes.push(r.note);
    }
    if (notes.length) changes.push({ day: d.day, note: notes.join(" · ") });
    return cur;
  });
  return { days: next, changes };
}

/** ④ 식사·시각 점검 (일정 카드 경고) */
export function dayMealIssues(day: DayPlan, pmChoice: PmChoice): string[] {
  const items = dayItems(day, pmChoice);
  const tl = walkTimeline(items, dayTourStart(day));
  const out: string[] = [];
  const at = (it: ItineraryItem) => tl.find((s) => s.item.id === it.id)?.start ?? null;
  const dinners = items.filter((x) => mealSlotOf(x) === "dinner");
  for (const m of items.filter((x) => mealSlotOf(x))) {
    const s = at(m);
    const slot = mealSlotOf(m)!;
    if (s !== null && s > (slot === "lunch" ? LUNCH_LATE : DINNER_LATE)) out.push(`${slot === "lunch" ? "점심" : "저녁"}이 ${formatClock(s)} 시작 — 너무 늦음 (업계 기준 ${slot === "lunch" ? "11:30~13:30" : "18:00~19:30"})`);
  }
  if (dinners.length >= 2) out.push(`저녁 식사가 ${dinners.length}번 (${dinners.map((d) => d.name).join(", ")})`);
  const generic = items.find((x) => isGenericMeal(x) && cuisineWord(x));
  if (generic) {
    const word = cuisineWord(generic);
    const dup = items.find((x) => x !== generic && x.type !== "meal" && `${x.name} ${x.description}`.includes(word));
    if (dup) out.push(`"${generic.name}"과 ${word} 식당으로 보이는 "${dup.name}"이 따로 있음 — 같은 곳이면 합치세요`);
  }
  const dinner = dinners[0];
  if (dinner) {
    const di = items.indexOf(dinner);
    const nightBefore = items.slice(0, di).filter((x) => NIGHT.test(x.name) && x.type !== "meal");
    if (nightBefore.length) out.push(`저녁 전에 밤 일정(${nightBefore.map((x) => x.name).join(", ")})이 있음`);
  }
  for (const it of items) {
    const fixed = parseClock(it.fixedTime ?? "");
    const s = at(it);
    if (fixed !== null && s !== null && s - fixed >= 30) out.push(`${it.name}: 원문 시각 ${it.fixedTime}인데 ${formatClock(s)}에 시작 (${formatDuration(s - fixed)} 늦음)`);
  }
  return out;
}
