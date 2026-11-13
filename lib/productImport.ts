/**
 * 링크로 읽은 다른 여행사 상품 → 우리 입력값.
 *  - "그대로": 업체 코스 붙여넣기 모드로 날짜별 일정 원문을 넣는다 (그 상품 코스를 그대로 견적)
 *  - "기준으로 우리 코스": AI 모드로 같은 기간·항공 시각·주요 방문지(꼭 넣을 것)로 우리 코스를 만든다
 * 두 경우 모두 판매가를 "판매가에서 시작"(fixed_price)으로 넣어 원가 예산을 역계산하고, 경쟁 상품으로도 등록한다.
 */
import type { ProductImportResponse } from "@/lib/schemas/productImport";
import type { Competitor, FlightOption, TripInput } from "@/types";

const clock = (s: string) => /(\d{1,2}):(\d{2})/.exec(s)?.[0]?.padStart(5, "0") ?? "";

/** 가는 편·오는 편 시각이 다 있으면 고른 항공편으로 */
export function flightFromImport(r: ProductImportResponse): FlightOption | null {
  const o = r.outbound;
  const b = r.inbound;
  if (!clock(o.departTime) || !clock(o.arriveTime) || !clock(b.departTime)) return null;
  return {
    airline: o.airline,
    flightNumber: o.flightNumber,
    departDate: o.date || r.departureDate,
    departAirport: o.departAirport,
    departTime: clock(o.departTime),
    arriveAirport: o.arriveAirport,
    arriveTime: o.arriveTime.trim(),
    stops: 0,
    duration: "",
    price: 0,
    basis: "searched",
    sourceName: r.agency || "상품 페이지",
    link: r.url,
    returnFlightNumber: b.flightNumber,
    returnDepartDate: b.date,
    returnDepartAirport: b.departAirport,
    returnDepartTime: clock(b.departTime),
    returnArriveAirport: b.arriveAirport,
    returnArriveTime: b.arriveTime.trim(),
    returnStops: 0,
    returnDuration: "",
  };
}

export function competitorFromImport(r: ProductImportResponse): Competitor {
  return {
    id: `link-${Date.now().toString(36)}`,
    name: `${r.agency ? `${r.agency} ` : ""}${r.productName}`.trim().slice(0, 80) || "링크 상품",
    price: r.pricePerPerson,
    includes: { guide: true, meals: true, admission: true, vehicle: true, hotel: !!r.hotel || r.nights > 0, flight: !!flightFromImport(r) },
    shopping: r.shopping > 0 ? "some" : r.shopping === 0 ? "none" : "unknown",
    optionTour: r.optionTours.length > 0 ? "some" : "unknown",
    note: [r.priceNote, r.guideFee].filter(Boolean).join(" · ").slice(0, 200),
    source: { agency: r.agency, url: r.url, sourceName: r.agency || "상품 링크", basis: "searched", foundAt: new Date().toISOString() },
    places: r.mustSee,
    nights: r.nights,
    days: r.days,
    ...(r.hotel ? { hotelGrade: r.hotel.slice(0, 40) } : {}),
  } as Competitor;
}

/** 원가 예산 역계산 한 줄 — 판매가에서 판매 수수료·목표 마진을 뺀 1인 원가 상한 */
export function reverseBudget(price: number, input: Pick<TripInput, "targetMarginRate" | "cardFeeRate">): number {
  return Math.max(0, Math.round(price * (1 - input.targetMarginRate / 100 - input.cardFeeRate / 100)));
}

export function importPatch(r: ProductImportResponse, input: TripInput, how: "copy" | "ours"): Partial<TripInput> {
  const flight = flightFromImport(r);
  const period = r.days > 0 ? { days: Math.min(14, r.days), nights: Math.min(30, r.nights) } : {};
  const common: Partial<TripInput> = {
    ...(r.destination ? { destination: r.destination.slice(0, 100) } : {}),
    ...(r.departureDate && /^\d{4}-\d{2}-\d{2}$/.test(r.departureDate) ? { departureDate: r.departureDate } : {}),
    ...period,
    tripScope: "overseas",
    ...(flight ? { includesFlights: true, selectedFlight: flight, packageType: "full" as const } : {}),
    ...(r.pricePerPerson > 0 ? { pricingMode: "fixed_price" as const, fixedPricePerPerson: r.pricePerPerson } : {}),
    competitors: [...input.competitors.filter((c) => c.source?.url !== r.url), competitorFromImport(r)],
  };
  if (how === "copy") return { ...common, mode: "paste", courseText: r.courseText.slice(0, 20_000) };
  const must = r.mustSee.join(", ").slice(0, 300);
  return { ...common, mode: "ai", ...(must ? { mustHave: must } : {}) };
}
