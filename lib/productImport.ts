/**
 * 링크로 읽은 다른 여행사 상품 → 우리 입력값.
 *  - "그대로": 업체 코스 붙여넣기 모드로 날짜별 일정 원문을 넣는다 (그 상품 코스를 그대로 견적)
 *  - "기준으로 우리 코스": AI 모드로 같은 기간·항공 시각·주요 방문지(꼭 넣을 것)로 우리 코스를 만든다
 * 두 경우 모두 판매가를 "판매가에서 시작"(fixed_price)으로 넣어 원가 예산을 역계산하고, 경쟁 상품으로도 등록한다.
 */
import type { ProductImportResponse } from "@/lib/schemas/productImport";
import type { Competitor, FlightOption, TripInput } from "@/types";

/**
 * 링크 주소에서 바로 읽는 값 — 네이버 패키지 주소는 ".../products/{여행사}/{상품코드}-{출발일 YYYYMMDD}".
 * AI가 다른 출발일 상품을 찾아 섞지 않도록, 주소에 있는 출발일·상품 코드를 우선한다.
 */
export function linkFacts(raw: string): { departureDate: string; productCode: string; agencySlug: string } {
  let path = "";
  try {
    path = new URL(raw).pathname;
  } catch {
    return { departureDate: "", productCode: "", agencySlug: "" };
  }
  const m = /\/products\/([^/]+)\/([A-Za-z0-9_]+?)-(20\d{2})(\d{2})(\d{2})(?:\/|$)/.exec(path);
  if (!m) {
    const d = /(?:^|[^\d])(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?:[^\d]|$)/.exec(path);
    return { departureDate: d ? `${d[1]}-${d[2]}-${d[3]}` : "", productCode: "", agencySlug: "" };
  }
  const [, agencySlug, productCode, y, mo, da] = m;
  const ok = Number(mo) >= 1 && Number(mo) <= 12 && Number(da) >= 1 && Number(da) <= 31;
  return { departureDate: ok ? `${y}-${mo}-${da}` : "", productCode, agencySlug };
}

/** 일정 원문을 날짜(제1일·DAY 1·1일차)로 나눠 날짜별 줄 수 — 빠진 날을 화면에서 바로 보이게 */
export function courseDayCounts(text: string): { day: number; lines: number }[] {
  const out: { day: number; lines: number }[] = [];
  const head = /^\s*(?:\[?\s*)?(?:제\s*(\d{1,2})\s*일|DAY\s*(\d{1,2})|(\d{1,2})\s*일\s*차|(\d{1,2})일\s*(?=[(\s:]))/i;
  for (const line of text.split(/\r?\n/)) {
    const m = head.exec(line);
    if (m) {
      const day = Number(m[1] ?? m[2] ?? m[3] ?? m[4]);
      // 머리 줄 뒤에 날짜·요일만 있으면 줄로 세지 않는다 ("제1일 (12/09 수)"), 장소가 같이 적혔으면 센다
      out.push({ day, lines: /[가-힣A-Za-z]{2,}/.test(line.replace(head, "").replace(/[월화수목금토일]요일/g, "")) ? 1 : 0 });
    } else if (out.length && line.trim()) out[out.length - 1].lines++;
  }
  return out;
}

/** 일정 원문에 항공 시각이 빠졌으면 앞에 항공 줄을 붙인다 (코스 분석이 첫날·마지막 날 시각을 읽도록) */
export function courseTextWithFlight(text: string, f: FlightOption | null): string {
  if (!f) return text;
  const has = (t: string) => !t || text.includes(t);
  if (has(f.departTime) && has(f.returnDepartTime)) return text;
  const leg = (label: string, no: string, from: string, dep: string, to: string, arr: string) =>
    dep ? `${label}: ${[f.airline, no].filter(Boolean).join(" ")} ${from} ${dep} 출발 → ${to} ${arr || "?"} 도착`.replace(/\s+/g, " ").trim() : "";
  const lines = [
    leg("가는 편 (제1일)", f.flightNumber, f.departAirport, f.departTime, f.arriveAirport, f.arriveTime),
    leg("오는 편 (마지막 날)", f.returnFlightNumber, f.returnDepartAirport, f.returnDepartTime, f.returnArriveAirport, f.returnArriveTime),
  ].filter(Boolean);
  return `[항공]\n${lines.join("\n")}\n\n${text}`;
}

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
  // 링크 주소의 출발일이 AI가 읽은 날짜보다 확실하다
  const departureDate = linkFacts(r.url).departureDate || (/^\d{4}-\d{2}-\d{2}$/.test(r.departureDate) ? r.departureDate : "");
  const period = r.days > 0 ? { days: Math.min(14, r.days), nights: Math.min(30, r.nights) } : {};
  const common: Partial<TripInput> = {
    ...(r.destination ? { destination: r.destination.slice(0, 100) } : {}),
    ...(departureDate ? { departureDate } : {}),
    ...period,
    tripScope: "overseas",
    ...(flight ? { includesFlights: true, selectedFlight: flight, packageType: "full" as const } : {}),
    ...(r.pricePerPerson > 0 ? { pricingMode: "fixed_price" as const, fixedPricePerPerson: r.pricePerPerson } : {}),
    competitors: [...input.competitors.filter((c) => c.source?.url !== r.url), competitorFromImport(r)],
  };
  if (how === "copy") return { ...common, mode: "paste", courseText: courseTextWithFlight(r.courseText, flight).slice(0, 20_000) };
  const must = r.mustSee.join(", ").slice(0, 300);
  return { ...common, mode: "ai", ...(must ? { mustHave: must } : {}) };
}
