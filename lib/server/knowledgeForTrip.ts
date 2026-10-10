import { mapDayItems } from "@/lib/itinerary";
import { citiesOf, findPlace, isStale, knowledgeMemo, mergeResearch, placeScore, reasonFor, type CityKnowledge } from "@/lib/knowledge";
import type { Companion, DayPlan, TravelType, TripScope } from "@/types";
import { researchCity } from "./knowledgeResearch";
import { bumpMetric, getCity, putCity } from "./knowledgeStore";

export interface TripKnowledgeInfo {
  city: string;
  places: number;
  /** 이번에 웹에서 새로 조사했는지 (아니면 저장된 지식을 그대로 썼다) */
  researched: boolean;
}

/** 지역 순서("로마 2일, 피렌체 2일")가 있으면 그 도시들, 없으면 여행지 문자열의 도시들 */
export function tripCities(destination: string, regionPlan: string): string[] {
  const fromPlan = regionPlan
    .split(/[,→>·\n]/)
    .map((s) => s.replace(/\d+\s*(일|박|days?|nights?)/gi, "").trim())
    .filter(Boolean);
  return (fromPlan.length > 0 ? [...new Set(fromPlan)] : citiesOf(destination)).slice(0, 3);
}

/**
 * 코스를 만들기 전에 지식 창고를 본다 — 도시마다 저장된 지식을 읽고, 없거나 30일 지났으면(앞의 2개 도시만) 웹에서 조사해 쌓는다.
 * 조사가 실패해도 코스 만들기는 계속한다 (지식 없이).
 */
export async function knowledgeForTrip(o: { destination: string; regionPlan: string; travelType: TravelType; tripScope: TripScope; companions: Companion[] }): Promise<{ docs: CityKnowledge[]; memo: string; info: TripKnowledgeInfo[] }> {
  const cities = tripCities(o.destination, o.regionPlan);
  const docs: CityKnowledge[] = [];
  const info: TripKnowledgeInfo[] = [];
  for (const [i, city] of cities.entries()) {
    let doc = await getCity(city).catch(() => null);
    if (!doc) continue;
    let researched = false;
    if (isStale(doc) && i < 2) {
      try {
        const r = await researchCity({ city, travelType: o.travelType, tripScope: o.tripScope, companions: o.companions });
        doc = mergeResearch(doc, r.result, r.sources);
        await putCity(doc);
        researched = true;
        await bumpMetric({ research: 1 });
      } catch (err) {
        console.error("[knowledge] 조사 실패", city, err instanceof Error ? err.message : err);
      }
    }
    if (!researched && doc.places.length > 0) await bumpMetric({ reuse: 1 });
    docs.push(doc);
    info.push({ city, places: doc.places.length, researched });
  }
  return { docs, memo: knowledgeMemo(docs, o.companions), info };
}

/** 만든 일정의 장소마다 지식 창고 근거를 붙인다 (창고에 있는 곳만) */
export function annotateReasons(days: DayPlan[], docs: CityKnowledge[]): DayPlan[] {
  if (docs.every((d) => d.places.length === 0)) return days;
  const ranks = new Map(docs.map((d) => [d.city, [...d.places].sort((a, b) => placeScore(b) - placeScore(a)).map((p) => p.key)]));
  return days.map((day) =>
    mapDayItems(day, (it) => {
      if (it.type === "free_time" || it.type === "flight" || it.type === "transfer" || it.type === "hotel") return it;
      for (const d of docs) {
        const card = findPlace(d, it.name);
        if (!card) continue;
        const reason = reasonFor(card, ranks.get(d.city)?.indexOf(card.key));
        return reason ? { ...it, reason } : it;
      }
      return it;
    }),
  );
}
