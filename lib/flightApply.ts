import { clockDiffMinutes, clockMinutes, shiftClock } from "@/lib/dayLoad";
import { addDays, parseDate } from "@/lib/documents";
import { mapDayItems } from "@/lib/itinerary";
import type { DayPlan, FlightOption, ItineraryItem, TripInput } from "@/types";

const stopsText = (stops: number) => (stops === 0 ? "직항" : `경유 ${stops}회`);

interface FlightLeg {
  airline: string;
  flightNumber: string;
  departAirport: string;
  departTime: string;
  arriveAirport: string;
  arriveTime: string;
  stops: number;
  duration: string;
}

function legLine(leg: FlightLeg): string {
  const parts = [
    [leg.airline, leg.flightNumber].filter(Boolean).join(" "),
    leg.departAirport && leg.departTime ? `${leg.departAirport} ${leg.departTime} 출발` : "",
    leg.arriveAirport && leg.arriveTime ? `${leg.arriveAirport} ${leg.arriveTime} 도착` : "",
    stopsText(leg.stops),
    leg.duration,
  ].filter(Boolean);
  return parts.join(" · ");
}

/**
 * "공항"과 "출발"/"도착"이 함께 있는 이름이면 항공편 항목으로 본다.
 * 코스 붙여넣기 AI가 이런 항목을 flight 대신 transfer로 잘못 분류하는 경우가 있어서
 * (예: "출발 국제공항 출발"을 단순 이동으로 착각), type이 명백히 다른 유형(관광·식사 등)이
 * 아닌 한 이름으로도 한 번 더 확인한다.
 */
function looksLikeFlightItem(item: ItineraryItem): boolean {
  if (item.type === "flight") return true;
  if (item.type !== undefined && item.type !== "transfer") return false;
  return item.name.includes("공항") && (item.name.includes("출발") || item.name.includes("도착"));
}

/** 모든 목록(하루 전체·오전·오후 A/B)을 통틀어 그 날짜의 항공편 항목만, 원래 순서대로 모은다 */
function flightItemsOfDay(day: DayPlan): ItineraryItem[] {
  return [...day.items, ...day.amGuided, ...day.pmFreeOptions.flatMap((o) => o.items)].filter(looksLikeFlightItem);
}

interface FlightGroup {
  dayIndex: number;
  items: ItineraryItem[];
}

/** 그 날짜 목록에서 대상 항목보다 앞에 있는 항목들의 체류+이동 시간 합계(분) */
function precedingMinutes(items: ItineraryItem[], targetId: string): number {
  let sum = 0;
  for (const item of items) {
    if (item.id === targetId) break;
    sum += Math.max(0, item.stayMinutes) + Math.max(0, item.travelMinutesToNext ?? 0);
  }
  return sum;
}

/**
 * 그 날짜의 오전 미팅 시각을, 지정한 항목의 계산된 시작 시각이 anchorTime(실제 항공편 시각)과
 * 정확히 맞도록 거꾸로 계산해서 맞춘다. 항공 항목이 그 날짜의 첫 항목이 아니어도(귀국일의 체크아웃·
 * 공항 이동처럼 앞에 다른 항목이 있어도) 앞선 항목들의 소요 시간만큼 빼서 계산하므로 동작한다.
 */
function anchorMeetingTime(days: DayPlan[], dayIndex: number, itemId: string, anchorTime: string): DayPlan[] {
  const day = days[dayIndex];
  const items = day.kind === "linear" ? day.items : day.amGuided;
  const meetingTime = shiftClock(anchorTime, -precedingMinutes(items, itemId));
  if (!meetingTime) return days;
  return days.map((d, i) => (i === dayIndex ? { ...d, meetingTime } : d));
}

/**
 * 선택한 항공편의 가는 편·귀국편 정보를 일정의 항공(flight) 항목에 반영한다.
 *  - 가는 편은 첫 날짜(day[0]), 귀국편은 마지막 날짜(day[N-1])에서만 항공 항목을 찾는다.
 *    코스 붙여넣기 AI가 중간 날짜의 "출국수속"·"공항 이동" 같은 항목을 항공(flight)으로 잘못
 *    분류하는 경우가 있는데, 예전에는 "항공 항목이 있는 첫/마지막 날짜"를 그대로 가는 편/귀국편으로
 *    봐서 그런 항목이 엉뚱한 날짜(예: 귀국일이 아닌 그 전날)에 실제 항공편 시각을 덮어써 버리는
 *    문제가 있었다. 여행 일정에서 가는 편은 항상 첫날, 귀국편은 항상 마지막 날이므로 이렇게
 *    제한하면 안전하다.
 *  - 그 날짜에 항공 항목이 출발·도착 2개로 나뉘어 있으면(예: 붙여넣은 코스) 각각 이름·설명을 채우고,
 *    두 항목의 시각 차이만큼 이동 시간을 채워 이어지는 항목들의 시작 시각이 실제 도착 시각에 맞춰진다.
 *  - 항공 항목이 1개뿐이면(항공 이동일 자동 생성 등) 설명만 채운다.
 *  - 두 경우 모두, 그 날짜의 오전 미팅 시각을 거꾸로 계산해 출발 항목(귀국편도 "출발" 시각 기준)의
 *    계산된 시작 시각이 실제 출발 시각과 맞도록 맞춘다. 앞에 체크아웃·공항 이동처럼 다른 항목이 있어도 된다.
 *  - 항공 항목이 없는 일정은 아무것도 바뀌지 않는다.
 */
export function applyFlightToDays(days: DayPlan[], flight: FlightOption): DayPlan[] {
  if (days.length === 0) return days;
  const lastIndex = days.length - 1;
  const outboundItems = flightItemsOfDay(days[0]);
  const returnItems = lastIndex > 0 ? flightItemsOfDay(days[lastIndex]) : [];
  if (outboundItems.length === 0 && returnItems.length === 0) return days;

  const outboundGroup: FlightGroup | null = outboundItems.length > 0 ? { dayIndex: 0, items: outboundItems } : null;
  const returnGroup: FlightGroup | null = returnItems.length > 0 ? { dayIndex: lastIndex, items: returnItems } : null;

  const outboundLeg: FlightLeg = {
    airline: flight.airline,
    flightNumber: flight.flightNumber,
    departAirport: flight.departAirport,
    departTime: flight.departTime,
    arriveAirport: flight.arriveAirport,
    arriveTime: flight.arriveTime,
    stops: flight.stops,
    duration: flight.duration,
  };
  const returnLeg: FlightLeg = {
    airline: flight.airline,
    flightNumber: flight.returnFlightNumber,
    departAirport: flight.returnDepartAirport,
    departTime: flight.returnDepartTime,
    arriveAirport: flight.returnArriveAirport,
    arriveTime: flight.returnArriveTime,
    stops: flight.returnStops,
    duration: flight.returnDuration,
  };

  const patches = new Map<string, Partial<ItineraryItem>>();

  function applyLeg(group: FlightGroup | null, leg: FlightLeg) {
    if (!group || !leg.departAirport) return; // 이 편 정보를 확인하지 못했으면 건드리지 않는다
    const line = legLine(leg);
    const gap = leg.departTime && leg.arriveTime ? clockDiffMinutes(leg.departTime, leg.arriveTime) : null;
    if (group.items.length >= 2) {
      const [dep, arr] = group.items;
      patches.set(dep.id, { name: `${leg.departAirport} 출발`, description: line, stayMinutes: 0, travelMinutesToNext: gap ?? dep.travelMinutesToNext });
      patches.set(arr.id, { name: `${leg.arriveAirport} 도착`, description: line });
    } else {
      const only = group.items[0];
      patches.set(only.id, { description: line, travelMinutesToNext: gap ?? only.travelMinutesToNext });
    }
  }

  applyLeg(outboundGroup, outboundLeg);
  applyLeg(returnGroup, returnLeg);

  let next = days.map((day) => mapDayItems(day, (item) => (patches.has(item.id) ? { ...item, ...patches.get(item.id)! } : item)));

  // 가는 편 출발 항목의 계산된 시작 시각이 실제 출발 시각과 맞도록, 그 날짜의 미팅 시각을 거꾸로 맞춘다
  if (outboundGroup && outboundLeg.departTime) {
    next = anchorMeetingTime(next, outboundGroup.dayIndex, outboundGroup.items[0].id, outboundLeg.departTime);
  }
  // 귀국편도 마찬가지로, 출발 항목(항목이 1개뿐이면 그 항목)의 시작 시각을 귀국편 출발 시각에 맞춘다.
  // 체크아웃·공항 이동처럼 앞선 항목이 있어도 그만큼 거슬러 올라가 미팅 시각을 계산하므로 정확히 맞는다.
  if (returnGroup && returnLeg.departTime) {
    next = anchorMeetingTime(next, returnGroup.dayIndex, returnGroup.items[0].id, returnLeg.departTime);
  }

  return next;
}

export interface ReturnDateCheck {
  /** 현재 입력된 여행 일수 기준 귀국일 (출발일+일수를 알 때만) */
  expectedReturnDate: string | null;
  /** 선택한 항공편의 귀국편 출발일 */
  flightReturnDate: string | null;
  /** 두 날짜가 달라서 총 일수를 조정해야 하는 경우 true */
  mismatched: boolean;
  /** 귀국편 날짜에 맞춘 새 총 일수 (mismatched일 때만 의미 있음) */
  suggestedDays: number | null;
}

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** 귀국편 출발 시각보다 도착 시각(표기 그대로)이 더 이르면, 자정을 넘겨 다음날 도착하는 심야편으로 본다. */
function isOvernightReturn(flight: FlightOption): boolean {
  const dep = clockMinutes(flight.returnDepartTime);
  const arr = clockMinutes(flight.returnArriveTime);
  if (dep === null || arr === null) return false;
  return arr < dep;
}

/**
 * 선택한 항공편의 귀국편 출발일이, 현재 설정한 여행 일수·숙박 수로 계산한 귀국편 출발일과 맞는지 확인한다.
 * 귀국편은 항상 "출발일 + 숙박 수(nights)"일에 도착지 공항에서 출발해야 한다 — 표준 일정(숙박 = 일수 − 1)과
 * 심야 귀국편 일정(숙박 = 일수 − 2, 기내에서 하룻밤을 보내고 다음날 한국 도착) 모두 이 규칙 하나로 맞는다.
 * 출발일을 입력하지 않았으면(날짜를 모르면) 비교하지 않는다.
 */
export function checkReturnDate(input: Pick<TripInput, "departureDate" | "days" | "nights">, flight: FlightOption): ReturnDateCheck {
  const start = parseDate(input.departureDate);
  const flightReturn = flight.returnDepartDate.trim();
  if (!start || !flightReturn) {
    return { expectedReturnDate: null, flightReturnDate: flightReturn || null, mismatched: false, suggestedDays: null };
  }
  const expectedText = toIsoDate(addDays(start, input.nights));
  const mismatched = expectedText !== flightReturn;

  let suggestedDays: number | null = null;
  if (mismatched) {
    const flightReturnDate = parseDate(flightReturn);
    if (flightReturnDate) {
      const diffDays = Math.round((flightReturnDate.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
      if (diffDays >= 0) suggestedDays = diffDays + 1 + (isOvernightReturn(flight) ? 1 : 0);
    }
  }

  return { expectedReturnDate: expectedText, flightReturnDate: flightReturn, mismatched, suggestedDays };
}
