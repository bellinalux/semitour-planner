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
    source: {
      agency: candidate.agency,
      url: candidate.searchUrl,
      sourceName: candidate.sourceName,
      basis: candidate.basis,
      foundAt,
    },
  };
}

/** 이미 목록에 있는 상품인지 (같은 이름이면 같은 상품으로 본다) */
export function isAlreadyAdded(competitors: Competitor[], candidate: CompetitorCandidate): boolean {
  const name = [candidate.agency, candidate.productName].filter(Boolean).join(" ").trim();
  return competitors.some((c) => c.name.trim() === name);
}
