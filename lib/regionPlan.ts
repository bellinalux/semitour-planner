import { km } from "@/lib/courseEngine/time";
import { blockMinutes, movable, refitDay, roomOf } from "@/lib/dayBalance";
import { isCoord } from "@/lib/coords";
import { dayItems, mapDayItems, type PmChoice } from "@/lib/itinerary";
import type { DayPlan, ItineraryItem } from "@/types";

/**
 * 코스 지도·여러 날 지역 묶기 — 업계 방식(Wanderlog 날짜별 지도, 여행 일정 연구의 "지역으로 먼저 나누고 날 안에서 순서")을 따른다.
 *  1) 장소마다 지역을 정한다: 시간 검증으로 붙은 큰 지역(구역) 이름, 없으면 좌표로 가까운 곳끼리(중심 4km 안) 묶는다.
 *  2) 같은 지역을 여러 날에 나눠 가면(숙소가 있는 동네는 빼고) "반복 이동"으로 보고, 더 드는 이동 시간을 어림한다.
 *  3) 다시 나눈 안: 그 지역 장소를 한 날로 모은다 — 옮긴 뒤 여유가 가장 많이 남는 날로(날마다 고르게). 받는 날이 넘치면(하루 8시간) 옮기지 않는다.
 *     항공·이동·숙소·점심·저녁·밤 일정은 움직이지 않고, 숙박 도시가 다른 날 사이로는 옮기지 않는다.
 * AI를 쓰지 않는다 (좌표는 코스 점검이 찾은 값).
 */

export interface MapPoint {
  id: string;
  day: number;
  /** 그날 지도 번호 (1부터) */
  order: number;
  name: string;
  lat: number;
  lng: number;
  kind: "sight" | "meal" | "hotel";
  region: string | null;
}

/** 좌표 중심이 이 거리 안이면 같은 지역 */
const RADIUS_KM = 4;
const SKIP = new Set(["flight", "transfer"]);
const NIGHT = /야경|야시장|야간|분수쇼|나이트|night/i;

const coordOf = (i: ItineraryItem) => (isCoord(i.lat, i.lng) ? { lat: i.lat!, lng: i.lng! } : null);
const namedRegion = (i: ItineraryItem) => (i.timeCheck?.basis === "area" ? i.timeCheck.region || i.timeCheck.area || null : null);
const centroid = (pts: { lat: number; lng: number }[]) => ({ lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length });

/** 코스 점검 결과의 좌표를 일정 항목에 넣는다 (사람이 고친 좌표는 그대로). 바뀐 게 없으면 같은 배열 */
export function withCoords(days: DayPlan[], places: { id: string; lat?: number; lng?: number }[]): DayPlan[] {
  const found = new Map(places.filter((p) => isCoord(p.lat, p.lng)).map((p) => [p.id, { lat: p.lat!, lng: p.lng! }]));
  if (found.size === 0) return days;
  let changed = false;
  const next = days.map((d) =>
    mapDayItems(d, (it) => {
      const c = found.get(it.id);
      if (!c || it.coordEdited || (it.lat === c.lat && it.lng === c.lng)) return it;
      changed = true;
      return { ...it, lat: c.lat, lng: c.lng };
    }),
  );
  return changed ? next : days;
}

/**
 * 장소마다 지역 이름 — 이름 있는 지역(시간 검증)이 먼저, 없으면 좌표로 가까운 곳끼리 묶어 "첫 장소 주변".
 * 좌표만 있는 곳이 이름 있는 지역 장소와 가까우면(4km) 그 지역으로 본다.
 */
export function regionKeys(days: DayPlan[], pmChoice: PmChoice): Map<string, string> {
  const items = days.flatMap((d) => dayItems(d, pmChoice)).filter((i) => !SKIP.has(i.type ?? "sightseeing"));
  const out = new Map<string, string>();
  const named = items.filter((i) => namedRegion(i)).map((i) => ({ i, c: coordOf(i), r: namedRegion(i)! }));
  for (const n of named) out.set(n.i.id, n.r);
  const rest = items.filter((i) => !out.has(i.id) && coordOf(i));
  const anchors = named.filter((n) => n.c);
  const loose: ItineraryItem[] = [];
  for (const it of rest) {
    const c = coordOf(it)!;
    const near = anchors.map((a) => ({ a, d: km(c, a.c!) })).sort((x, y) => x.d - y.d)[0];
    if (near && near.d <= RADIUS_KM) out.set(it.id, near.a.r);
    else loose.push(it);
  }
  // 가까운 묶음끼리 합친다 (중심 거리 4km 안, 가장 가까운 쌍부터)
  let clusters = loose.map((i) => ({ items: [i], c: coordOf(i)! }));
  for (;;) {
    let best: { a: number; b: number; d: number } | null = null;
    for (let a = 0; a < clusters.length; a++)
      for (let b = a + 1; b < clusters.length; b++) {
        const d = km(clusters[a].c, clusters[b].c);
        if (d <= RADIUS_KM && (!best || d < best.d)) best = { a, b, d };
      }
    if (!best) break;
    const merged = [...clusters[best.a].items, ...clusters[best.b].items];
    clusters = [...clusters.filter((_, k) => k !== best!.a && k !== best!.b), { items: merged, c: centroid(merged.map((i) => coordOf(i)!)) }];
  }
  // 이름은 일정에서 가장 먼저 나오는 관광지로
  const pos = new Map(items.map((i, k) => [i.id, k]));
  for (const cl of clusters) {
    const sorted = [...cl.items].sort((a, b) => pos.get(a.id)! - pos.get(b.id)!);
    const first = sorted.find((i) => i.type !== "meal" && i.type !== "hotel") ?? sorted[0];
    for (const it of cl.items) out.set(it.id, `${first.name} 주변`);
  }
  return out;
}

/** 날짜별 지도 점 (항공·이동 빼고, 좌표 있는 곳만) */
export function mapPoints(days: DayPlan[], pmChoice: PmChoice): MapPoint[][] {
  const keys = regionKeys(days, pmChoice);
  return days.map((d) => {
    let order = 0;
    return dayItems(d, pmChoice)
      .filter((i) => !SKIP.has(i.type ?? "sightseeing") && i.type !== "free_time" && coordOf(i))
      .map((i) => ({
        id: i.id,
        day: d.day,
        order: ++order,
        name: i.name,
        lat: i.lat!,
        lng: i.lng!,
        kind: i.type === "hotel" ? ("hotel" as const) : i.type === "meal" ? ("meal" as const) : ("sight" as const),
        region: keys.get(i.id) ?? null,
      }));
  });
}

/** 하루 이동 거리(km, 직선 × 도로 우회 1.35)와 차량 어림 시간(분) */
export function dayDistance(points: MapPoint[]): { km: number; minutes: number } {
  let total = 0;
  for (let k = 1; k < points.length; k++) total += km(points[k - 1], points[k]) * 1.35;
  // 시내 25km/h, 긴 구간은 50km/h 정도 — 구간마다 따로 어림하지 않고 평균 32km/h
  return { km: Math.round(total * 10) / 10, minutes: Math.round((total / 32) * 60) };
}

/** 하루 안에서 떠났던 지역으로 되돌아온 구간 (지도에 빨간 선) — 숙소 복귀·밤 일정은 괜찮다 */
export function backtrackLegs(points: MapPoint[]): { from: MapPoint; to: MapPoint }[] {
  const out: { from: MapPoint; to: MapPoint }[] = [];
  const left = new Set<string>();
  let cur: string | null = null;
  for (let k = 0; k < points.length; k++) {
    const p = points[k];
    if (p.kind === "hotel" || NIGHT.test(p.name)) continue;
    if (!p.region || p.region === cur) continue;
    if (cur && left.has(p.region) && k > 0) out.push({ from: points[k - 1], to: p });
    if (cur) left.add(cur);
    cur = p.region;
  }
  return out;
}

export interface RegionRepeat {
  region: string;
  /** 이 지역 장소가 있는 날 */
  days: number[];
  /** 날별 장소 이름 */
  byDay: { day: number; names: string[] }[];
  /** 한 날로 모으면 줄어드는 이동(분, 좌표로 어림). 좌표가 없으면 null */
  extraMinutes: number | null;
}

/** 숙소가 있는 동네 — 숙소 항목·밤 일정의 지역 (매일 나가고 들어오는 곳이라 반복으로 보지 않는다) */
function homeRegions(days: DayPlan[], pmChoice: PmChoice, keys: Map<string, string>): Set<string> {
  const out = new Set<string>();
  for (const d of days)
    for (const i of dayItems(d, pmChoice)) if ((i.type === "hotel" || NIGHT.test(`${i.name} ${i.description}`)) && keys.get(i.id)) out.add(keys.get(i.id)!);
  return out;
}

/** 같은 지역을 여러 날에 나눠 가는 곳 (더 드는 이동이 큰 것부터) */
export function regionRepeats(days: DayPlan[], pmChoice: PmChoice): RegionRepeat[] {
  const keys = regionKeys(days, pmChoice);
  const home = homeRegions(days, pmChoice, keys);
  const groups = new Map<string, Map<number, ItineraryItem[]>>();
  for (const d of days) {
    if (d.kind !== "linear") continue;
    for (const i of d.items) {
      const r = keys.get(i.id);
      if (!r || home.has(r) || !movable(i) || i.type === "meal") continue;
      const g = groups.get(r) ?? new Map<number, ItineraryItem[]>();
      g.set(d.day, [...(g.get(d.day) ?? []), i]);
      groups.set(r, g);
    }
  }
  const out: RegionRepeat[] = [];
  for (const [region, g] of groups) {
    if (g.size < 2) continue;
    const dayNos = [...g.keys()].sort((a, b) => a - b);
    // 가장 많이 도는 날 말고 다른 날마다: 그날 나머지 장소 중심 ↔ 이 지역 중심 왕복
    const main = dayNos.reduce((a, b) => (blockMinutes(g.get(b)!) > blockMinutes(g.get(a)!) ? b : a));
    let extra = 0;
    let known = true;
    for (const n of dayNos) {
      if (n === main) continue;
      const here = g.get(n)!.map(coordOf).filter((c): c is { lat: number; lng: number } => c !== null);
      const day = days.find((d) => d.day === n)!;
      const others = day.items.filter((i) => !g.get(n)!.includes(i) && !SKIP.has(i.type ?? "sightseeing")).map(coordOf).filter((c): c is { lat: number; lng: number } => c !== null);
      if (here.length === 0 || others.length === 0) {
        known = false;
        continue;
      }
      extra += Math.round(((km(centroid(here), centroid(others)) * 1.35 * 2) / 32) * 60);
    }
    out.push({ region, days: dayNos, byDay: dayNos.map((n) => ({ day: n, names: g.get(n)!.map((i) => i.name) })), extraMinutes: known ? extra : null });
  }
  return out.sort((a, b) => (b.extraMinutes ?? 0) - (a.extraMinutes ?? 0));
}

export interface RegionMove {
  region: string;
  fromDay: number;
  toDay: number;
  names: string[];
  minutes: number;
}

export interface RegionPlan {
  days: DayPlan[];
  moves: RegionMove[];
  /** 옮기지 못한 이유 */
  skipped: string[];
  before: { repeats: number; km: number | null };
  after: { repeats: number; km: number | null };
}

const cityOf = (d: DayPlan) => (d.overnightCity ?? "").trim();

function metrics(days: DayPlan[], pmChoice: PmChoice): RegionPlan["before"] {
  const reps = regionRepeats(days, pmChoice);
  const pts = mapPoints(days, pmChoice);
  const any = pts.some((p) => p.length >= 2);
  return { repeats: reps.reduce((s, r) => s + r.days.length - 1, 0), km: any ? Math.round(pts.reduce((s, p) => s + dayDistance(p).km, 0) * 10) / 10 : null };
}

/**
 * 다시 나눈 안 — 반복 지역마다 그 지역 장소를 한 날로 모은다 (옮긴 뒤 여유가 가장 많이 남는 날, 같으면 그 지역을 오래 도는 날).
 * 받는 날 여유(하루 8시간에서 남은 시간, 자유시간 포함)가 모자라면 그대로 두고 이유를 남긴다.
 * 옮긴 장소는 받는 날의 같은 지역 장소 바로 뒤에 넣고, 두 날 모두 식사 시간을 다시 맞춘다.
 */
export function planRegions(days: DayPlan[], pmChoice: PmChoice): RegionPlan {
  let work = days;
  const moves: RegionMove[] = [];
  const skipped: string[] = [];
  const keys = regionKeys(days, pmChoice);
  const hasFlight = (d: DayPlan) => d.items.some((i) => i.type === "flight");
  for (const rep of regionRepeats(days, pmChoice)) {
    const inRegion = (d: DayPlan) => d.items.filter((i) => keys.get(i.id) === rep.region && movable(i) && i.type !== "meal");
    const cur = () => rep.days.map((n) => work.find((d) => d.day === n)!).filter((d) => d.kind === "linear");
    // 받는 날: 옮긴 뒤에도 여유가 가장 많이 남는 날 (날마다 부담이 고르게) — 같으면 그 지역을 오래 도는 날.
    // 마지막 날 항공일은 받지 않는다
    const options = cur()
      .filter((d) => !(d.day === days[days.length - 1].day && hasFlight(d)))
      .map((target) => {
        const sources = cur().filter((d) => d.day !== target.day);
        const need = sources.reduce((s, d) => s + blockMinutes(inRegion(d)), 0);
        return { target, sources, left: roomOf(work.find((d) => d.day === target.day)!, pmChoice) - need, own: blockMinutes(inRegion(target)) };
      })
      .filter((o) => o.left >= 0 && o.sources.every((s) => cityOf(s) === cityOf(o.target)))
      .sort((a, b) => b.left - a.left || b.own - a.own || a.target.day - b.target.day);
    const pick = options[0];
    if (pick) {
      for (const src of pick.sources) {
        const moving = inRegion(src);
        if (moving.length === 0) continue;
        work = moveInto(work, src.day, pick.target.day, moving, (i) => keys.get(i.id) === rep.region);
        moves.push({ region: rep.region, fromDay: src.day, toDay: pick.target.day, names: moving.map((i) => i.name), minutes: blockMinutes(moving) });
      }
    }
    const done = !!pick;
    if (!done) {
      const diffCity = cur().some((d) => cityOf(d) !== cityOf(cur()[0]));
      skipped.push(`${rep.region} (DAY ${rep.days.join("·")}) — ${diffCity ? "숙박 도시가 달라 그대로 둡니다" : "모을 날의 시간이 모자라 그대로 둡니다 (하루 8시간 기준)"}`);
    }
  }
  return { days: work, moves, skipped, before: metrics(days, pmChoice), after: metrics(work, pmChoice) };
}

/** moving을 src 날에서 빼서 target 날의 같은 지역 장소 바로 뒤에 넣는다 */
function moveInto(days: DayPlan[], srcDay: number, targetDay: number, moving: ItineraryItem[], sameRegion: (i: ItineraryItem) => boolean): DayPlan[] {
  const ids = new Set(moving.map((i) => i.id));
  // 옮기는 묶음의 마지막 이동은 받는 날 앞뒤가 달라지므로 짧게(10분)
  const block = moving.map((i, k) => (k === moving.length - 1 ? { ...i, travelMinutesToNext: 10 } : { ...i, travelMinutesToNext: Math.min(i.travelMinutesToNext ?? 10, 20) }));
  return days.map((d) => {
    if (d.day === srcDay) return refitDay({ ...d, items: d.items.filter((i) => !ids.has(i.id)) });
    if (d.day !== targetDay) return d;
    const items = d.items.slice();
    let at = -1;
    items.forEach((i, k) => {
      if (sameRegion(i)) at = k;
    });
    const hotel = items.findIndex((i) => i.type === "hotel");
    const pos = at >= 0 ? at + 1 : hotel >= 0 ? hotel : items.length;
    if (at >= 0) items[at] = { ...items[at], travelMinutesToNext: Math.min(items[at].travelMinutesToNext ?? 10, 15) };
    items.splice(pos, 0, ...block);
    return refitDay({ ...d, items });
  });
}
