import { addDays, parseDate } from "@/lib/documents";
import { mapDayItems } from "@/lib/itinerary";
import type { DayPlan, FlightOption, TripInput } from "@/types";

const stopsText = (stops: number) => (stops === 0 ? "직항" : `경유 ${stops}회`);

function legLine(airline: string, flightNumber: string, departAirport: string, departTime: string, arriveAirport: string, arriveTime: string, stops: number, duration: string): string {
  const parts = [
    [airline, flightNumber].filter(Boolean).join(" "),
    departAirport && departTime ? `${departAirport} ${departTime} 출발` : "",
    arriveAirport && arriveTime ? `${arriveAirport} ${arriveTime} 도착` : "",
    stopsText(stops),
    duration,
  ].filter(Boolean);
  return parts.join(" · ");
}

/**
 * 선택한 항공편의 가는 편·귀국편 정보를 일정의 항공 이동일 항목(tv-in-1, tv-out-3)에 반영한다.
 * 항공 이동일이 포함된 일정(withTravelDays)에서만 그 id를 쓰므로, 포함되지 않은 일정에서는 아무것도 바뀌지 않는다.
 */
export function applyFlightToDays(days: DayPlan[], flight: FlightOption): DayPlan[] {
  const outbound = legLine(flight.airline, flight.flightNumber, flight.departAirport, flight.departTime, flight.arriveAirport, flight.arriveTime, flight.stops, flight.duration);
  const inbound = legLine(
    flight.airline,
    flight.returnFlightNumber,
    flight.returnDepartAirport,
    flight.returnDepartTime,
    flight.returnArriveAirport,
    flight.returnArriveTime,
    flight.returnStops,
    flight.returnDuration,
  );

  return days.map((day) =>
    mapDayItems(day, (item) => {
      if (item.id === "tv-in-1" && outbound) return { ...item, description: outbound };
      if (item.id === "tv-out-3" && inbound) return { ...item, description: inbound };
      return item;
    }),
  );
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
