import type { TourCandidate, TourCategory } from "@/types";

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** ---------- 목적지 ---------- */

export interface ViatorDestination {
  id: number;
  name: string;
  type: string;
  parentId: number | null;
}

export function parseDestinations(body: unknown): ViatorDestination[] {
  if (!isObj(body) || !Array.isArray(body.destinations)) return [];
  const list: ViatorDestination[] = [];
  for (const d of body.destinations) {
    if (!isObj(d) || typeof d.destinationId !== "number" || typeof d.name !== "string") continue;
    list.push({
      id: d.destinationId,
      name: d.name,
      type: typeof d.type === "string" ? d.type : "",
      parentId: typeof d.parentDestinationId === "number" ? d.parentDestinationId : null,
    });
  }
  return list;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * 도시 이름(영문)으로 Viator 목적지를 찾는다.
 * 이름이 같은 도시가 여러 곳이면(예: Paris) 상위 나라 이름이 맞는 쪽을 고른다.
 */
export function findDestination(list: ViatorDestination[], city: string, country: string): ViatorDestination | null {
  const target = norm(city);
  if (!target) return null;
  const byId = new Map(list.map((d) => [d.id, d]));
  const countryOf = (d: ViatorDestination): string => {
    let cur: ViatorDestination | undefined = d;
    for (let i = 0; cur && i < 6; i++) {
      if (cur.type.toUpperCase() === "COUNTRY") return norm(cur.name);
      cur = cur.parentId === null ? undefined : byId.get(cur.parentId);
    }
    return "";
  };

  const isCity = (d: ViatorDestination) => !d.type || !/country|region|continent/i.test(d.type);
  const exact = list.filter((d) => isCity(d) && norm(d.name) === target);
  const pool = exact.length > 0 ? exact : list.filter((d) => isCity(d) && norm(d.name).startsWith(target));
  if (pool.length === 0) return null;
  const wantCountry = norm(country);
  return pool.find((d) => countryOf(d) === wantCountry) ?? pool[0] ?? null;
}

/** ---------- 태그(카테고리) ---------- */

export interface ViatorTag {
  id: number;
  name: string;
}

export function parseTags(body: unknown): ViatorTag[] {
  if (!isObj(body) || !Array.isArray(body.tags)) return [];
  const list: ViatorTag[] = [];
  for (const t of body.tags) {
    if (!isObj(t) || typeof t.tagId !== "number") continue;
    const names = isObj(t.allNamesByLocale) ? t.allNamesByLocale : {};
    const name = typeof names["en"] === "string" ? names["en"] : Object.values(names).find((v): v is string => typeof v === "string");
    if (name) list.push({ id: t.tagId, name });
  }
  return list;
}

/** 우리 투어 종류와 Viator 태그 이름(영문)을 잇는 규칙 */
const CATEGORY_TAG_RULES: Record<TourCategory, RegExp> = {
  city: /city tour|sightseeing tour|walking tour|hop-on|bus tour|guided tour/i,
  night: /night|evening|after dark/i,
  museum: /museum|gallery|art & culture|\bart\b/i,
  daytrip: /day trip|excursion/i,
  cruise: /cruise|boat tour|sailing/i,
  cooking: /cooking|culinary|food tour|food & drink|wine/i,
  show: /show|theat|concert|performance|cabaret/i,
  activity: /outdoor activit|water sport|adventure|water activit|snorkel|diving/i,
};

/** 투어 종류에 해당하는 태그 ID (최대 limit개). 없으면 빈 배열 */
export function tagIdsFor(category: TourCategory, tags: ViatorTag[], limit = 8): number[] {
  const rule = CATEGORY_TAG_RULES[category];
  return tags.filter((t) => rule.test(t.name)).slice(0, limit).map((t) => t.id);
}

/** ---------- 상품 ---------- */

export interface ViatorProduct {
  productCode: string;
  title: string;
  description: string;
  fromPrice: number;
  currency: string;
  rating: number;
  reviews: number;
  durationMinutes: number;
  productUrl: string;
  flags: string[];
}

export function parseProducts(body: unknown): ViatorProduct[] {
  if (!isObj(body) || !Array.isArray(body.products)) return [];
  const list: ViatorProduct[] = [];
  for (const p of body.products) {
    if (!isObj(p) || typeof p.productCode !== "string" || typeof p.title !== "string") continue;
    const pricing = isObj(p.pricing) ? p.pricing : {};
    const summary = isObj(pricing.summary) ? pricing.summary : {};
    const fromPrice = Number(summary.fromPrice);
    const productUrl = typeof p.productUrl === "string" ? p.productUrl : "";
    if (!Number.isFinite(fromPrice) || fromPrice <= 0 || !productUrl) continue;

    const reviews = isObj(p.reviews) ? p.reviews : {};
    const duration = isObj(p.duration) ? p.duration : {};
    list.push({
      productCode: p.productCode,
      title: p.title,
      description: typeof p.description === "string" ? p.description : "",
      fromPrice,
      currency: typeof pricing.currency === "string" ? pricing.currency : "",
      rating: Number(reviews.combinedAverageRating) || 0,
      reviews: Number(reviews.totalReviews) || 0,
      durationMinutes: Number(duration.fixedDurationInMinutes) || Number(duration.variableDurationFromMinutes) || 0,
      productUrl,
      flags: Array.isArray(p.flags) ? p.flags.filter((f): f is string => typeof f === "string") : [],
    });
  }
  return list;
}

/** 후기 수를 반영한 점수. 후기가 적은 5.0점보다 후기가 많은 4.7점이 위로 오게 한다. */
export function qualityScore(p: Pick<ViatorProduct, "rating" | "reviews">): number {
  const PRIOR_RATING = 4;
  const PRIOR_WEIGHT = 20;
  return (p.rating * p.reviews + PRIOR_RATING * PRIOR_WEIGHT) / (p.reviews + PRIOR_WEIGHT);
}

/** 후기가 5건 이상인 상품을 점수 순으로 고른다. 그런 상품이 너무 적으면 모두 대상으로 한다. */
export function pickTopProducts(products: ViatorProduct[], limit: number): ViatorProduct[] {
  const established = products.filter((p) => p.reviews >= 5);
  const pool = established.length >= Math.min(3, limit) ? established : products;
  return [...pool].sort((a, b) => qualityScore(b) - qualityScore(a)).slice(0, limit);
}

const FLAG_NOTES: [string, string][] = [
  ["FREE_CANCELLATION", "무료 취소 가능"],
  ["SKIP_THE_LINE", "줄서기 생략"],
  ["PRIVATE_TOUR", "프라이빗 투어"],
  ["LIKELY_TO_SELL_OUT", "매진 잦음"],
];

const shorten = (text: string, max: number) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
};

/** Viator 상품을 투어 후보로 바꿔 기존 "일정에 넣기 / 선택 옵션으로 추가" 흐름을 그대로 쓴다. */
export function productToTour(p: ViatorProduct, category: TourCategory): TourCandidate {
  const notes = FLAG_NOTES.filter(([flag]) => p.flags.includes(flag)).map(([, label]) => label);
  return {
    name: p.title,
    category,
    description: shorten(p.description, 160),
    durationMinutes: Math.max(0, Math.round(p.durationMinutes)),
    priceLow: p.fromPrice,
    priceHigh: p.fromPrice,
    priceBasis: "market",
    market: {
      productCode: p.productCode,
      rating: p.rating,
      reviews: p.reviews,
      freeCancellation: p.flags.includes("FREE_CANCELLATION"),
    },
    includes: "",
    booking: ["Viator 정가 기준, 2인 이상 그룹의 1인 최저 요금", ...notes].join(" · "),
    koreanGuide: false,
    koreanNote: "",
    highlights: p.reviews > 0 ? `★ ${p.rating.toFixed(1)} (후기 ${p.reviews.toLocaleString("en-US")}건)` : "",
    operator: "",
    sourceName: "Viator",
    searchUrl: p.productUrl,
  };
}
