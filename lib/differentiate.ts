import { blockMinutes, refitDay, roomOf } from "@/lib/dayBalance";
import { coursePlaces, findPlace, knowledgeKey, placeScore, type CityKnowledge } from "@/lib/knowledge";
import type { PmChoice } from "@/lib/itinerary";
import type { Competitor, DayPlan, ItineraryItem } from "@/types";

/**
 * 경쟁 상품 대비 차별화 — 다른 여행사 코스(판매 페이지 일정·주요 방문지)와 우리 코스를 견준다.
 *  공통: 우리도 있고 다른 여행사도 넣은 곳 (빠지면 비교에서 불리)
 *  우리만: 다른 여행사에는 없는 곳 (차별점·USP)
 *  빠진 인기: 다른 여행사 절반 이상(2곳 이상)이 넣었거나 지식 창고 상위인데 우리에게 없는 곳 → 넣는 안
 */

export interface DiffPlace {
  name: string;
  agencies: string[];
  score: number | null;
}

export interface Differentiation {
  rivals: number;
  common: DiffPlace[];
  oursOnly: DiffPlace[];
  missing: DiffPlace[];
  usp: string[];
}

/** 이름이 같은 곳인지 (괄호 병기·띄어쓰기·한쪽 이름이 다른 쪽에 들어 있어도) */
export function samePlace(a: string, b: string): boolean {
  const x = knowledgeKey(a);
  const y = knowledgeKey(b);
  if (!x || !y) return false;
  return x === y || (Math.min(x.length, y.length) >= 3 && (x.includes(y) || y.includes(x)));
}

export function differentiate(days: DayPlan[], pmChoice: PmChoice, competitors: Competitor[], kb: CityKnowledge | null): Differentiation {
  const ours = coursePlaces(days, pmChoice);
  const rivals = competitors.filter((c) => (c.itinerary?.found && c.itinerary.days.length) || (c.places ?? []).length);
  const theirs: { name: string; agencies: Set<string> }[] = [];
  for (const c of rivals) {
    const agency = c.source?.agency || c.name;
    const names = c.itinerary?.found ? c.itinerary.days.flatMap((d) => d.places) : (c.places ?? []);
    for (const n of names) {
      const hit = theirs.find((t) => samePlace(t.name, n));
      if (hit) hit.agencies.add(agency);
      else theirs.push({ name: n, agencies: new Set([agency]) });
    }
  }
  const score = (n: string) => {
    const p = kb ? findPlace(kb, n) : undefined;
    return p ? placeScore(p) : null;
  };
  const common: DiffPlace[] = [];
  const oursOnly: DiffPlace[] = [];
  for (const n of ours) {
    const t = theirs.find((x) => samePlace(x.name, n));
    if (t) common.push({ name: n, agencies: [...t.agencies], score: score(n) });
    else oursOnly.push({ name: n, agencies: [], score: score(n) });
  }
  const need = Math.max(2, Math.ceil(rivals.length / 2));
  const missing: DiffPlace[] = theirs
    .filter((t) => t.agencies.size >= need && !ours.some((o) => samePlace(o, t.name)))
    .map((t) => ({ name: t.name, agencies: [...t.agencies], score: score(t.name) }));
  // 지식 창고 상위인데 우리도 다른 여행사도 없는 곳 (숨은 인기)
  if (kb)
    for (const p of [...kb.places].sort((a, b) => placeScore(b) - placeScore(a)).slice(0, 10))
      if (!ours.some((o) => samePlace(o, p.name)) && !missing.some((m) => samePlace(m.name, p.name)) && (p.kind === "sight" || p.kind === "activity"))
        missing.push({ name: p.name, agencies: p.agencies, score: placeScore(p) });
  const usp: string[] = [];
  const hot = oursOnly.filter((p) => (p.score ?? 0) >= 30).map((p) => p.name);
  if (oursOnly.length) usp.push(`다른 여행사 상품에 없는 ${(hot.length ? hot : oursOnly.map((p) => p.name)).slice(0, 3).join("·")}까지`);
  const commonAll = common.filter((p) => p.agencies.length >= need).length;
  if (rivals.length && commonAll) usp.push(`대형사 공통 핵심 코스 ${commonAll}곳은 그대로 포함`);
  const reviewed = [...common, ...oursOnly].filter((p) => (p.score ?? 0) >= 50).length;
  if (reviewed) usp.push(`여행자 후기 인기 장소 ${reviewed}곳`);
  return { rivals: rivals.length, common, oursOnly, missing: missing.slice(0, 8), usp };
}

/** 빠진 인기 장소를 넣는다 — 여유가 가장 많은 날의 숙소 줄 앞에 (쉬게 둔 날·마지막 항공일 제외) */
export function addPlace(days: DayPlan[], pmChoice: PmChoice, p: DiffPlace, kb: CityKnowledge | null): { days: DayPlan[]; day: number } | null {
  const card = kb ? findPlace(kb, p.name) : undefined;
  const item: ItineraryItem = {
    id: `add-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    type: card?.kind === "meal" ? "meal" : "sightseeing",
    admission: "unknown",
    name: p.name,
    description: card?.likes[0] ?? "",
    stayMinutes: card?.stayWeb || 60,
    travelMinutesToNext: 15,
    entryFee: 0,
    mealCost: 0,
    isEstimated: true,
    reason: p.agencies.length ? `다른 여행사 ${p.agencies.length}곳 포함` : "후기 인기",
  };
  const last = days[days.length - 1];
  const target = days
    .filter((d) => d.kind === "linear" && !d.rest && !(d === last && d.items.some((i) => i.type === "flight")))
    .map((d) => ({ d, room: roomOf(d, pmChoice) }))
    .filter((x) => x.room >= blockMinutes([item]))
    .sort((a, b) => b.room - a.room)[0];
  if (!target) return null;
  return {
    day: target.d.day,
    days: days.map((d) => {
      if (d !== target.d) return d;
      const at = d.items.findIndex((i) => i.type === "hotel");
      const items = at >= 0 ? [...d.items.slice(0, at), item, ...d.items.slice(at)] : [...d.items, item];
      return refitDay({ ...d, items });
    }),
  };
}
