import { computeItemTimings, dayTourStart } from "@/lib/dayLoad";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import { restAfter } from "@/lib/itineraryDoc";
import { knowledgeKey, placeScore, type CityKnowledge, type PlaceCard } from "@/lib/knowledge";
import type { Companion, DayPlan, TourOption } from "@/types";

/**
 * 자유시간 선택관광 — 쉬게 둔 날(전일·오후·오전 자유)과 일찍 끝나는 날의 빈 시간에 넣을 선택관광 후보를 고른다.
 * 후보: 지식 창고의 체험·야경·관광 중 일정에 없는 곳 (동반자에 맞는 곳 먼저, 점수순). 선택관광은 상품 수익원이다.
 */

export interface FreeSlot {
  day: number;
  kind: string;
  minutes: number;
}

export function freeSlots(days: DayPlan[], pmChoice: PmChoice): FreeSlot[] {
  return days.flatMap((d, index) => {
    if (d.rest === "free") return [{ day: d.day, kind: "전일 자유", minutes: 480 }];
    if (d.rest === "pmfree") return [{ day: d.day, kind: "오후 자유", minutes: 210 }];
    if (d.rest === "late") return [{ day: d.day, kind: "오전 자유", minutes: 180 }];
    const items = dayItems(d, pmChoice);
    const rest = restAfter(days, index, pmChoice, computeItemTimings(items, dayTourStart(d)));
    return rest ? [{ day: d.day, kind: "일찍 끝나는 날 오후", minutes: rest.stayMinutes }] : [];
  });
}

export function slotCandidates(doc: CityKnowledge | null, days: DayPlan[], options: TourOption[], companions: Companion[], limit = 3): PlaceCard[] {
  if (!doc) return [];
  const have = new Set([...days.flatMap((d) => [...d.items, ...d.amGuided, ...d.pmFreeOptions.flatMap((o) => o.items)]).map((i) => knowledgeKey(i.name)), ...options.map((o) => knowledgeKey(o.name))]);
  return doc.places
    .filter((p) => (p.kind === "activity" || p.kind === "night" || p.kind === "sight") && !have.has(p.key) && placeScore(p) > 0)
    .sort((a, b) => Number(b.kind !== "sight") - Number(a.kind !== "sight") || Number(b.fits.some((f) => companions.includes(f))) - Number(a.fits.some((f) => companions.includes(f))) || placeScore(b) - placeScore(a))
    .slice(0, limit);
}

/** 후보를 선택관광으로 (요금은 투어 검색·업체 견적으로 확인) */
export function optionFromCard(p: PlaceCard, dayNo: number): TourOption {
  return {
    id: `opt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: p.name,
    description: p.likes.slice(0, 2).join(" · "),
    category: p.kind === "night" ? "night" : "activity",
    durationMinutes: p.stayWeb || 120,
    dayNo,
    costPerPerson: 0,
    pricePerPerson: 0,
    minParticipants: 2,
    participationRate: 50,
    note: "요금 확인 필요 — 투어 카탈로그 검색이나 업체 견적으로 원가·판매가를 넣으세요",
  };
}
