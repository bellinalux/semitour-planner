import { clockDiffMinutes, clockMinutes, dayMeetingTime, shiftClock, walkTimeline } from "@/lib/dayLoad";
import { refitMealWindows } from "@/lib/mealTiming";
import { TIME_STEP } from "@/lib/format";
import { addDays, isBreakfastItem, parseDate } from "@/lib/documents";
import { mapDayItems } from "@/lib/itinerary";
import type { DayPlan, FlightOption, ItineraryItem, TripInput } from "@/types";

/** 경유 횟수를 모르면(-1, 업체 코스표에서 읽은 항공편) 표시하지 않는다 */
const stopsText = (stops: number) => (stops < 0 ? "" : stops === 0 ? "직항" : `경유 ${stops}회`);

/** "23:45 (또는 익일 00:25)"처럼 설명이 붙어 오는 항공 시각에서 첫 HH:mm만 뽑는다. 없으면 빈 문자열 */
function firstClock(text: string): string {
  const m = /(\d{1,2}):(\d{2})/.exec(text);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
}

/** 도착 시각 표기에 "다음날·익일·+1"이 붙어 있으면 자정을 넘긴 도착이다 */
const NEXT_DAY_HINT = /다음\s*날|익일|\+\s*1/;

/** 출발→도착이 자정을 넘기는지 (도착 시각이 더 이르거나, 도착 표기에 다음날 표시가 있으면) */
function crossesMidnight(departTime: string, arriveTime: string): boolean {
  if (NEXT_DAY_HINT.test(arriveTime)) return true;
  const f = clockMinutes(firstClock(departTime));
  const t = clockMinutes(firstClock(arriveTime));
  return f !== null && t !== null && t < f;
}

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
    leg.departTime ? `${leg.departAirport ? `${leg.departAirport} ` : ""}${leg.departTime} 출발` : "",
    leg.arriveTime ? `${leg.arriveAirport ? `${leg.arriveAirport} ` : ""}${leg.arriveTime} 도착` : "",
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
export function looksLikeFlightItem(item: ItineraryItem): boolean {
  if (item.type === "flight") return true;
  // AI가 공항 도착을 관광·체험으로 잘못 분류한 경우도 이름으로 알아본다 (식사·숙소·자유시간은 아님)
  if (item.type !== undefined && !["transfer", "sightseeing", "experience"].includes(item.type)) return false;
  return item.name.includes("공항") && (item.name.includes("출발") || item.name.includes("도착"));
}

/** 모든 목록(하루 전체·오전·오후 A/B)을 통틀어 그 날짜의 항공편 항목만, 원래 순서대로 모은다 */
function flightItemsOfDay(day: DayPlan): ItineraryItem[] {
  return [...day.items, ...day.amGuided, ...day.pmFreeOptions.flatMap((o) => o.items)].filter(looksLikeFlightItem);
}

/** "도착"만 적힌 비행 항목 (출발 쪽이 빠진 것) */
const isArrivalOnly = (item: ItineraryItem) => item.name.includes("도착") && !item.name.includes("출발");

/**
 * 그날 비행 항목이 하나뿐이고 출발·도착 시각을 모두 알면, 빠진 쪽 항목을 만들어 넣는다.
 *  - 도착 항목만 있으면 그 앞에 "○○ 출발"을 넣는다 (도착 항목의 체류·다음 이동은 그대로)
 *  - 출발 항목만 있으면 그 뒤에 "○○ 도착"을 넣고, 원래 다음 장소까지 이동 시간은 도착 항목으로 옮긴다
 * 하루 전체 목록(linear)에 있는 경우만 다룬다.
 */
function splitLoneFlight(days: DayPlan[], dayIndex: number, leg: FlightLeg): DayPlan[] {
  const day = days[dayIndex];
  if (!leg.departTime || !leg.arriveTime) return days;
  const flights = day.items.filter(looksLikeFlightItem);
  if (flights.length !== 1 || flightItemsOfDay(day).length !== 1) return days;
  const only = flights[0];
  const base: ItineraryItem = { id: "", type: "flight", name: "", description: "", stayMinutes: 0, travelMinutesToNext: null, entryFee: 0, mealCost: 0, isEstimated: false, admission: "none" };
  const index = day.items.indexOf(only);
  const items = [...day.items];
  if (isArrivalOnly(only)) {
    items.splice(index, 0, { ...base, id: `${only.id}-dep`, name: leg.departAirport ? `${leg.departAirport} 출발` : "항공 출발" });
  } else {
    items.splice(index, 1, { ...only, travelMinutesToNext: null }, { ...base, id: `${only.id}-arr`, name: leg.arriveAirport ? `${leg.arriveAirport} 도착` : "항공 도착", travelMinutesToNext: only.travelMinutesToNext });
  }
  return days.map((d, i) => (i === dayIndex ? { ...d, items } : d));
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
  const index = items.findIndex((i) => i.id === itemId);
  const before = items.slice(0, Math.max(0, index)).filter((i) => !isBreakfastItem(i));
  const target = clockMinutes(anchorTime);
  // 항공이 그날 첫 일정이면 미팅 시각 = 실제 출발 시각
  if (before.length === 0 || target === null) {
    const meetingTime = shiftClock(anchorTime, -precedingMinutes(items, itemId));
    return meetingTime ? days.map((d, i) => (i === dayIndex ? { ...d, meetingTime } : d)) : days;
  }

  // 앞선 일정(체크아웃·공항 이동)은 10분 단위 시각으로 시작하도록 미팅 시각을 10분 단위로 내리고,
  // 남는 몇 분은 항공 바로 앞 항목의 이동 시간에 더해 항공 항목이 실제 출발 시각에 정확히 오게 한다
  let meeting = Math.floor((target - precedingMinutes(items, itemId)) / TIME_STEP) * TIME_STEP;
  let delta = 0;
  for (let tries = 0; tries < 12; tries++) {
    const slot = walkTimeline(items, shiftClock("00:00", meeting) ?? "00:00").find((s) => s.item.id === itemId);
    if (!slot) return days;
    delta = target - slot.start;
    if (delta > 720) delta -= 1440; // 자정을 넘나드는 경우
    if (delta < -720) delta += 1440;
    if (delta >= 0) break;
    meeting -= TIME_STEP;
  }
  const meetingTime = shiftClock("00:00", meeting);
  if (!meetingTime || delta < 0) return days;
  const last = before[before.length - 1];
  const nextItems = items.map((i) => (i.id === last.id && delta > 0 ? { ...i, travelMinutesToNext: (i.travelMinutesToNext ?? 0) + delta } : i));
  return days.map((d, i) => (i !== dayIndex ? d : d.kind === "linear" ? { ...d, meetingTime, items: nextItems } : { ...d, meetingTime, amGuided: nextItems }));
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
export function applyFlightToDays(inputDays: DayPlan[], flight: FlightOption): DayPlan[] {
  if (inputDays.length === 0) return inputDays;
  const lastIndex = inputDays.length - 1;

  const outboundLeg: FlightLeg = {
    airline: flight.airline,
    flightNumber: flight.flightNumber,
    departAirport: flight.departAirport,
    departTime: firstClock(flight.departTime),
    arriveAirport: flight.arriveAirport,
    arriveTime: firstClock(flight.arriveTime),
    stops: flight.stops,
    duration: flight.duration,
  };
  const returnLeg: FlightLeg = {
    airline: flight.airline,
    flightNumber: flight.returnFlightNumber,
    departAirport: flight.returnDepartAirport,
    departTime: firstClock(flight.returnDepartTime),
    arriveAirport: flight.returnArriveAirport,
    arriveTime: firstClock(flight.returnArriveTime),
    stops: flight.returnStops,
    duration: flight.returnDuration,
  };

  // 그날 비행 항목이 하나뿐이면(예: "마카오 공항 도착 (12:50), 가이드 미팅" 하나, 또는 "인천 도착" 하나) 빠진 출발·도착 항목을 만들어
  // 출발 → 도착이 실제 시각대로 이어지게 한다. 하나만 두면 도착 항목이 출발 시각에 놓이는 문제가 생긴다.
  let days = splitLoneFlight(inputDays, 0, outboundLeg);
  if (lastIndex > 0) days = splitLoneFlight(days, lastIndex, returnLeg);

  const outboundItems = flightItemsOfDay(days[0]);
  const returnItems = lastIndex > 0 ? flightItemsOfDay(days[lastIndex]) : [];
  if (outboundItems.length === 0 && returnItems.length === 0) return inputDays;

  const outboundGroup: FlightGroup | null = outboundItems.length > 0 ? { dayIndex: 0, items: outboundItems } : null;
  const returnGroup: FlightGroup | null = returnItems.length > 0 ? { dayIndex: lastIndex, items: returnItems } : null;

  const patches = new Map<string, Partial<ItineraryItem>>();

  function applyLeg(group: FlightGroup | null, leg: FlightLeg) {
    if (!group || (!leg.departAirport && !leg.departTime)) return; // 이 편 정보를 확인하지 못했으면 건드리지 않는다
    const line = legLine(leg);
    const gap = leg.departTime && leg.arriveTime ? clockDiffMinutes(leg.departTime, leg.arriveTime) : null;
    if (group.items.length >= 2) {
      const [dep, arr] = group.items;
      // 이름에 이미 출발·도착이 적혀 있으면(업체 코스표 원문) 그대로 두고, 원래 설명(가이드 미팅 등)도 남긴다
      const keepName = (item: ItineraryItem, word: string) => item.name.includes(word) || !(word === "출발" ? leg.departAirport : leg.arriveAirport);
      const withLine = (item: ItineraryItem) => (item.description && !item.description.includes(line) ? `${line} · ${item.description}` : line);
      patches.set(dep.id, {
        name: keepName(dep, "출발") ? dep.name : `${leg.departAirport} 출발`,
        description: withLine(dep),
        stayMinutes: 0,
        travelMinutesToNext: gap ?? dep.travelMinutesToNext,
      });
      patches.set(arr.id, { name: keepName(arr, "도착") ? arr.name : `${leg.arriveAirport} 도착`, description: withLine(arr) });
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

/** 이 시각 전에 도착·출발하는 항공편은 "새벽편"으로 보고 숙박을 하루 앞당기거나 뺀다 */
const DAWN_LIMIT_MINUTES = 6 * 60;

export interface TripSpan {
  departureDate: string;
  /** 출국일부터 한국 도착일까지 */
  days: number;
  /** 현지 숙박 수 */
  nights: number;
}

/**
 * 고른 왕복 항공편의 출국·귀국 날짜와 시각으로 실제 여행 일수와 숙박 수를 계산한다(일수 − 1로 단정하지 않는다).
 *  - 일수: 출국일 ~ 한국 도착일(귀국편이 자정을 넘기면 다음날)
 *  - 숙박: 현지 도착일 밤부터 귀국편 출발일 전날 밤까지. 가는 편이 새벽(06시 전)에 도착하면 전날 밤부터
 *    숙소를 잡고, 귀국편이 새벽(06시 전)에 출발하면 전날 밤은 숙소 없이 공항으로 이동하는 것으로 본다.
 * 날짜를 모르면 null.
 */
export function tripSpanFromFlight(flight: FlightOption): TripSpan | null {
  const depart = parseDate(flight.departDate.trim());
  const returnDepart = parseDate(flight.returnDepartDate.trim());
  if (!depart || !returnDepart) return null;
  const dayMs = 24 * 60 * 60 * 1000;
  const diff = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / dayMs);
  const outboundNextDay = crossesMidnight(flight.departTime, flight.arriveTime);
  const arrival = addDays(depart, outboundNextDay ? 1 : 0);
  const arriveMinutes = clockMinutes(firstClock(flight.arriveTime));
  const firstNight = outboundNextDay && arriveMinutes !== null && arriveMinutes < DAWN_LIMIT_MINUTES ? depart : arrival;

  const homeArrival = addDays(returnDepart, crossesMidnight(flight.returnDepartTime, flight.returnArriveTime) ? 1 : 0);
  const returnMinutes = clockMinutes(firstClock(flight.returnDepartTime));
  const dawnReturn = returnMinutes !== null && returnMinutes < DAWN_LIMIT_MINUTES;

  const days = diff(depart, homeArrival) + 1;
  const nights = Math.max(0, diff(firstNight, returnDepart) - (dawnReturn ? 1 : 0));
  if (days < 1) return null;
  return { departureDate: flight.departDate.trim(), days, nights };
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
  return crossesMidnight(flight.returnDepartTime, flight.returnArriveTime);
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

/**
 * 항공편을 반영하고, 첫날(가는 편) 식사 시간대 맞춤 자유시간을 새 시작 시각으로 다시 계산한다.
 * 예전 시각(예: 기본 08:00)으로 넣어 둔 자유시간이 남으면 도착 뒤 점심이 너무 늦게 밀린다.
 * 마지막 날은 귀국편 출발 시각에 맞춰 거꾸로 계산하므로 다시 계산하지 않는다(출발 시각이 어긋나지 않게).
 */
export function applyFlightWithMeals(days: DayPlan[], flight: FlightOption): DayPlan[] {
  const next = applyFlightToDays(days, flight);
  if (next === days || next.length === 0 || next[0].kind !== "linear") return next;
  const first = next[0];
  return [{ ...first, items: refitMealWindows(first.items, dayMeetingTime(first)) }, ...next.slice(1)];
}
