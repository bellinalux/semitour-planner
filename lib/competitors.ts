import type { Competitor, CompetitorCandidate, TourPolicy } from "@/types";

/** 검색 결과의 "노쇼핑/노옵션" 표기를 정책 값으로 바꾼다. 언급이 없으면 단정하지 않는다. */
function policyOf(isNone: boolean, unknown: boolean): TourPolicy {
  if (isNone) return "none";
  return unknown ? "unknown" : "some";
}

/** 찾은 경쟁 상품을 경쟁사 목록에 넣을 형태로 바꾼다 */
export function candidateToCompetitor(candidate: CompetitorCandidate, foundAt: string): Competitor {
  const span = candidate.nights > 0 && candidate.days > 0 ? `${candidate.nights}박 ${candidate.days}일` : "";
  const note = [
    span,
    candidate.hotelGrade,
    candidate.noShopping ? "노쇼핑" : "",
    candidate.noOption ? "노옵션" : "",
    candidate.highlight,
    candidate.priceNote,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    id: crypto.randomUUID(),
    name: [candidate.agency, candidate.productName].filter(Boolean).join(" ").slice(0, 120),
    price: candidate.pricePerPerson,
    includes: { ...candidate.includes },
    shopping: policyOf(candidate.noShopping, candidate.policyUnknown),
    optionTour: policyOf(candidate.noOption, candidate.policyUnknown),
    note: note.slice(0, 200),
    places: candidate.places,
    hotelGrade: candidate.hotelGrade,
    nights: candidate.nights,
    days: candidate.days,
    source: {
      agency: candidate.agency,
      url: candidate.searchUrl,
      sourceName: candidate.sourceName,
      basis: candidate.basis,
      foundAt,
    },
  };
}

/** 경쟁사 가격이 이 일수보다 오래됐으면 "오래된 가격"으로 경고한다 (여행 상품 가격은 시즌·요일에 따라 자주 바뀐다) */
export const STALE_PRICE_DAYS = 14;

/** 경쟁사 가격을 확인한 지 며칠 됐는지. 검색으로 찾은 상품은 찾은 시각, 직접 입력한 상품은 마지막 수정 시각 기준. 알 수 없으면 null */
export function priceAgeDays(competitor: Competitor, now = Date.now()): number | null {
  const stamp = competitor.source?.foundAt || competitor.priceCheckedAt;
  if (!stamp) return null;
  const t = Date.parse(stamp);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / (24 * 60 * 60 * 1000)));
}

/** 이미 목록에 있는 상품인지 (같은 이름이면 같은 상품으로 본다) */
export function isAlreadyAdded(competitors: Competitor[], candidate: CompetitorCandidate): boolean {
  const name = [candidate.agency, candidate.productName].filter(Boolean).join(" ").trim();
  return competitors.some((c) => c.name.trim() === name);
}

/**
 * 자동 견적에 넣을 경쟁 상품을 고른다 — 가격이 확인된 것 중, 다른 상품들 가운데값의 30%도 안 되는 것은
 * 일일 투어·입장권처럼 비교 대상이 아닌 상품일 가능성이 커서 뺀다.
 */
export function pickComparableCompetitors(products: CompetitorCandidate[], max = 3): CompetitorCandidate[] {
  const priced = products.filter((p) => p.pricePerPerson > 0);
  const sorted = priced.map((p) => p.pricePerPerson).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  return priced.filter((p) => p.pricePerPerson >= median * 0.3).slice(0, max);
}

export interface CompetitorRefresh {
  competitors: Competitor[];
  /** 새로 고친 상품 이름 */
  updated: string[];
  /** 다시 조회에서 못 찾은 상품 이름 (그대로 둔다) */
  missing: string[];
}

/**
 * 다시 조회한 결과로, 검색으로 넣었던 경쟁 상품을 새로 고친다 — 방문지·호텔 등급·일정 길이를 채우고 가격·확인 시각을 갱신한다.
 * 직접 입력한 상품과, 찾은 뒤 사람이 직접 고친 가격은 그대로 둔다. 같은 상품은 이름 → 상품 페이지 주소 → 같은 여행사 순으로 찾는다.
 */
export function refreshCompetitors(existing: Competitor[], products: CompetitorCandidate[], searchedAt: string): CompetitorRefresh {
  const unused = [...products];
  const take = (match: (p: CompetitorCandidate) => boolean) => {
    const i = unused.findIndex(match);
    return i < 0 ? undefined : unused.splice(i, 1)[0];
  };
  const updated: string[] = [];
  const missing: string[] = [];
  const competitors = existing.map((c) => {
    if (!c.source) return c;
    const name = c.name.trim();
    const found =
      take((p) => [p.agency, p.productName].filter(Boolean).join(" ").trim() === name) ??
      take((p) => p.linkIsDirect && p.searchUrl !== "" && p.searchUrl === c.source?.url) ??
      take((p) => p.agency !== "" && p.agency === c.source?.agency);
    if (!found) {
      missing.push(c.name);
      return c;
    }
    updated.push(c.name);
    const editedByHand = Boolean(c.priceCheckedAt && Date.parse(c.priceCheckedAt) > Date.parse(c.source.foundAt));
    const keepPrice = editedByHand || found.pricePerPerson <= 0;
    return {
      ...c,
      price: keepPrice ? c.price : found.pricePerPerson,
      places: found.places.length > 0 ? found.places : c.places,
      hotelGrade: found.hotelGrade || c.hotelGrade,
      nights: found.nights || c.nights,
      days: found.days || c.days,
      source: keepPrice ? c.source : { ...c.source, foundAt: searchedAt },
    };
  });
  return { competitors, updated, missing };
}
