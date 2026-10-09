import { clockMinutes, dayMeetingTime, walkTimeline } from "@/lib/dayLoad";
import { applyFlightWithMeals } from "@/lib/flightApply";
import { courseFlightOption } from "@/lib/schemas/course";
import type { CourseMeta, DayPlan, FlightOption, TripInput } from "@/types";

/**
 * 이미 만든 일정표의 항공 시각 바로잡기 — 다시 코스 분석을 하지 않아도, 확인된 항공편 시각과 일정표의 출발·도착 시각이 다르면 맞춘다.
 * 확인된 항공편: ① 직접 고른 항공편 → ② 코스 분석 때 원문에서 읽은 항공편 → ③ 비행 항목 글의 "09:50 ~ 12:50".
 * 추정 시각은 쓰지 않는다.
 */

/** 일정에 맞출 수 있는 확인된 항공편 (출발·도착 시각을 아는 편이 하나도 없으면 null) */
export function knownFlight(days: DayPlan[], input: Pick<TripInput, "selectedFlight">, meta: Pick<CourseMeta, "flight"> | null): FlightOption | null {
  return input.selectedFlight ?? meta?.flight ?? courseFlightOption(undefined, days);
}

const firstClock = (text: string) => /(\d{1,2}):(\d{2})/.exec(text)?.[0] ?? "";

/** 그날 비행 항목의 시작 시각이 확인된 출발·도착 시각과 다른지 (둘 다 알 때만 본다) */
function legOff(day: DayPlan | undefined, depart: string, arrive: string): string | null {
  if (!day || day.kind !== "linear") return null;
  const dep = clockMinutes(firstClock(depart));
  const arr = clockMinutes(firstClock(arrive));
  if (dep === null || arr === null) return null;
  const flights = walkTimeline(day.items, dayMeetingTime(day)).filter((s) => s.item.type === "flight");
  if (flights.length === 0) return null;
  const hhmm = (m: number) =>
    `${String(Math.floor((((m % 1440) + 1440) % 1440) / 60)).padStart(2, "0")}:${String((((m % 1440) + 1440) % 1440) % 60).padStart(2, "0")}`;
  if (flights.length === 1) return `DAY ${day.day} 비행 항목이 하나뿐이라 ${firstClock(arrive)} 도착이 ${hhmm(flights[0].start)}에 표시됩니다`;
  const [d, a] = flights;
  if (d.start % 1440 !== dep || a.start % 1440 !== arr) {
    return `DAY ${day.day} 출발 ${firstClock(depart)} → 도착 ${firstClock(arrive)}인데 일정표는 ${hhmm(d.start)} → ${hhmm(a.start)}입니다`;
  }
  return null;
}

/** 확인된 항공편과 일정표의 항공 시각이 어긋난 곳 (없으면 빈 배열) */
export function flightMismatches(days: DayPlan[], flight: FlightOption | null): string[] {
  if (!flight || days.length === 0) return [];
  const out = [legOff(days[0], flight.departTime, flight.arriveTime)];
  if (days.length > 1) out.push(legOff(days[days.length - 1], flight.returnDepartTime, flight.returnArriveTime));
  return out.filter((x): x is string => x !== null);
}

/** 어긋났으면 항공 시각을 다시 맞춘 일정, 맞으면 null */
export function repairFlightTimes(days: DayPlan[], input: Pick<TripInput, "selectedFlight">, meta: Pick<CourseMeta, "flight"> | null): DayPlan[] | null {
  const flight = knownFlight(days, input, meta);
  if (flightMismatches(days, flight).length === 0) return null;
  return applyFlightWithMeals(days, flight!);
}
