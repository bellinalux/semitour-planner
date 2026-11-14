/**
 * 업체 코스(붙여넣기·상품 링크 "그대로 가져오기")에 확인된 항공편 시각을 맞춘다.
 *  - 원문에 항공 시각이 없으면 첫날이 기본 08:00 "인천 출발"로 시작하고, 귀국편도 오전으로 찍히던 문제를 막는다.
 *  - 원문에 비행 항목이 아예 없으면 첫날 앞·마지막 날 뒤에 출발·도착 항목을 만들어 넣는다.
 *  - 점심 무렵 도착인데 관광을 먼저 하느라 점심이 13:30 뒤로 밀리면, 점심을 도착 바로 뒤로 당긴다.
 */
import { clockMinutes, dayMeetingTime, walkTimeline } from "@/lib/dayLoad";
import { applyFlightWithMeals, looksLikeFlightItem } from "@/lib/flightApply";
import { mealSlotOf } from "@/lib/mealSlot";
import type { DayPlan, FlightOption, ItineraryItem } from "@/types";

const item = (id: string, type: ItineraryItem["type"], name: string, travel: number | null = null): ItineraryItem => ({
  id,
  type,
  name,
  description: "",
  stayMinutes: 0,
  travelMinutesToNext: travel,
  entryFee: 0,
  mealCost: 0,
  isEstimated: false,
  admission: "none",
});

const hasClock = (s: string) => clockMinutes((/(\d{1,2}):(\d{2})/.exec(s)?.[0] ?? "").padStart(5, "0")) !== null;

/** 출발 시각을 하나라도 아는 항공편인가 */
export function flightHasTimes(f: FlightOption | null | undefined): f is FlightOption {
  return !!f && (hasClock(f.departTime) || hasClock(f.returnDepartTime));
}

/** 비행 항목이 없는 첫날·마지막 날에 출발·도착 항목을 만든다 (시각은 applyFlightWithMeals가 맞춘다) */
function ensureFlightItems(days: DayPlan[], f: FlightOption): DayPlan[] {
  if (days.length === 0) return days;
  const next = [...days];
  const first = next[0];
  if (first.kind === "linear" && hasClock(f.departTime) && !first.items.some(looksLikeFlightItem)) {
    next[0] = {
      ...first,
      items: [item("pf-out-dep", "flight", `${f.departAirport || "인천"} 출발`, 0), item("pf-out-arr", "flight", `${f.arriveAirport || "현지 공항"} 도착`, 40), ...first.items],
    };
  }
  const li = next.length - 1;
  const last = next[li];
  if (li > 0 && last.kind === "linear" && hasClock(f.returnDepartTime) && !last.items.some(looksLikeFlightItem)) {
    next[li] = {
      ...last,
      items: [
        ...last.items,
        item("pf-ret-transfer", "transfer", `${f.returnDepartAirport || "현지 공항"} 공항 이동`, 40),
        item("pf-ret-dep", "flight", `${f.returnDepartAirport || "현지 공항"} 출발`, 0),
        item("pf-ret-arr", "flight", `${f.returnArriveAirport || "인천"} 도착`, 0),
      ],
    };
  }
  return next;
}

const LATE_LUNCH = 13 * 60 + 30;

/**
 * 점심 무렵(10:30~13:30) 도착한 날, 관광을 먼저 하느라 점심이 13:30 뒤로 밀렸으면 점심을 도착(과 바로 뒤 이동) 다음으로 당긴다.
 * 바꿨으면 새 날, 아니면 그대로.
 */
export function lunchAfterArrival(day: DayPlan): DayPlan {
  if (day.kind !== "linear") return day;
  const slots = walkTimeline(day.items, dayMeetingTime(day));
  const flights = slots.filter((s) => looksLikeFlightItem(s.item));
  const arrival = flights[1] ?? null;
  if (!arrival) return day;
  const arrMin = arrival.start % 1440;
  if (arrMin < 10 * 60 + 30 || arrMin > LATE_LUNCH) return day;
  const items = day.items;
  const arrIdx = items.indexOf(arrival.item);
  let insertAt = arrIdx + 1;
  while (insertAt < items.length && items[insertAt].type === "transfer") insertAt++;
  const lunchIdx = items.findIndex((i, k) => k >= insertAt && mealSlotOf(i) === "lunch");
  if (lunchIdx <= insertAt) return day;
  const lunchSlot = slots.find((s) => s.item === items[lunchIdx]);
  if (!lunchSlot || lunchSlot.start % 1440 <= LATE_LUNCH) return day;
  const lunch = items[lunchIdx];
  const rest = items.filter((_, k) => k !== lunchIdx);
  // 점심 앞 항목의 이동 시간은 점심이 빠진 자리를 건너 다음 장소로 이어진다 (점심의 이동 시간을 물려받음)
  const before = lunchIdx - 1;
  if (before >= 0 && rest[before] === items[before]) rest[before] = { ...items[before], travelMinutesToNext: lunch.travelMinutesToNext ?? items[before].travelMinutesToNext };
  rest.splice(insertAt, 0, { ...lunch, travelMinutesToNext: lunch.travelMinutesToNext ?? 20 });
  return { ...day, items: rest };
}

const TOUR_TYPES = new Set(["sightseeing", "experience", "shopping", "massage", "meal"]);

/**
 * 출국일에 관광이 있으면 귀국편 시각에서 거꾸로 계산하지 않는다 (예전: 13:20 로비 미팅 → 16:50 점심).
 * 조식 후 09:00에 출발하고, 귀국편 출발 시각은 표와 같게 고정한다 — 남는 시간은 공항 가기 전 빈 시간 채우기로.
 */
function morningDeparture(days: DayPlan[], f: FlightOption): DayPlan[] {
  const li = days.length - 1;
  const last = days[li];
  const time = (/(\d{1,2}):(\d{2})/.exec(f.returnDepartTime)?.[0] ?? "").padStart(5, "0");
  if (li < 1 || last.kind !== "linear" || !hasClock(time)) return days;
  const fi = last.items.findIndex(looksLikeFlightItem);
  if (fi < 0 || !last.items.slice(0, fi).some((i) => TOUR_TYPES.has(i.type ?? ""))) return days;
  const items = last.items.map((it, k) => (k === fi ? { ...it, fixedTime: time } : it));
  return [...days.slice(0, li), { ...last, items, meetingTime: "09:00" }];
}

/** 확인된 항공편을 업체 코스에 맞춘다 (비행 항목이 없으면 만들고, 시각·식사 시간대·도착일 점심까지) */
export function withPastedFlight(days: DayPlan[], f: FlightOption): DayPlan[] {
  if (days.length === 0 || !flightHasTimes(f)) return days;
  const applied = applyFlightWithMeals(morningDeparture(ensureFlightItems(days, f), f), f);
  return applied.length === 0 ? applied : [lunchAfterArrival(applied[0]), ...applied.slice(1)];
}
