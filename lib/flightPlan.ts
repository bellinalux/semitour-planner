/**
 * 항공 시각으로 도착일·출국일에 쓸 수 있는 시간을 정하고, AI가 만든 날짜에 항공·공항 이동·체크인/아웃을 붙인다.
 *  - 고른 항공편이 있으면 그 시각, 없으면 노선 비행시간으로 흔한 시각을 가정한다(assumed — 항공편을 고르면 다시 맞춘다).
 *  - 도착일: 현지 도착 + 입국·수하물 60분 + 시내 이동 40분 뒤부터 관광
 *  - 출국일: 귀국편 출발 3시간 전 공항 도착(국제선 기준) + 공항까지 60분 전에 관광 끝
 *  - 귀국편이 심야(자정 넘어 출발)면 그 전날이 사실상 출국일이다(숙박 = 일수 − 2).
 */
import { dayTourStart, formatClock, parseClock, walkTimeline } from "@/lib/dayLoad";
import { crossesMidnight, firstClock } from "@/lib/flightApply";
import { flightMinutes, hm, offsetOn, zoneOf, type Zone } from "@/lib/timezone";
import { AIRPORT_STANDARD } from "@/lib/airportStandard";
import type { DayPlan, FlightOption, ItineraryItem, TripInput } from "@/types";

/** 입국 심사·수하물 */
export const ARRIVAL_PROCESS_MIN = 60;
/** 공항 ↔ 시내 이동 (도착 뒤) */
export const ARRIVAL_TRANSFER_MIN = 40;
/** 시내 → 공항 이동 (출국일) */
export const AIRPORT_TRANSFER_MIN = 60;
/** 이 시각 이후 도착하면 도착일 관광 없음 */
const LATE_ARRIVAL = 18 * 60;
/** 이 시각 전(새벽)에 도착하면 숙소에서 쉬고 오전 늦게 시작 */
const DAWN = 6 * 60;
const DAWN_START = 10 * 60;
/** 출국일 관광이 이 시각 전에 끝나야 하면 관광 없이 체크아웃만 */
const EARLY_DEPARTURE_END = 10 * 60;
/** 단거리 노선 — 비행 5시간 이하, 시차 2시간 이하 (기내 1박이 생기지 않는다) */
const SHORT_HAUL_MAX_MIN = 300;
const SHORT_HAUL_MAX_TZ = 120;

export interface FlightTimes {
  /** 한국 출발 (한국 시각) */
  outboundDepart: string;
  /** 현지 도착 (현지 시각) */
  arrive: string;
  /** 현지 출발 귀국편 (현지 시각) */
  returnDepart: string;
  /** 한국 도착 (한국 시각) */
  returnArrive: string;
  originAirport: string;
  destAirport: string;
  returnDepartAirport: string;
  returnArriveAirport: string;
  /** 가는 편·귀국편의 표기상 시각 차이(분, 비행시간 + 시차) */
  outboundGapMin: number;
  returnGapMin: number;
  /** 고른 항공편이 없어 흔한 시각으로 가정했는지 */
  assumed: boolean;
  /** 귀국편이 자정을 넘겨 한국에 도착하거나 새벽에 출발 — 숙박 = 일수 − 2 */
  overnightReturn: boolean;
}

const add = (clock: string, minutes: number) => formatClock((parseClock(clock) ?? 0) + minutes);
const zonePair = (input: Pick<TripInput, "originCity" | "destination">): { from: Zone | null; to: Zone | null } => ({
  from: zoneOf(input.originCity.trim() || "인천") ?? zoneOf("인천"),
  to: zoneOf(input.destination),
});

/** 노선 대략 비행시간(분)·시차(분, 현지 − 한국). 모르면 비행 180분·시차 0 */
export function routeInfo(input: Pick<TripInput, "originCity" | "destination" | "departureDate">): { outMin: number; backMin: number; tzMin: number; known: boolean } {
  const { from, to } = zonePair(input);
  if (!from || !to) return { outMin: 180, backMin: 170, tzMin: 0, known: false };
  const outMin = flightMinutes(from, to);
  const backMin = flightMinutes(to, from);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.departureDate) ? input.departureDate : undefined;
  const tzMin = Math.round((offsetOn(to, date) - offsetOn(from, date)) * 60);
  return { outMin: outMin ?? 180, backMin: backMin ?? outMin ?? 170, tzMin, known: outMin !== null };
}

/** 단거리 노선인가 (일본·중국·대만 등 — 기내 1박이 생기지 않는다) */
export function isShortHaul(input: Pick<TripInput, "originCity" | "destination" | "departureDate">): boolean {
  const r = routeInfo(input);
  return r.known && r.outMin <= SHORT_HAUL_MAX_MIN && Math.abs(r.tzMin) <= SHORT_HAUL_MAX_TZ;
}

type FlightInput = Pick<TripInput, "includesFlights" | "tripScope" | "selectedFlight" | "originCity" | "destination" | "departureDate" | "days" | "nights">;

/** 고른 항공편의 시각 — 가는 편 출발·도착, 귀국편 출발이 다 있어야 쓴다 */
function selectedTimes(input: FlightInput): FlightTimes | null {
  const f = input.selectedFlight;
  if (!f) return null;
  const outboundDepart = firstClock(f.departTime);
  const arrive = firstClock(f.arriveTime);
  const returnDepart = firstClock(f.returnDepartTime);
  if (!outboundDepart || !arrive || !returnDepart) return null;
  const r = routeInfo(input);
  const returnArrive = firstClock(f.returnArriveTime) || add(returnDepart, r.backMin - r.tzMin);
  const gap = (a: string, b: string, nextDay: boolean) => ((parseClock(b) ?? 0) - (parseClock(a) ?? 0) + (nextDay ? 1440 : 0) + 1440) % 1440 || 1440;
  const returnDawn = (parseClock(returnDepart) ?? 12 * 60) < DAWN;
  return {
    outboundDepart,
    arrive,
    returnDepart,
    returnArrive,
    originAirport: f.departAirport || input.originCity.trim() || "인천",
    destAirport: f.arriveAirport || input.destination.trim(),
    returnDepartAirport: f.returnDepartAirport || f.arriveAirport || input.destination.trim(),
    returnArriveAirport: f.returnArriveAirport || f.departAirport || input.originCity.trim() || "인천",
    outboundGapMin: gap(outboundDepart, arrive, false),
    returnGapMin: gap(returnDepart, returnArrive, false),
    assumed: false,
    overnightReturn: returnDawn || crossesMidnight(f.returnDepartTime, f.returnArriveTime) || input.days === input.nights + 2,
  };
}

/**
 * 항공 시각 — 고른 항공편, 없으면 노선으로 가정한 흔한 시각.
 *  가정: 단거리는 한국 09:00 출발, 장거리는 10:30 출발. 귀국편은 숙박이 일수 − 2면 심야(00:30), 아니면 저녁 19:00 출발.
 * 항공이 없는 상품(국내·랜드)이면 null.
 */
export function flightTimesFor(input: FlightInput): FlightTimes | null {
  if (!input.includesFlights || input.tripScope === "domestic" || input.days < 2) return null;
  const picked = selectedTimes(input);
  if (picked) return picked;
  const r = routeInfo(input);
  const outboundDepart = r.outMin <= SHORT_HAUL_MAX_MIN ? "09:00" : "10:30";
  const overnightReturn = input.days === input.nights + 2;
  const returnDepart = overnightReturn ? "00:30" : "19:00";
  const origin = input.originCity.trim() || "인천";
  const dest = input.destination.split(/[,/]/)[0].trim() || "현지";
  return {
    outboundDepart,
    arrive: add(outboundDepart, r.outMin + r.tzMin),
    returnDepart,
    returnArrive: add(returnDepart, r.backMin - r.tzMin),
    originAirport: origin,
    destAirport: dest,
    returnDepartAirport: dest,
    returnArriveAirport: origin,
    outboundGapMin: r.outMin + r.tzMin,
    returnGapMin: r.backMin - r.tzMin,
    assumed: true,
    overnightReturn,
  };
}

export interface FlightDayWindows {
  /** 도착일 관광을 시작할 수 있는 시각 (없으면 빈 문자열 — 저녁 늦게 도착) */
  arrivalStart: string;
  /** 출국일 관광을 끝내야 하는 시각 (없으면 빈 문자열 — 아침 일찍 출국) */
  departureEnd: string;
  /** 출국 관광을 하는 날 (1부터, 심야편이면 마지막 전날) */
  departureDay: number;
  /** AI가 만들 날 수 (심야편이면 마지막 날은 기내·한국 도착뿐이라 하나 적다) */
  aiDays: number;
}

export function flightDayWindows(times: FlightTimes, days: number): FlightDayWindows {
  const arriveMin = parseClock(times.arrive) ?? 12 * 60;
  const startMin = arriveMin < DAWN ? DAWN_START : arriveMin + ARRIVAL_PROCESS_MIN + ARRIVAL_TRANSFER_MIN;
  const arrivalStart = arriveMin >= LATE_ARRIVAL ? "" : formatClock(Math.ceil(startMin / 10) * 10);
  const before = AIRPORT_STANDARD.international.arriveBefore + AIRPORT_TRANSFER_MIN;
  const depMin = parseClock(times.returnDepart) ?? 19 * 60;
  // 심야편(00:30)이면 전날 20:30까지 — 하루를 더해 계산
  const endMin = (times.overnightReturn && depMin < 12 * 60 ? depMin + 1440 : depMin) - before;
  const departureEnd = endMin < EARLY_DEPARTURE_END ? "" : formatClock(Math.floor(endMin / 10) * 10);
  const aiDays = times.overnightReturn ? Math.max(1, days - 1) : days;
  return { arrivalStart, departureEnd, departureDay: aiDays, aiDays };
}

/** 코스 생성 요청에 넣는 항공 정보 */
export function flightDaysRequest(input: FlightInput): { flightDays: FlightDaysRequest; aiDays: number } | null {
  const t = flightTimesFor(input);
  if (!t) return null;
  const w = flightDayWindows(t, input.days);
  return {
    aiDays: w.aiDays,
    flightDays: { arrive: t.arrive, arrivalStart: w.arrivalStart, returnDepart: t.returnDepart, departureEnd: w.departureEnd, departureDay: w.departureDay, assumed: t.assumed, overnightReturn: t.overnightReturn },
  };
}

export interface FlightDaysRequest {
  arrive: string;
  arrivalStart: string;
  returnDepart: string;
  departureEnd: string;
  departureDay: number;
  assumed: boolean;
  overnightReturn: boolean;
}

// ── AI가 만든 날짜에 항공·공항·숙소 항목 붙이기 ─────────────────────────────

const base = (id: string, type: ItineraryItem["type"], name: string, description = "", stay = 0, travel: number | null = null): ItineraryItem => ({
  id,
  type,
  name,
  description,
  stayMinutes: stay,
  travelMinutesToNext: travel,
  entryFee: 0,
  mealCost: 0,
  isEstimated: false,
  admission: "none",
});

/** AI가 지시를 어기고 넣은 항공·공항·체크인/아웃 항목은 뺀다 (앱이 정확한 시각으로 넣는다) */
const ROUTINE = /체크\s*인|체크\s*아웃|check[- ]?(in|out)|공항|airport|출국|입국|탑승/i;
function contentItems(day: DayPlan | undefined): ItineraryItem[] {
  if (!day) return [];
  const all = day.kind === "linear" ? day.items : [...day.amGuided, ...(day.pmFreeOptions[0]?.items ?? [])];
  return all.filter((i) => i.type !== "flight" && !(["hotel", "transfer"].includes(i.type ?? "") && ROUTINE.test(i.name)) && !(i.type === "free_time" && ROUTINE.test(i.name)));
}

const estimatedNote = (t: FlightTimes) => (t.assumed ? " · 예상 시각 — 항공편을 고르면 실제 시각으로 다시 맞춥니다" : "");

const CHECKOUT_EARLIEST = 9 * 60;
const CHECKOUT_LATEST = 11 * 60;

/** 출국일 체크아웃(하루 시작) 시각 — 관광이 짧으면 늦게 시작해 공항 대기를 줄인다. 그래도 남는 시간은 빈 시간 채우기로 안내 */
function departureMeeting(t: FlightTimes, content: ItineraryItem[]): string {
  const dep = parseClock(t.returnDepart) ?? 19 * 60;
  const leaveBy = dep - AIRPORT_STANDARD.international.arriveBefore - AIRPORT_TRANSFER_MIN;
  if (content.length === 0) return formatClock(Math.max(0, leaveBy - 20));
  const contentMin = 20 + content.reduce((sum, i, k) => sum + Math.max(0, i.stayMinutes) + (k < content.length - 1 ? Math.max(0, i.travelMinutesToNext ?? 0) : 0), 0);
  const ideal = Math.floor((leaveBy - contentMin) / 10) * 10;
  return formatClock(Math.min(CHECKOUT_LATEST, Math.max(CHECKOUT_EARLIEST, ideal)));
}

/**
 * AI가 만든 날짜(aiDays개)에 도착일·출국일 항목을 붙여 전체 일정을 만든다.
 *  - 1일차: 출발 → 도착(입국·수하물) → AI가 짠 도착일 관광 → 호텔 체크인
 *  - 출국일: 호텔 체크아웃 → AI가 짠 관광 → 공항 이동 → 귀국편(출발 시각 고정)
 *  - 심야 귀국편: 마지막 전날 끝에 공항 이동, 마지막 날은 귀국편만
 */
export function withFlightDays(aiDays: DayPlan[], input: Pick<TripInput, "originCity" | "destination" | "days">, t: FlightTimes): DayPlan[] {
  if (aiDays.length === 0) return aiDays;
  const days = aiDays.map((d) => ({ ...d }));
  const n = days.length;

  // 1일차 — 도착
  const first = days[0];
  const arrivalContent = contentItems(first);
  const lastArrival = arrivalContent[arrivalContent.length - 1];
  days[0] = {
    ...first,
    kind: "linear",
    rest: undefined,
    amGuided: [],
    pmFreeOptions: [],
    meetingTime: t.outboundDepart,
    hotelLeadMinutes: 0,
    theme: first.theme || "출국 · 도착",
    items: [
      base("fl-out-dep", "flight", `${t.originAirport} 출발`, `${t.outboundDepart} 출발 → 현지 ${t.arrive} 도착 (비행 약 ${hm(t.outboundGapMin)})${estimatedNote(t)}`, 0, t.outboundGapMin),
      base("fl-out-arr", "flight", `${t.destAirport} 도착`, `입국 심사·수하물 찾기 → 가이드 미팅, 시내 이동 약 ${ARRIVAL_TRANSFER_MIN}분`, ARRIVAL_PROCESS_MIN, ARRIVAL_TRANSFER_MIN),
      ...arrivalContent.map((i) => (i === lastArrival ? { ...i, travelMinutesToNext: i.travelMinutesToNext ?? 20 } : i)),
      base("fl-out-hotel", "hotel", "호텔 체크인", arrivalContent.length > 0 ? "관광 뒤 호텔 체크인 · 휴식" : "호텔 체크인 · 휴식"),
    ],
  };

  // 출국일 (심야편이면 마지막 전날, 아니면 마지막 날)
  const depIdx = t.overnightReturn ? n - 1 : n - 1;
  const depDay = days[depIdx];
  const depContent = depIdx === 0 ? [] : contentItems(depDay);
  const toAirport = base("fl-ret-transfer", "transfer", `${t.returnDepartAirport} 공항 이동`, `출발 3시간 전 공항 도착 · 단체 탑승 수속 (이동 약 ${AIRPORT_TRANSFER_MIN}분)`, 0, AIRPORT_TRANSFER_MIN);
  const returnFlights = [
    { ...base("fl-ret-dep", "flight", `${t.returnDepartAirport} 출발`, `${t.returnDepart} 출발 → ${t.returnArriveAirport} ${t.returnArrive} 도착${estimatedNote(t)}`, 0, t.returnGapMin), fixedTime: t.returnDepart },
    base("fl-ret-arr", "flight", `${t.returnArriveAirport} 도착`, "한국 도착 · 해산"),
  ];
  const checkout = base("fl-ret-checkout", "hotel", "호텔 체크아웃", depContent.length > 0 ? "짐은 차량에 싣고 관광" : "", 0, 20);

  if (t.overnightReturn) {
    // 마지막 전날: 체크아웃 → 관광 → 공항 이동 (그날 밤 숙박 없음) / 마지막 날: 심야 귀국편
    if (depIdx > 0) {
      days[depIdx] = { ...depDay, kind: "linear", amGuided: [], pmFreeOptions: [], rest: undefined, items: [checkout, ...depContent, toAirport], overnightCity: "" };
    }
    days.push({
      day: n + 1,
      theme: "귀국",
      kind: "linear",
      overnightCity: "",
      meetingTime: t.returnDepart,
      hotelLeadMinutes: 0,
      items: returnFlights,
      amGuided: [],
      pmFreeOptions: [],
    });
  } else if (depIdx > 0) {
    days[depIdx] = {
      ...depDay,
      kind: "linear",
      amGuided: [],
      pmFreeOptions: [],
      rest: undefined,
      theme: depDay.theme || "귀국",
      overnightCity: "",
      // 체크아웃 시각: 관광이 공항 갈 시각에 딱 끝나도록 거꾸로 잡되 09:00~11:00 사이 (관광이 없으면 공항 출발에 맞춰)
      meetingTime: departureMeeting(t, depContent),
      items: [checkout, ...depContent.map((i, k) => (k === depContent.length - 1 ? { ...i, travelMinutesToNext: 0 } : i)), toAirport, ...returnFlights],
    };
  }
  return days.map((d, i) => ({ ...d, day: i + 1 }));
}

// ── 출국일 빈 시간 (공항 대기) ─────────────────────────────

/** 출국일의 공항 이동·귀국편 묶음이 시작하는 위치 (끝에 항공이 있고 그 앞이 공항 이동인 날). 아니면 -1 */
export function returnBlockStart(day: DayPlan): number {
  if (day.kind !== "linear") return -1;
  const items = day.items;
  let k = items.length - 1;
  while (k >= 0 && items[k].type === "flight") k--;
  if (k === items.length - 1 || k < 0) return -1;
  // 출발 항공 앞의 공항 이동 줄들
  let start = k + 1;
  while (start - 1 >= 0 && items[start - 1].type === "transfer") start--;
  // 맨 앞(체크아웃)만 남은 날도 출국일이다
  return start > 0 ? start : -1;
}

export interface DepartureGap {
  freeMinutes: number;
  /** 비기 시작하는 시각 */
  fromTime: string;
  /** 공항으로 출발해야 하는 시각 */
  untilTime: string;
}

/**
 * 출국일에 관광을 끝내고 공항 이동을 시작할 때부터, 실제로 공항에 가야 하는 시각(출발 3시간 전 + 이동)까지 남는 시간.
 * 예전 방식(출발 시각에서 거꾸로 계산해 오후에 체크아웃하는 날)은 오전(09:30)부터 체크아웃까지가 빈 시간이다.
 * 2시간 30분 이상 비면 채우기를 권한다.
 */
export function departureGap(day: DayPlan, minMinutes = 150): DepartureGap | null {
  const start = returnBlockStart(day);
  if (start < 0) return null;
  const slots = walkTimeline(day.items, dayTourStart(day));
  const dep = slots.find((s) => s.item.type === "flight");
  if (!dep) return null;
  const depMin = dep.item.fixedTime ? (parseClock(dep.item.fixedTime) ?? dep.start) : dep.start;
  const transferMin = day.items.slice(start).filter((i) => i.type === "transfer").reduce((s, i) => s + Math.max(0, i.stayMinutes) + Math.max(0, i.travelMinutesToNext ?? 0), 0);
  const leaveBy = depMin - AIRPORT_STANDARD.international.arriveBefore - transferMin;
  const blockSlot = slots.find((s) => s.item === day.items[start]);
  if (!blockSlot) return null;
  const hasTour = day.items.slice(0, start).some((i) => !["hotel", "transfer", "flight"].includes(i.type ?? ""));
  // 거꾸로 맞춘 예전 날짜: 관광 없이 오후 늦게 체크아웃 → 오전부터 빈 시간
  if (!dep.item.fixedTime && !hasTour) {
    const from = 9 * 60 + 30;
    const free = blockSlot.start - from;
    return free >= minMinutes ? { freeMinutes: free, fromTime: formatClock(from), untilTime: formatClock(blockSlot.start) } : null;
  }
  const free = leaveBy - blockSlot.start;
  return free >= minMinutes ? { freeMinutes: free, fromTime: formatClock(blockSlot.start), untilTime: formatClock(leaveBy) } : null;
}

/**
 * 출국일 공항 이동 앞에 관광을 끼워 넣는다. 귀국편 출발 시각은 그대로 고정한다
 * (예전 방식 날짜는 지금 시각으로 고정하고 하루를 09:30 체크아웃으로 당긴다).
 */
export function insertBeforeAirport(day: DayPlan, items: ItineraryItem[]): DayPlan {
  const start = returnBlockStart(day);
  if (start < 0 || items.length === 0) return day;
  const slots = walkTimeline(day.items, dayTourStart(day));
  const depSlot = slots.find((s) => s.item.type === "flight");
  const anchored = depSlot && !depSlot.item.fixedTime;
  const hasTour = day.items.slice(0, start).some((i) => !["hotel", "transfer", "flight"].includes(i.type ?? ""));
  const lastAdded = items.length - 1;
  const next = [
    ...day.items.slice(0, start),
    ...items.map((i, k) => (k === lastAdded ? { ...i, travelMinutesToNext: 0 } : i)),
    ...day.items.slice(start).map((i) => (anchored && depSlot && i === depSlot.item ? { ...i, fixedTime: formatClock(depSlot.start) } : i)),
  ];
  return { ...day, items: next, ...(anchored && !hasTour ? { meetingTime: "09:30" } : {}) };
}

// ── 자동 구성: 코스를 만들기 전에 항공편 고르기 ─────────────────────────────

/**
 * 조회한 왕복 항공편 중 코스에 가장 좋은 편 — 입력한 기간(숙박·일수)에 맞는 편만,
 * 직항, 현지 오전~점심 도착(10:30 가까울수록), 귀국편 저녁 출발(19:00 가까울수록, 심야 상품이면 자정 무렵), 싼 편 순.
 * 맞는 편이 없으면 null.
 */
export function pickFlightForCourse(flights: FlightOption[], input: Pick<TripInput, "days" | "nights">, span: (f: FlightOption) => { days: number; nights: number } | null): FlightOption | null {
  const overnight = input.days === input.nights + 2;
  const usable = flights.filter((f) => {
    if (!firstClock(f.departTime) || !firstClock(f.arriveTime) || !firstClock(f.returnDepartTime)) return false;
    const s = span(f);
    return !!s && s.days === input.days && s.nights === input.nights;
  });
  if (usable.length === 0) return null;
  const cheapest = Math.min(...usable.map((f) => f.price || Number.MAX_SAFE_INTEGER));
  const score = (f: FlightOption) => {
    const arrive = parseClock(firstClock(f.arriveTime)) ?? 12 * 60;
    const back = parseClock(firstClock(f.returnDepartTime)) ?? 19 * 60;
    const backTarget = overnight ? 24 * 60 : 19 * 60;
    const backDist = Math.min(Math.abs(back - backTarget), Math.abs(back + 1440 - backTarget));
    const pricePenalty = f.price > 0 && cheapest < Number.MAX_SAFE_INTEGER ? ((f.price - cheapest) / cheapest) * 120 : 30;
    return (f.stops > 0 ? 120 : 0) + (f.returnStops > 0 ? 120 : 0) + Math.abs(arrive - 10.5 * 60) / 2 + backDist / 2 + pricePenalty;
  };
  return [...usable].sort((a, b) => score(a) - score(b))[0];
}
