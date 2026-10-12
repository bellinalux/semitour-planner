"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { PlaceCard } from "@/lib/knowledge";
import { favoriteSuggestions, knowledgeSuggestions, tripSuggestions, type PlaceSuggestion } from "@/lib/placeSuggest";
import type { CourseSegment } from "@/lib/segmentLibrary";
import type { DayPlan } from "@/types";

/** 장소 후보의 재료 — 즐겨찾기(장소 라이브러리)와 지금 일정 */
export const PlaceSuggestContext = createContext<{ favorites: CourseSegment[]; days: DayPlan[] } | null>(null);

// 지식 창고는 도시마다 한 번만 불러온다 (못 불러오면 빈 목록 — 즐겨찾기·이 일정만으로 찾는다)
const cache = new Map<string, Promise<PlaceCard[]>>();
function loadKnowledge(city: string): Promise<PlaceCard[]> {
  const hit = cache.get(city);
  if (hit) return hit;
  const p = fetch(`/api/knowledge?city=${encodeURIComponent(city)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { doc?: { places?: PlaceCard[] } } | null) => (Array.isArray(j?.doc?.places) ? j.doc.places : []))
    .catch(() => []);
  cache.set(city, p);
  return p;
}

/** 넣기 칸이 열려 있을 때만 지식 창고를 불러와 후보를 만든다 */
export function usePlaceSuggestions(city: string | undefined, active: boolean): PlaceSuggestion[] {
  const ctx = useContext(PlaceSuggestContext);
  const [know, setKnow] = useState<{ city: string; places: PlaceCard[] } | null>(null);
  useEffect(() => {
    if (!active || !city) return;
    let alive = true;
    void loadKnowledge(city).then((places) => alive && setKnow({ city, places }));
    return () => {
      alive = false;
    };
  }, [active, city]);
  return useMemo(
    () =>
      !active
        ? []
        : [...favoriteSuggestions(ctx?.favorites ?? []), ...knowledgeSuggestions(know && know.city === city ? know.places : []), ...tripSuggestions(ctx?.days ?? [])],
    [active, ctx, know, city],
  );
}
