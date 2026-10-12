import type { PlaceCard } from "@/lib/knowledge";
import type { CourseSegment } from "@/lib/segmentLibrary";
import type { DayPlan, ItemType, ItineraryItem } from "@/types";

/**
 * 항목 사이에 넣을 때 고르는 장소 후보 — 즐겨찾기(저장한 장소) · 지식 창고(그 도시 장소) · 이 일정의 다른 날 장소.
 * 고르면 이름·유형·체류(즐겨찾기·이 일정은 금액·설명·좌표까지)가 함께 들어간다.
 */
export type PlaceSource = "fav" | "know" | "trip";

export interface PlaceSuggestion {
  key: string;
  source: PlaceSource;
  name: string;
  /** 옆에 작게 보이는 설명 (구역·날짜·체류) */
  sub: string;
  /** 넣을 항목 (id는 넣을 때 새로 만든다) */
  item: Omit<ItineraryItem, "id">;
  /** 지식 창고 인기 (정렬용) */
  popularity: number;
}

export const SOURCE_LABEL: Record<PlaceSource, string> = { fav: "즐겨찾기", know: "지식 창고", trip: "이 일정" };

const NOT_PLACE = new Set(["flight", "transfer", "hotel", "free_time"]);
const KIND_TYPE: Record<PlaceCard["kind"], ItemType> = { sight: "sightseeing", meal: "meal", activity: "experience", shopping: "shopping", night: "sightseeing" };

const strip = (it: ItineraryItem): Omit<ItineraryItem, "id"> => {
  const copy: Partial<ItineraryItem> = { ...it };
  delete copy.id;
  return copy as Omit<ItineraryItem, "id">;
};
const norm = (s: string) => s.toLowerCase().replace(/[\s()·,.-]/g, "");
const stayText = (m: number) => (m > 0 ? `${m}분` : "");

/** 즐겨찾기에 저장한 장소 (장소 하나짜리만) */
export function favoriteSuggestions(segments: CourseSegment[]): PlaceSuggestion[] {
  return segments
    .filter((s) => s.kind === "place" && s.items.length === 1)
    .map((s) => ({ key: `fav-${s.id}`, source: "fav" as const, name: s.items[0].name, sub: [s.destination, stayText(s.items[0].stayMinutes)].filter(Boolean).join(" · "), item: strip(s.items[0]), popularity: 0 }));
}

/** 지식 창고의 그 도시 장소 — 체류는 현장에서 잰 값, 없으면 웹에서 본 보통 체류 */
export function knowledgeSuggestions(places: PlaceCard[]): PlaceSuggestion[] {
  return places.map((p) => {
    const type = KIND_TYPE[p.kind] ?? "sightseeing";
    const stay = p.stayField?.avg || p.stayWeb || 60;
    return {
      key: `know-${p.key}`,
      source: "know" as const,
      name: p.name,
      sub: [p.area, stayText(stay), p.kind === "night" ? "야간" : ""].filter(Boolean).join(" · "),
      popularity: p.popularity,
      item: {
        type,
        admission: type === "meal" ? "none" : "unknown",
        name: p.name,
        description: p.tips[0] ?? "",
        stayMinutes: stay,
        travelMinutesToNext: 20,
        entryFee: 0,
        mealCost: 0,
        isEstimated: true,
      },
    };
  });
}

/** 이 일정의 다른 날 장소 (같은 이름은 한 번만) */
export function tripSuggestions(days: DayPlan[]): PlaceSuggestion[] {
  const seen = new Set<string>();
  const out: PlaceSuggestion[] = [];
  for (const d of days) {
    for (const it of [...d.items, ...d.amGuided, ...d.pmFreeOptions.flatMap((o) => o.items)]) {
      if (NOT_PLACE.has(it.type ?? "sightseeing") || seen.has(norm(it.name))) continue;
      seen.add(norm(it.name));
      out.push({ key: `trip-${it.id}`, source: "trip", name: it.name, sub: [`DAY ${d.day}`, stayText(it.stayMinutes)].filter(Boolean).join(" · "), item: strip(it), popularity: 0 });
    }
  }
  return out;
}

const ORDER: Record<PlaceSource, number> = { fav: 0, know: 1, trip: 2 };

/** 입력한 글자로 찾기 — 앞부분이 맞는 것 먼저, 그다음 즐겨찾기 → 지식 창고(인기순) → 이 일정. 같은 이름은 한 번만 */
export function matchPlaces(query: string, list: PlaceSuggestion[], limit = 8): PlaceSuggestion[] {
  const q = norm(query);
  if (!q) return [];
  const hits = list
    .map((s) => ({ s, at: norm(s.name).indexOf(q) }))
    .filter((h) => h.at >= 0)
    .sort((a, b) => Number(a.at !== 0) - Number(b.at !== 0) || ORDER[a.s.source] - ORDER[b.s.source] || b.s.popularity - a.s.popularity || a.s.name.length - b.s.name.length);
  const seen = new Set<string>();
  const out: PlaceSuggestion[] = [];
  for (const { s } of hits) {
    if (seen.has(norm(s.name))) continue;
    seen.add(norm(s.name));
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}
