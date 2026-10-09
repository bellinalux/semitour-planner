import { postJson } from "@/lib/api";
import { travelRequest } from "@/lib/autoQuoteRequests";
import { candidateToCompetitor, pickComparableCompetitors } from "@/lib/competitors";
import { midpoint } from "@/lib/travelEstimate";
import type { Competitor, CompetitorCandidate, CompetitorItinerary, FlightOption, TravelEstimate, TripInput } from "@/types";

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

/**
 * 경쟁 상품이 항공 포함인데 우리 상품은 항공이 없고 항공료를 모르면, 같은 조건으로 견줄 수 없다.
 * 그때 항공 왕복 시세(1인)를 찾아 돌려준다 — 비교용이라 항공 불포함 상품의 원가에는 더하지 않는다. 필요 없거나 못 찾으면 null.
 */
export async function flightPriceForCompare(input: TripInput, competitors: Competitor[], flight: FlightOption | null = null): Promise<number | null> {
  const needed = input.packageType !== "full" && input.flightPricePerPerson <= 0 && competitors.some((c) => c.includes.flight && c.price > 0);
  if (!needed) return null;
  // 업체 코스표에 항공편(항공사·편명·시각)이 있으면 그 항공편 요금으로 — 일반 노선 시세보다 정확하다 (특히 저비용 항공)
  if (flight?.airline && input.days >= 2) {
    try {
      const r = await postJson<{ estimate: { roundTripLow: number; roundTripHigh: number } }>("/api/search-flight-price", {
        origin: input.originCity.trim() || "인천",
        destination: input.destination.trim(),
        days: Math.min(31, input.days),
        currency: input.currency,
        airline: flight.airline,
        ...(flight.flightNumber ? { flightNumber: flight.flightNumber } : {}),
        ...(/^\d{4}-\d{2}-\d{2}$/.test(input.departureDate) ? { departDate: input.departureDate } : {}),
        ...(flight.departTime ? { departTime: flight.departTime } : {}),
      });
      const price = midpoint(r.estimate.roundTripLow, r.estimate.roundTripHigh);
      if (price > 0) return Math.round(price);
    } catch {
      // 노선 시세로
    }
  }
  try {
    const { estimate } = await postJson<{ estimate: TravelEstimate }>("/api/estimate-travel", travelRequest(input));
    const price = midpoint(estimate.flight.roundTripLow, estimate.flight.roundTripHigh);
    return price > 0 ? Math.round(price) : null;
  } catch {
    return null;
  }
}

/** 경쟁 상품 하나의 날짜별 일정을 판매 페이지에서 읽는다 (서버가 같은 상품은 7일 동안 다시 쓴다) */
export async function fetchCompetitorItinerary(c: Competitor, input: TripInput): Promise<CompetitorItinerary> {
  const r = await postJson<{ itinerary: CompetitorItinerary }>("/api/competitor-itinerary", {
    agency: c.source?.agency ?? "",
    productName: c.name.slice(0, 160),
    url: c.source?.url ?? "",
    destination: input.destination.trim(),
    nights: c.nights ?? 0,
    days: c.days ?? 0,
  });
  return r.itinerary;
}
