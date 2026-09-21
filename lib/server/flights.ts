import { monthlyCheapest, parseCalendarResponse, upcomingMonths, usableDeals } from "@/lib/flightData";
import type { FlightRequest } from "@/lib/schemas/market";
import type { FlightDeal, FlightPlace, FlightSearchResult } from "@/types";
import { ExternalError, fetchJson, isRecord, readSecret } from "./external";
import { asIataCode, resolvePlace } from "./places";

const DEFAULT_BASE_URL = "https://api.travelpayouts.com";

function baseUrl(): string {
  return (process.env.TRAVELPAYOUTS_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/** 출발까지 최소 이 정도 여유가 있는 날짜만 추천한다 */
const MIN_LEAD_DAYS = 14;
const TOP_DEALS = 8;

async function resolveAirport(text: string, role: string): Promise<FlightPlace> {
  const code = asIataCode(text);
  if (code) return { code, label: code };
  const place = await resolvePlace(text);
  if (!place.iata) {
    throw new ExternalError(
      "NOT_FOUND",
      `${role} "${text}"의 공항 코드를 찾지 못했습니다. ICN, BKK처럼 영문 3글자 코드로 직접 입력해 보세요.`,
      422,
    );
  }
  return { code: place.iata, label: `${place.city} (${place.iata})` };
}

async function fetchMonth(token: string, req: FlightRequest, origin: string, destination: string, month: string, tripDays: number) {
  const params = new URLSearchParams({
    origin,
    destination,
    depart_date: month,
    calendar_type: "departure_date",
    length: String(tripDays),
    currency: req.currency.toLowerCase(),
  });
  const res = await fetchJson(
    `${baseUrl()}/v1/prices/calendar?${params}`,
    { headers: { "X-Access-Token": token, "Accept-Encoding": "gzip, deflate" } },
    20_000,
    "항공 시세(Travelpayouts)",
  );

  if (res.status === 401 || res.status === 403) {
    throw new ExternalError("UPSTREAM", "Travelpayouts 토큰이 올바르지 않습니다. 서버에 등록한 TRAVELPAYOUTS_TOKEN 값을 확인해 주세요.", 502);
  }
  if (res.status === 429) {
    throw new ExternalError("UPSTREAM", "항공 시세 조회 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.", 429);
  }
  if (!res.ok) {
    const detail = isRecord(res.body) && typeof res.body.error === "string" ? `: ${res.body.error.slice(0, 100)}` : "";
    throw new ExternalError("UPSTREAM", `항공 시세 서버 오류 (${res.status})${detail}`, 502);
  }
  if (isRecord(res.body) && res.body.success === false) {
    const detail = typeof res.body.error === "string" ? res.body.error.slice(0, 100) : "알 수 없는 오류";
    throw new ExternalError("UPSTREAM", `항공 시세를 가져오지 못했습니다: ${detail}`, 502);
  }
  return parseCalendarResponse(res.body);
}

/** 출발일별 캐시 최저가를 모아 가장 싼 출발일 후보를 돌려준다. */
export async function searchFlights(req: FlightRequest): Promise<FlightSearchResult> {
  const token = readSecret("TRAVELPAYOUTS_TOKEN");
  if (!token) {
    throw new ExternalError(
      "NO_KEY",
      "항공 시세 조회용 키(TRAVELPAYOUTS_TOKEN)가 등록되지 않았습니다. 키를 등록하기 전에는 아래 'AI로 항공·숙박 시세 추정'을 사용하세요.",
      503,
    );
  }

  const [origin, destination] = await Promise.all([resolveAirport(req.origin, "출발지"), resolveAirport(req.destination, "여행지")]);
  if (origin.code === destination.code) {
    throw new ExternalError("NOT_FOUND", "출발지와 여행지의 공항 코드가 같습니다. 코드를 확인해 주세요.", 422);
  }

  const tripDays = Math.max(1, req.days - 1);
  const today = new Date().toISOString().slice(0, 10);
  const months = upcomingMonths(today, req.months);

  const settled = await Promise.allSettled(months.map((m) => fetchMonth(token, req, origin.code, destination.code, m, tripDays)));
  const fulfilled = settled.filter((s): s is PromiseFulfilledResult<FlightDeal[]> => s.status === "fulfilled");
  if (fulfilled.length === 0) {
    const first = settled[0];
    throw first?.status === "rejected" ? first.reason : new ExternalError("UPSTREAM", "항공 시세를 가져오지 못했습니다.", 502);
  }

  const deals = usableDeals(fulfilled.flatMap((s) => s.value), today, MIN_LEAD_DAYS);
  return {
    origin,
    destination,
    currency: req.currency,
    tripDays,
    deals: deals.slice(0, TOP_DEALS),
    byMonth: monthlyCheapest(deals),
  };
}
