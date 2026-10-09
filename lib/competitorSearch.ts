import { postJson } from "@/lib/api";
import { candidateToCompetitor, pickComparableCompetitors } from "@/lib/competitors";
import type { Competitor, CompetitorCandidate, TripInput } from "@/types";

/**
 * 대형 여행사의 같은 여행지·기간 상품을 웹에서 찾아 경쟁사 목록 형태로 돌려준다 (가격이 확인된 비교할 만한 상품만).
 * 자동 견적과 "코스를 만들면 자동 비교"가 함께 쓴다. 서버는 같은 조건을 3일 동안 다시 쓴다.
 */
export async function findCompetitorProducts(input: TripInput): Promise<Competitor[]> {
  const r = await postJson<{ products: CompetitorCandidate[]; searchedAt: string }>("/api/find-competitors", {
    destination: input.destination.trim(),
    nights: input.nights,
    days: input.days,
    currency: input.currency,
    packageType: input.packageType,
    originCity: input.originCity.trim(),
  });
  return pickComparableCompetitors(r.products).map((p) => candidateToCompetitor(p, r.searchedAt));
}
