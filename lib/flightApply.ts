import { clockDiffMinutes } from "@/lib/dayLoad";
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

/** 모든 목록(하루 전체·오전·오후 A/B)을 통틀어 그 날짜의 항공(flight) 유형 항목만, 원래 순서대로 모은다 */
function flightItemsOfDay(day: DayPlan): ItineraryItem[] {
  return [...day.items, ...day.amGuided, ...day.pmFreeOptions.flatMap((o) => o.items)].filter((i) => i.type === "flight");
}

interface FlightGroup {
  dayIndex: number;
  items: ItineraryItem[];
}

/**
 * 선택한 항공편의 가는 편·귀국편 정보를 일정의 항공(flight) 항목에 반영한다.
 *  - 항공 항목이 있는 첫 날짜를 가는 편, 마지막 날짜를 귀국편으로 본다.
 *  - 그 날짜에 항공 항목이 출발·도착 2개로 나뉘어 있으면(예: 붙여넣은 코스) 각각 이름·설명을 채우고,
 *    두 항목의 시각 차이만큼 이동 시간을 채워 이어지는 항목들의 시작 시각이 실제 도착 시각에 맞춰진다.
 *  - 항공 항목이 1개뿐이면(항공 이동일 자동 생성 등) 설명만 채운다.
 *  - 가는 편 항공 항목이 그 날짜의 첫 항목이면, 그 날짜의 오전 미팅 시각을 가는 편 출발 시각으로 맞춘다.
 *  - 항공 항목이 없는 일정은 아무것도 바뀌지 않는다.
 */
export function applyFlightToDays(days: DayPlan[], flight: FlightOption): DayPlan[] {
  const groups: FlightGroup[] = [];
  days.forEach((day, dayIndex) => {
    const items = flightItemsOfDay(day);
    if (items.length > 0) groups.push({ dayIndex, items });
  });
  if (groups.length === 0) return days;

  const outboundGroup = groups[0];
  const returnGroup = groups.length > 1 ? groups[groups.length - 1] : null;

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
  if (returnGroup && returnGroup !== outboundGroup) applyLeg(returnGroup, returnLeg);

  let next = days.map((day) => mapDayItems(day, (item) => (patches.has(item.id) ? { ...item, ...patches.get(item.id)! } : item)));

  // 가는 편이 그 날짜의 맨 첫 항목이면, 그 날짜의 오전 미팅 시각을 실제 출발 시각으로 맞춘다
  if (outboundLeg.departTime) {
    const day = days[outboundGroup.dayIndex];
    const firstItem = day.kind === "linear" ? day.items[0] : day.amGuided[0];
    if (firstItem && firstItem.id === outboundGroup.items[0].id) {
      next = next.map((d, i) => (i === outboundGroup.dayIndex ? { ...d, meetingTime: outboundLeg.departTime } : d));
    }
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

/**
 * 선택한 항공편의 귀국편 출발일이, 현재 설정한 여행 일수로 계산한 귀국일과 맞는지 확인한다.
 * 출발일을 입력하지 않았으면(날짜를 모르면) 비교하지 않는다.
 */
export function checkReturnDate(input: Pick<TripInput, "departureDate" | "days">, flight: FlightOption): ReturnDateCheck {
  const start = parseDate(input.departureDate);
  const flightReturn = flight.returnDepartDate.trim();
  if (!start || !flightReturn) {
    return { expectedReturnDate: null, flightReturnDate: flightReturn || null, mismatched: false, suggestedDays: null };
  }
  const expected = addDays(start, input.days - 1);
  const expectedText = `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, "0")}-${String(expected.getDate()).padStart(2, "0")}`;
  const mismatched = expectedText !== flightReturn;

  let suggestedDays: number | null = null;
  if (mismatched) {
    const flightReturnDate = parseDate(flightReturn);
    if (flightReturnDate) {
      const diffMs = flightReturnDate.getTime() - start.getTime();
      const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
      if (diffDays >= 1) suggestedDays = diffDays + 1;
    }
  }

  return { expectedReturnDate: expectedText, flightReturnDate: flightReturn, mismatched, suggestedDays };
}
