import { dayMealIssues, fitCourse } from "@/lib/courseFit";
import { blocks, refitDay } from "@/lib/dayBalance";
import { calcDayGap, calcDayLoad, dayMeetingTime, dayTourStart, formatClock, morningFreeItems, parseClock, walkTimeline } from "@/lib/dayLoad";
import { dayStructureIssues, fixDayStructure } from "@/lib/dayStructure";
import { bestInsert, dayHardIssues, dayWindow, fixImpossible, isTourItem, newHardIssues } from "@/lib/feasibility";
import { dayIntensity, INTENSITY_LABEL } from "@/lib/intensity";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import { isMealFiller, isRestStop } from "@/lib/mealTiming";
import { mealSlotOf } from "@/lib/mealSlot";
import { dayRuleIssues, isShoppingCenter, ruleDayEnd, separateItems, type PackageRules } from "@/lib/packageRules";
import { findZigzag } from "@/lib/routeOrder";
import type { DayPlan, ItineraryItem } from "@/types";

/**
 * 전체 일정 재구성 — 날마다 진단(불가능·넘침·비어 있음·순서)하고, 여행 전체 흐름으로 변경안 2~3개를 만든다.
 *  균형안: 장소는 그대로, 넘치는 날의 뒤쪽 묶음을 같은 숙박 도시의 여유 있는 날(시각이 맞는 자리)로
 *  여유안: 균형안 + 그래도 넘치는 날은 우선순위 낮은 곳(카페·쇼핑센터·별도 진행·짧은 외관 관람)을 뺀다
 *  알찬안: 균형안 + 그래도 넘치는 날은 미팅을 규칙 안에서 당긴다
 * 모든 안은 새 불가능 시간을 만들지 않는다 (만들면 그 이동은 하지 않는다). 못 푼 것은 "직원 판단 필요"로 남긴다.
 */

export type DayStatus = "ok" | "impossible" | "over" | "empty" | "order";
export const STATUS_LABEL: Record<DayStatus, string> = { ok: "정상", impossible: "불가능", over: "넘침", empty: "비어 있음", order: "순서" };

export interface DayDiagnosis {
  day: number;
  status: DayStatus;
  impossible: string[];
  over: string[];
  empty: string[];
  order: string[];
}

const OVER_RULE = /^하루 \d+곳|^한 번 이동|^하루 차량 이동|^걷기/;
const fmtH = (m: number) => `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}`;

/** 그날 투어가 끝나는 시각(분) — 숙소·이동·항공 줄은 빼고 */
function tourEnd(day: DayPlan, pmChoice: PmChoice): number | null {
  const slots = walkTimeline(dayItems(day, pmChoice), dayTourStart(day)).filter((s) => isTourItem(s.item) || s.item.type === "free_time");
  return slots.length ? slots[slots.length - 1].end : null;
}

/** 날마다 진단 */
export function diagnoseTrip(days: DayPlan[], pmChoice: PmChoice, r: PackageRules): DayDiagnosis[] {
  return days.map((d, i) => {
    const impossible = dayHardIssues(d, pmChoice, r.dayEnd).map((x) => x.text);
    const over: string[] = [];
    const empty: string[] = [];
    const order: string[] = [];
    const end = ruleDayEnd(d, pmChoice, r);
    if (end?.isLate) over.push(`${end.endTime}에 끝남 (기준 ${r.dayEnd})`);
    const load = calcDayLoad(d, pmChoice);
    if (load.level === "overloaded") over.push(`하루 ${fmtH(load.totalMinutes)} (과부하)`);
    for (const t of dayRuleIssues(days, i, pmChoice, r)) (OVER_RULE.test(t) ? over : order).push(t);
    // 비어 있음 — 관광일인데 일찍 끝남, 긴 자유시간, 점심 없는 관광일
    const w = dayWindow(d, pmChoice, r.dayEnd);
    if (w.kind === "normal") {
      const gap = calcDayGap(d, pmChoice, i === days.length - 1);
      if (gap) empty.push(`${gap.fromTime}에 끝나 ${fmtH(gap.freeMinutes)} 비어 있음`);
      const pre = new Set(morningFreeItems(d.items));
      const longFree = d.items.filter((x) => x.type === "free_time" && !isMealFiller(x) && !isRestStop(x) && !pre.has(x) && x.stayMinutes >= 180);
      if (longFree.length) empty.push(`자유시간 ${fmtH(longFree[0].stayMinutes)} — 관광이나 선택관광으로 채울 수 있음`);
      const tours = dayItems(d, pmChoice).filter((x) => isTourItem(x) && x.type !== "meal");
      const lunch = dayItems(d, pmChoice).some((x) => mealSlotOf(x) === "lunch");
      if (tours.length >= 2 && !lunch && !d.rest) empty.push("점심이 없는 관광일");
      // 식사 시간까지 오래 기다림 — 장소를 앞당기거나 식사 자리를 옮길 수 있다
      for (const f of d.items.filter((x) => isMealFiller(x) && x.stayMinutes >= 60 && /식사/.test(x.description ?? ""))) empty.push(`식사 시간까지 ${fmtH(f.stayMinutes)} 대기 — 장소 순서·식사 자리를 맞출 수 있음`);
    }
    // 순서 — 지그재그, 식사 순서·시각, 구성
    if (d.kind === "linear" && findZigzag(d, pmChoice).length) order.push("지그재그 동선 (떠난 구역으로 되돌아옴)");
    order.push(...dayMealIssues(d, pmChoice), ...dayStructureIssues(d));
    const status: DayStatus = impossible.length ? "impossible" : over.length ? "over" : empty.length ? "empty" : order.length ? "order" : "ok";
    return { day: d.day, status, impossible, over, empty, order };
  });
}

/* ── 변경안 ── */

export interface DaySummary {
  day: number;
  meeting: string;
  end: string;
  places: number;
  intensity: string;
  issues: number;
}

export interface RestructurePlan {
  key: "balance" | "relaxed" | "packed";
  label: string;
  description: string;
  days: DayPlan[];
  changes: string[];
  dropped: { day: number; item: ItineraryItem }[];
  before: DaySummary[];
  after: DaySummary[];
  /** 직원 판단 필요 (자동으로 못 푼 것) */
  left: string[];
}

function summarize(days: DayPlan[], pmChoice: PmChoice, r: PackageRules): DaySummary[] {
  const diag = diagnoseTrip(days, pmChoice, r);
  return days.map((d, i) => {
    const end = tourEnd(d, pmChoice);
    return {
      day: d.day,
      meeting: dayMeetingTime(d),
      end: end === null ? "—" : formatClock(end),
      places: dayItems(d, pmChoice).filter((x) => isTourItem(x) && x.type !== "meal").length,
      intensity: INTENSITY_LABEL[dayIntensity(d, pmChoice).level],
      issues: diag[i].impossible.length + diag[i].over.length,
    };
  });
}

/** 넘치는 날인가 — 종료 기준·과부하·장소 수 */
function isOver(days: DayPlan[], i: number, pmChoice: PmChoice, r: PackageRules): boolean {
  const d = days[i];
  if (ruleDayEnd(d, pmChoice, r)?.isLate) return true;
  if (calcDayLoad(d, pmChoice).level === "overloaded") return true;
  return dayRuleIssues(days, i, pmChoice, r).some((t) => /^하루 \d+곳/.test(t));
}

/** 넘치는 날의 뒤쪽 묶음부터 같은 숙박 도시의 여유 있는 날로 (시각이 맞는 자리, 새 불가능 시간 없이) */
function balance(days: DayPlan[], pmChoice: PmChoice, r: PackageRules, changes: string[]): DayPlan[] {
  let next = days;
  for (let guard = 0; guard < 12; guard++) {
    const i = next.findIndex((_, k) => next[k].kind === "linear" && isOver(next, k, pmChoice, r));
    if (i < 0) break;
    const from = next[i];
    let moved = false;
    for (const block of [...blocks(from.items)].reverse()) {
      const ids = new Set(block.map((b) => b.id));
      const rest = refitDay({ ...from, items: from.items.filter((x) => !ids.has(x.id)) });
      const city = (from.overnightCity ?? "").trim();
      const targets = next
        .map((d, k) => ({ d, k }))
        .filter(({ d, k }) => k !== i && d.kind === "linear" && dayWindow(d, pmChoice, r.dayEnd).acceptsMoves && !isOver(next, k, pmChoice, r))
        .sort((a, b) => Number((b.d.overnightCity ?? "").trim() === city) - Number((a.d.overnightCity ?? "").trim() === city));
      for (const { d, k } of targets) {
        const placed = bestInsert(d, block.map((x, n) => (n === block.length - 1 ? { ...x, travelMinutesToNext: x.travelMinutesToNext ?? 20 } : x)), pmChoice, refitDay, r.dayEnd);
        if (!placed) continue;
        const cand = next.map((x, n) => (n === i ? rest : n === k ? placed : x));
        if (newHardIssues(next, cand, pmChoice, r.dayEnd).length > 0) continue;
        // 받는 날이 넘치게 되면 하지 않는다
        if (isOver(cand, k, pmChoice, r)) continue;
        changes.push(`${block.map((x) => x.name).join(", ")}: DAY ${from.day} → DAY ${d.day} (DAY ${from.day}가 넘쳐서)`);
        next = cand;
        moved = true;
        break;
      }
      if (moved) break;
    }
    if (!moved) break;
  }
  return next;
}

/** 뺄 순서 — 카페·간식 → 원문 별도 진행 → 쇼핑센터 → 짧은 외관 관람 → 짧은 관광 (식사·항공·숙소·이동·정해진 시각은 빼지 않는다) */
function dropRank(it: ItineraryItem, separate: Set<string>): number | null {
  if (["flight", "transfer", "hotel", "free_time"].includes(it.type ?? "") || it.fixedTime) return null;
  if (it.type === "meal") return mealSlotOf(it) === "cafe" ? 1 : null;
  if (separate.has(it.id)) return 2;
  if (isShoppingCenter(it)) return 3;
  if (it.admission === "view_only" && it.stayMinutes <= 40) return 4;
  // 핵심 관광지·체험은 자동으로 빼지 않는다 (직원 판단)
  return null;
}

function relax(days: DayPlan[], pmChoice: PmChoice, r: PackageRules, changes: string[], dropped: { day: number; item: ItineraryItem }[]): DayPlan[] {
  let next = days;
  const separate = new Set(separateItems(days, pmChoice).map((s) => s.item.id));
  for (let i = 0; i < next.length; i++) {
    for (let guard = 0; guard < 4 && next[i].kind === "linear" && isOver(next, i, pmChoice, r); guard++) {
      const cands = next[i].items.map((it) => ({ it, rank: dropRank(it, separate) })).filter((x): x is { it: ItineraryItem; rank: number } => x.rank !== null);
      if (cands.length <= 1) break;
      const victim = cands.sort((a, b) => a.rank - b.rank)[0].it;
      const d = next[i];
      const items: ItineraryItem[] = [];
      for (const it of d.items) {
        if (it === victim) {
          const prev = items.at(-1);
          if (prev) items[items.length - 1] = { ...prev, travelMinutesToNext: Math.max(prev.travelMinutesToNext ?? 0, it.travelMinutesToNext ?? 0) };
          continue;
        }
        items.push(it);
      }
      next = next.map((x, k) => (k === i ? refitDay({ ...d, items }) : x));
      dropped.push({ day: d.day, item: victim });
      changes.push(`${victim.name} 뺌 (DAY ${d.day}가 넘쳐서 — 대안 장소·선택관광으로)`);
    }
  }
  return next;
}

function pack(days: DayPlan[], pmChoice: PmChoice, r: PackageRules, changes: string[]): DayPlan[] {
  return days.map((d, i) => {
    if (d.kind !== "linear" || !isOver(days, i, pmChoice, r)) return d;
    const cur = parseClock(dayMeetingTime(d)) ?? 0;
    const early = parseClock(r.earliestMeeting) ?? cur;
    if (early >= cur || morningFreeItems(d.items).length > 0 || d.items[0]?.type === "flight") return d;
    changes.push(`DAY ${d.day} 미팅 ${dayMeetingTime(d)} → ${r.earliestMeeting} (규칙 안에서 당김)`);
    return refitDay({ ...d, meetingTime: r.earliestMeeting });
  });
}

/** 도시가 바뀌는 날인데 이동 줄이 없으면 그날 앞에 도시 이동을 넣는다 (시간은 도시 간 표, 모르면 2시간 추정) */
const CITY_MOVE: Record<string, number> = {
  "방콕|파타야": 150, "다낭|호이안": 40, "하노이|하롱": 150, "하노이|닌빈": 120, "호치민|무이네": 240, "나트랑|달랏": 210,
  "로마|피렌체": 100, "피렌체|베니스": 130, "로마|나폴리": 80, "밀라노|베니스": 150, "파리|런던": 140, "프라하|비엔나": 240, "비엔나|부다페스트": 160,
  "오사카|교토": 60, "도쿄|하코네": 100, "후쿠오카|유후인": 120, "유후인|벳푸": 40, "삿포로|오타루": 50, "마카오|홍콩": 70, "싱가포르|조호바루": 60,
};
export function cityMoveMinutes(a: string, b: string): number | null {
  for (const [k, m] of Object.entries(CITY_MOVE)) {
    const [x, y] = k.split("|");
    if ((a.includes(x) && b.includes(y)) || (a.includes(y) && b.includes(x))) return m;
  }
  return null;
}

export function missingCityMoves(days: DayPlan[]): { day: number; from: string; to: string }[] {
  const out: { day: number; from: string; to: string }[] = [];
  for (let i = 1; i < days.length; i++) {
    const from = (days[i - 1].overnightCity ?? "").trim();
    const to = (days[i].overnightCity ?? "").trim();
    if (!from || !to || from === to || days[i].kind !== "linear") continue;
    if (days[i].items.some((x) => x.type === "transfer" || x.type === "flight")) continue;
    out.push({ day: days[i].day, from, to });
  }
  return out;
}

export function addCityMoves(days: DayPlan[], changes: string[]): DayPlan[] {
  const miss = missingCityMoves(days);
  if (miss.length === 0) return days;
  return days.map((d) => {
    const m = miss.find((x) => x.day === d.day);
    if (!m) return d;
    const minutes = cityMoveMinutes(m.from, m.to);
    const item: ItineraryItem = {
      id: `move-${d.day}`,
      type: "transfer",
      admission: "none",
      name: `${m.from} → ${m.to} 이동 (체크아웃 후)`,
      description: minutes ? "" : "이동 시간 추정 — 실제 거리·교통편으로 확인",
      stayMinutes: minutes ?? 120,
      travelMinutesToNext: 10,
      entryFee: 0,
      mealCost: 0,
      isEstimated: minutes === null,
    };
    changes.push(`DAY ${d.day} ${m.from} → ${m.to} 도시 이동 넣음 (약 ${fmtH(item.stayMinutes)}${minutes ? "" : ", 추정"})`);
    return refitDay({ ...d, items: [item, ...d.items] });
  });
}

const same = (a: DayPlan[], b: DayPlan[]) => JSON.stringify(a) === JSON.stringify(b);

/** 변경안 — 균형안·여유안·알찬안 (원래와 같거나 서로 같은 안은 뺀다) */
export function restructurePlans(days: DayPlan[], pmChoice: PmChoice, r: PackageRules): RestructurePlan[] {
  const before = summarize(days, pmChoice, r);
  // 공통 바탕 — 불가능 시간 고치기, 하루 구성 정리, 빠진 도시 이동
  const common: string[] = [];
  const impossible = fixImpossible(days, pmChoice, refitDay, r.dayEnd);
  common.push(...impossible.changes);
  let base = impossible.days.map((d) => {
    const f = fixDayStructure(d);
    if (f !== d) common.push(`DAY ${d.day} 구성 정리 (조식·자유시간·오전 자유 미팅)`);
    return f;
  });
  base = addCityMoves(base, common);
  // 식사 시간까지 오래 기다리는 날 — 식사 자리를 12:00·18:30 근처 구역 경계로 (재정렬의 식사 자리 맞추기)
  base = base.map((d) => {
    const wait = d.items.filter((x) => isMealFiller(x) && /식사/.test(x.description ?? "")).reduce((s, x) => s + x.stayMinutes, 0);
    if (d.kind !== "linear" || wait < 60) return d;
    const fitted = fitCourse([d], { walk: false, slot: true }).days[0];
    const after = fitted.items.filter((x) => isMealFiller(x) && /식사/.test(x.description ?? "")).reduce((s, x) => s + x.stayMinutes, 0);
    if (after >= wait || newHardIssues([d], [fitted], pmChoice, r.dayEnd).length > 0) return d;
    common.push(`DAY ${d.day} 식사 자리 맞춤 (식사 대기 ${fmtH(wait)} → ${after ? fmtH(after) : "없음"})`);
    return fitted;
  });

  const balanceChanges = [...common];
  const balanced = balance(base, pmChoice, r, balanceChanges);

  const relaxedChanges = [...balanceChanges];
  const dropped: { day: number; item: ItineraryItem }[] = [];
  const relaxed = relax(balanced, pmChoice, r, relaxedChanges, dropped);

  const packedChanges = [...balanceChanges];
  const packed = balance(pack(balanced, pmChoice, r, packedChanges), pmChoice, r, packedChanges);

  const left = (d: DayPlan[]) => diagnoseTrip(d, pmChoice, r).flatMap((x) => [...x.impossible, ...x.over].map((t) => `DAY ${x.day}: ${t}`));
  const plans: RestructurePlan[] = [
    { key: "balance", label: "균형안", description: "장소는 그대로 두고 넘치는 날의 묶음을 같은 도시의 여유 있는 날로 나눕니다", days: balanced, changes: balanceChanges, dropped: [], before, after: summarize(balanced, pmChoice, r), left: left(balanced) },
    { key: "relaxed", label: "여유안", description: "균형안에서도 넘치는 날은 우선순위 낮은 곳(카페·쇼핑센터·별도 진행·짧은 외관 관람)을 뺍니다", days: relaxed, changes: relaxedChanges, dropped, before, after: summarize(relaxed, pmChoice, r), left: left(relaxed) },
    { key: "packed", label: "알찬안", description: "장소를 빼지 않고, 넘치는 날은 미팅을 규칙 안에서 당겨 맞춥니다", days: packed, changes: packedChanges, dropped: [], before, after: summarize(packed, pmChoice, r), left: left(packed) },
  ];
  // 점검 점수 (불가능 3 · 넘침 2 · 비어 있음 1) — 줄지 않는 안은 내지 않는다
  const score = (d: DayPlan[]) => diagnoseTrip(d, pmChoice, r).reduce((s, x) => s + x.impossible.length * 3 + x.over.length * 2 + x.empty.length, 0);
  const before0 = score(days);
  const out: RestructurePlan[] = [];
  for (const p of plans) {
    if (same(p.days, days)) continue;
    if (score(p.days) >= before0) continue;
    if (out.some((o) => same(o.days, p.days))) continue;
    // 새 불가능 시간이 생기는 안은 내지 않는다
    if (newHardIssues(days, p.days, pmChoice, r.dayEnd).length > 0) continue;
    out.push(p);
  }
  return out;
}
