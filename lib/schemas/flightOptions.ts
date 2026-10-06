import { z } from "zod";
import { fillFlightDates, normalizeClock } from "@/lib/flightNormalize";
import type { FlightOption } from "@/types";

const CURRENCIES = ["KRW", "USD", "EUR", "JPY", "GBP", "CNY", "THB", "VND", "SGD", "AUD"] as const;

/** ---------- 클라이언트 → 서버 요청 ---------- */

export const flightOptionsRequestSchema = z.object({
  origin: z.string().trim().min(1, "출발지를 입력해 주세요.").max(60),
  destination: z.string().trim().min(1, "여행지를 입력해 주세요.").max(100),
  /** 여행 일수 (귀국일 계산용) */
  days: z.number().int().min(2).max(31),
  /**
   * 숙박 수. days − 1이면 표준 일정(마지막 날 귀국편 탑승), days − 2면 귀국편이 심야 항공편이라
   * 기내에서 하룻밤을 보내는 일정이다. 귀국편 출발일 계산에 쓴다(출발일 + nights일째 = 귀국편 출발일).
   */
  nights: z.number().int().min(0).max(30),
  /** 출발 희망일 YYYY-MM-DD. 비우면 "가까운 시일"로 조사한다 */
  departureDate: z.string().trim().max(20).default(""),
  currency: z.enum(CURRENCIES),
});

export type FlightOptionsRequest = z.infer<typeof flightOptionsRequestSchema>;

/** ---------- LLM 응답 ---------- */

const flightSchema = z.object({
  airline: z.string().describe("항공사 이름 (예: 대한항공). 확인 못하면 빈 문자열"),
  flightNumber: z.string().describe("편명(가는 편, 예: KE651). 확인 못하면 빈 문자열"),
  departDate: z.string().describe("가는 편 출발일 YYYY-MM-DD. 확인 못하면 빈 문자열"),
  departAirport: z.string().describe("가는 편 출발 공항과 코드 (예: 인천(ICN))"),
  departTime: z.string().describe("가는 편 출발 시각 (예: 09:20). 확인 못하면 빈 문자열"),
  arriveAirport: z.string().describe("가는 편 도착 공항과 코드"),
  arriveTime: z.string().describe("가는 편 도착 시각. 확인 못하면 빈 문자열"),
  stops: z.number().describe("가는 편 경유 횟수. 직항이면 0"),
  duration: z.string().describe("가는 편 총 비행시간 (예: 5시간 30분). 확인 못하면 빈 문자열"),
  price: z.number().describe("왕복 이코노미 1인 요금 (요청 통화). 확인 못하면 0"),
  basis: z.enum(["searched", "estimated"]).describe("검색 결과 페이지에서 실제 확인했으면 searched, 아니면 estimated"),
  sourceName: z.string().describe("확인한 사이트 이름. 확인 못하면 빈 문자열"),
  link: z.string().describe("이 항공편(또는 노선)을 검색·예약할 수 있는 URL. 확인 못하면 빈 문자열"),
  returnFlightNumber: z.string().describe("귀국편(돌아오는 편) 편명. 확인 못하면 빈 문자열"),
  returnDepartDate: z.string().describe("귀국편 출발일 YYYY-MM-DD. 확인 못하면 빈 문자열"),
  returnDepartAirport: z.string().describe("귀국편 출발 공항과 코드 (여행지 공항)"),
  returnDepartTime: z.string().describe("귀국편 출발 시각. 확인 못하면 빈 문자열"),
  returnArriveAirport: z.string().describe("귀국편 도착 공항과 코드 (출발지 공항)"),
  returnArriveTime: z.string().describe("귀국편 도착 시각 (다음날 도착이면 그렇다고 duration이나 시각에 표기). 확인 못하면 빈 문자열"),
  returnStops: z.number().describe("귀국편 경유 횟수. 직항이면 0"),
  returnDuration: z.string().describe("귀국편 총 비행시간. 확인 못하면 빈 문자열"),
});

export const flightOptionsResponseSchema = z.object({
  flights: z.array(flightSchema).max(10).describe("실제로 확인된 항공편만. 최대 10개"),
});

type Parsed = z.infer<typeof flightOptionsResponseSchema>;

function fallbackLink(origin: string, destination: string): string {
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${origin} to ${destination}`)}`;
}

/** 도착 시각이 출발보다 이르면(자정을 넘긴 비행) 다음날 표시를 붙인다 */
function arrival(departTime: string, arriveText: string): string {
  const arrive = normalizeClock(arriveText);
  if (!arrive || arrive.endsWith("(+1)") || !departTime) return arrive;
  return arrive < departTime.slice(0, 5) ? `${arrive} (+1)` : arrive;
}

/** 모델이 만든 링크는 http(s)만 쓴다 (그 밖의 형식은 검색 링크로 대신) */
const safeLink = (link: string) => (/^https?:\/\//i.test(link.trim()) ? link.trim() : "");

/** 검증된 LLM 응답을 앱 내부 타입으로 다듬는다 — 시각·날짜 형식을 맞추고, 같은 항공편이 두 번 오면 하나만 남긴다 */
export function toFlightOptions(parsed: Parsed, req: FlightOptionsRequest, searched: boolean): FlightOption[] {
  const seen = new Set<string>();
  const out: FlightOption[] = [];
  for (const f of parsed.flights) {
    const basis = searched ? f.basis : "estimated";
    const departTime = normalizeClock(f.departTime).slice(0, 5);
    const returnDepartTime = normalizeClock(f.returnDepartTime).slice(0, 5);
    const dates = fillFlightDates(f.departDate, f.returnDepartDate, req);
    const option: FlightOption = {
      airline: f.airline.trim(),
      flightNumber: f.flightNumber.trim().toUpperCase(),
      departDate: dates.departDate,
      departAirport: f.departAirport.trim(),
      departTime,
      arriveAirport: f.arriveAirport.trim(),
      arriveTime: arrival(departTime, f.arriveTime),
      stops: Math.max(0, Math.round(f.stops)),
      duration: f.duration.trim(),
      price: Math.max(0, Math.round(f.price)),
      basis,
      sourceName: basis === "searched" ? f.sourceName.trim() : "",
      link: safeLink(f.link) || fallbackLink(req.origin.trim(), req.destination.trim()),
      returnFlightNumber: f.returnFlightNumber.trim().toUpperCase(),
      returnDepartDate: dates.returnDepartDate,
      returnDepartAirport: f.returnDepartAirport.trim(),
      returnDepartTime,
      returnArriveAirport: f.returnArriveAirport.trim(),
      returnArriveTime: arrival(returnDepartTime, f.returnArriveTime),
      returnStops: Math.max(0, Math.round(f.returnStops)),
      returnDuration: f.returnDuration.trim(),
    };
    const key = [option.flightNumber || option.airline, option.departDate, option.departTime, option.returnFlightNumber, option.returnDepartTime].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(option);
  }
  return out;
}
