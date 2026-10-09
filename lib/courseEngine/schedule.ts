/**
 * 일정 자동 배치 — 영업시간·마지막 입장·예약 입장·점심 시간대·일몰·하루 끝 시각을 지키면서
 * 이동 시간이 가장 적은 순서와 시각을 찾는다.
 *  - 장소 8곳 이하: 모든 순서를 확인(가지치기)  /  그 이상: 끼워 넣기 + 두 곳 맞바꾸기로 다듬기
 *  - 다 못 넣으면 '있으면 좋음(3)' → '가능하면(2)' 순으로 빼고, 뺀 이유를 알려 준다(꼭(1)은 빼지 않는다)
 */
import { dayKey, fmt, hm, parseRange } from "./time";
import type { EngineOptions, EnginePlace, ScheduleResult, TimelineStop } from "./types";

type Matrix = number[][];
const HARD = 10_000;

interface Sim { cost: number; hard: number; stops: TimelineStop[]; travel: number; wait: number; end: number; violations: string[]; zigzag: string[]; zigzagIds: string[]; homeFirst: boolean }

/** 떠났던 구역으로 되돌아올 때 더하는 벌점(분) — 이동이 조금 늘더라도 구역을 한 방향으로 돌게 한다 */
const ZIGZAG_COST = 120;
/**
 * 원래 코스(업체·고객이 짠 가는 순서)를 거스르는 벌점(분). places 배열 순서가 원래 순서다.
 *  - 같은 구역 안에서 원래 순서를 뒤집으면 (걷는 길 순서) 15분
 *  - 구역을 원래보다 앞당겨 가면 30분 — 영업시간 같은 문제를 풀거나 이동이 크게 줄 때만 바뀐다
 */
const AGAINST_WALK = 15;
const AGAINST_AREA = 30;
/** 숙소 쪽 지역에서 먼저 돌다가 먼 지역으로 떠나는 벌점(분) — 업계 관행은 먼 곳 먼저, 숙소 쪽은 하루 끝 */
const AWAY_FROM_HOME = 20;
/** 되돌아와도 되는 곳 — 숙소·공항 등 복귀 이동, 자유시간, 밤 일정(숙소 쪽으로 돌아가며 하는 야경 등) */
const returnOk = (p: EnginePlace) => p.kind === "end" || p.kind === "transfer" || p.kind === "free" || p.best === "night";
/**
 * 지그재그를 보는 단위 — 큰 지역(예: 마카오 반도)이 있으면 지역, 없으면 구역. 구역을 모르는 관광지는 그 장소 하나.
 * 식사는 위치(구역)를 알 때만 흐름에 넣는다 — 다른 지역 식당에 갔다가 되돌아오는 것도 지그재그다(같은 지역 식당은 괜찮다).
 */
const flowKey = (p: EnginePlace): string | null =>
  p.region || p.area || (p.kind === "sight" || !p.kind ? `#${p.id}` : null);

/** 정해진 순서(인덱스)로 하루를 흘려 보고 비용을 계산한다 */
export function simulate(order: number[], places: EnginePlace[], M: Matrix, o: EngineOptions): Sim {
  const day = dayKey(o.weekday);
  const start0 = hm(o.start) ?? 540;
  const maxEnd = hm(o.maxEnd) ?? null;
  const lunch = o.lunch ? [hm(o.lunch.from) ?? 690, hm(o.lunch.to) ?? 840] : null;
  const dinner = o.dinner ? [hm(o.dinner.from) ?? 1080, hm(o.dinner.to) ?? 1230] : null;
  const exact = new Set(o.exactLegs ?? []);
  const sunset = hm(o.sunset);
  const buf = o.bufferMin ?? 5;
  let t = start0, cost = 0, hard = 0, travel = 0, wait = 0;
  const stops: TimelineStop[] = [], violations: string[] = [], zigzag: string[] = [], zigzagIds: string[] = [];
  // 구역 흐름: 지금 구역과 이미 떠난 구역들 (구역을 모르는 관광지는 그 장소 하나를 구역으로 본다, 구역 없는 식사는 흐름에 끼지 않는다)
  let curArea: string | null = null;
  const leftAreas = new Set<string>();
  // 원래 순서: 구역이 처음 나온 자리, 구역마다 마지막으로 들른 장소의 원래 자리
  const firstOfArea = new Map<string, number>();
  places.forEach((q, i) => { const k = q.region || q.area; if (k && !firstOfArea.has(k)) firstOfArea.set(k, i); });
  const lastInArea = new Map<string, number>();
  let homeFirst = false;
  order.forEach((pi, k) => {
    const p = places[pi], issues: string[] = [];
    const tr = k === 0 ? 0 : M[order[k - 1]][pi];
    // 앱 일정표에서 확인된 구간은 그 시간 그대로 (여유를 따로 더하면 일정표보다 길어진다)
    const known = k > 0 && exact.has(`${places[order[k - 1]].id}>${p.id}`);
    const arrive = t + tr + (k > 0 && tr > 0 && !known ? buf : 0);
    travel += tr;
    let startAt = arrive;
    // 예약 입장
    const fixed = hm(p.fixedTime);
    if (fixed != null) {
      if (arrive > fixed + 10) { issues.push(`예약 입장 ${fmt(fixed)}에 늦음(도착 ${fmt(arrive)})`); hard++; }
      else startAt = Math.max(arrive, fixed);
    }
    // 영업시간 (요일을 알 때)
    const ranges = day && p.open ? parseRange(p.open[day]) : null;
    if (ranges) {
      if (!ranges.length) { issues.push("이 요일 휴무"); hard++; }
      else {
        const fit = ranges.find(([a, b]) => Math.max(startAt, a) + p.stayMin <= b);   // 문 열 때까지 기다려서라도 머무는 시간이 들어가는 구간
        if (!fit) { issues.push(`영업시간(${ranges.map(([a, b]) => fmt(a) + "-" + fmt(b)).join(", ")}) 밖`); hard++; }
        else if (startAt < fit[0]) startAt = fit[0];   // 문 열 때까지 기다림
      }
    }
    const last = hm(p.lastEntry);
    if (last != null && startAt > last) { issues.push(`마지막 입장 ${fmt(last)} 지남`); hard++; }
    // 식사: 점심은 점심 시간대, 저녁은 저녁 시간대 안에서 시작 (카페·간식은 시간대 없음). 종류를 모르면 점심으로 본다
    if (p.kind === "meal" && p.meal !== "cafe") {
      const isDinner = p.meal === "dinner";
      const win = isDinner ? dinner : lunch;
      if (win) {
        if (startAt < win[0]) startAt = win[0];
        if (startAt > win[1]) { issues.push(`${isDinner ? "저녁" : "점심"}이 늦음(${fmt(startAt)})`); cost += (startAt - win[1]) * 2; }
      }
    }
    // 좋은 시간대 (어기면 작은 벌점)
    if (p.best === "morning" && startAt > 660) cost += (startAt - 660) * 0.5;
    if (p.best === "sunset" && sunset != null) { const want = sunset - Math.min(90, p.stayMin); cost += Math.abs(startAt - want) * 0.6; }
    if (p.best === "night" && sunset != null && startAt < sunset) cost += (sunset - startAt) * 0.4;
    const area = flowKey(p);
    if (p.area && !returnOk(p)) {
      const prevIdx = lastInArea.get(p.area);
      if (prevIdx != null && prevIdx > pi) cost += AGAINST_WALK;
      lastInArea.set(p.area, pi);
    }
    if (area && !returnOk(p) && area !== curArea) {
      const from = curArea && !curArea.startsWith("#") ? firstOfArea.get(curArea) : undefined;
      const to = firstOfArea.get(area);
      if (from != null && to != null && to < from && !leftAreas.has(area)) cost += AGAINST_AREA;
      if (o.homeRegion && curArea === o.homeRegion && area !== o.homeRegion) { cost += AWAY_FROM_HOME; homeFirst = true; }
      if (leftAreas.has(area)) {
        const name = p.region || p.area || p.name;
        zigzag.push(`${name}${!p.region && p.area ? " 구역" : ""}(으)로 되돌아옴 (${curArea && !curArea.startsWith("#") ? curArea : (stops[stops.length - 1]?.name ?? "")} 다음)`);
        zigzagIds.push(p.id);
        cost += ZIGZAG_COST;
      }
      if (curArea) leftAreas.add(curArea);
      curArea = area;
    }
    const w = startAt - arrive;
    wait += w;
    const end = startAt + p.stayMin;
    stops.push({ id: p.id, name: p.name, arrive, start: startAt, end, travelFromPrev: tr, wait: w, issues });
    if (issues.length) violations.push(`${p.name}: ${issues.join(", ")}`);
    t = end;
  });
  if (maxEnd != null && t > maxEnd) { violations.push(`하루 끝 ${fmt(t)} — ${fmt(maxEnd)}보다 늦음`); hard++; cost += (t - maxEnd) * 3; }
  cost += travel + wait * 0.4 + hard * HARD;
  return { cost, hard, stops, travel, wait, end: t, violations, zigzag, zigzagIds, homeFirst };
}

function permuteBest(mid: number[], head: number[], tail: number[], places: EnginePlace[], M: Matrix, o: EngineOptions): number[] {
  let best: number[] = [...head, ...mid, ...tail];
  let bestCost = simulate(best, places, M, o).cost;
  const used = new Array(mid.length).fill(false), cur: number[] = [];
  const rec = (travelSoFar: number) => {
    if (travelSoFar >= bestCost) return;   // 이동 시간만으로도 이미 비싸면 그만
    if (cur.length === mid.length) {
      const ord = [...head, ...cur, ...tail], c = simulate(ord, places, M, o).cost;
      if (c < bestCost) { bestCost = c; best = ord; }
      return;
    }
    for (let i = 0; i < mid.length; i++) {
      if (used[i]) continue;
      const prev = cur.length ? cur[cur.length - 1] : head[head.length - 1];
      const add = prev == null ? 0 : M[prev][mid[i]];
      used[i] = true; cur.push(mid[i]); rec(travelSoFar + add); cur.pop(); used[i] = false;
    }
  };
  rec(0);
  return best;
}
function heuristicBest(mid: number[], head: number[], tail: number[], places: EnginePlace[], M: Matrix, o: EngineOptions): number[] {
  // 가장 싸게 늘어나는 자리에 하나씩 끼워 넣고, 두 곳을 맞바꾸며 다듬는다
  const route: number[] = [];
  const cost = (r: number[]) => simulate([...head, ...r, ...tail], places, M, o).cost;
  for (const p of mid) {
    let bi = 0, bc = Infinity;
    for (let i = 0; i <= route.length; i++) { const r = [...route.slice(0, i), p, ...route.slice(i)]; const c = cost(r); if (c < bc) { bc = c; bi = i; } }
    route.splice(bi, 0, p);
  }
  let improved = true, guard = 0;
  while (improved && guard++ < 40) {
    improved = false;
    for (let i = 0; i < route.length - 1; i++) for (let j = i + 1; j < route.length; j++) {
      const r = route.slice(); const seg = r.slice(i, j + 1).reverse(); r.splice(i, seg.length, ...seg);
      if (cost(r) + 0.01 < cost(route)) { route.splice(0, route.length, ...r); improved = true; }
    }
  }
  return [...head, ...route, ...tail];
}

/** 일정 배치 — M[i][j]는 places[i]→places[j] 이동 분 */
export function schedule(places: EnginePlace[], M: Matrix, o: EngineOptions): ScheduleResult {
  const idx = places.map((_, i) => i);
  const original = simulate(idx, places, M, o);
  let active = idx.slice();
  const dropped: ScheduleResult["dropped"] = [];
  let best: number[] = idx, sim = original, method: ScheduleResult["method"] = "exhaustive";
  for (let round = 0; round < places.length; round++) {
    const head = active.filter(i => places[i].fixedOrder === "first");
    const tail = active.filter(i => places[i].fixedOrder === "last");
    const mid = active.filter(i => !places[i].fixedOrder);
    method = mid.length <= 8 ? "exhaustive" : "heuristic";
    best = method === "exhaustive" ? permuteBest(mid, head, tail, places, M, o) : heuristicBest(mid, head, tail, places, M, o);
    sim = simulate(best, places, M, o);
    if (!sim.hard) break;
    // 조건을 어긴 곳 가운데 덜 중요한 곳부터 뺀다 (꼭(1)은 빼지 않음)
    const bad = sim.stops.filter(s => s.issues.length).map(s => places.findIndex(p => p.id === s.id))
      .filter(i => (places[i].priority ?? 2) > 1 && !places[i].fixedOrder)
      .sort((a, b) => (places[b].priority ?? 2) - (places[a].priority ?? 2));
    let victim = bad[0];
    if (victim == null && sim.violations.some(v => v.startsWith("하루 끝"))) {
      // 하루가 너무 길면 덜 중요한 곳 하나를 뺀다
      victim = active.filter(i => (places[i].priority ?? 2) === 3 && !places[i].fixedOrder)[0] ?? active.filter(i => (places[i].priority ?? 2) === 2 && !places[i].fixedOrder).pop();
    }
    if (victim == null) break;
    const s = sim.stops.find(x => x.id === places[victim].id);
    dropped.push({ id: places[victim].id, name: places[victim].name, reason: s && s.issues.length ? s.issues.join(", ") : "하루 일정이 너무 길어서" });
    active = active.filter(i => i !== victim);
  }
  return {
    order: best.map(i => places[i].id), timeline: sim.stops, violations: sim.violations, zigzag: sim.zigzag, zigzagIds: sim.zigzagIds, homeFirst: sim.homeFirst, dropped,
    totalTravel: sim.travel, totalWait: sim.wait, endTime: sim.end,
    savedTravel: Math.max(0, original.travel - sim.travel), method,
  };
}
