import { recalcFlightDay, koreanAirport, zoneOf } from "@/lib/timezone";
import type { DayPlan, FlightOption } from "@/types";

/**
 * 출발지 맞추기 — 일정의 항공 항목(가는 편 출발·오는 편 도착)과 입력 출발지·적용한 항공편이 같은 국내 공항인지.
 * 업체 코스(김해 출발)를 읽었는데 출발지는 기본값 인천이면 항공 조회·견적·문서가 서로 다른 공항을 쓰게 된다.
 */

/** 원문 일정의 출발 공항 (첫 항공 항목, 국내 공항일 때만) */
export function originOfCourse(days: DayPlan[]): string | undefined {
  const first = days[0]?.items.find((i) => i.type === "flight");
  return (first && koreanAirport(first.name)) ?? undefined;
}

export interface OriginMismatch {
  course: string | null;
  input: string | null;
  flight: string | null;
  text: string;
}

/** 일정·입력 출발지·적용한 항공편의 국내 공항이 다르면 그 내용 (같거나 모르면 null) */
export function originMismatch(days: DayPlan[], originCity: string, selectedFlight: FlightOption | null | undefined): OriginMismatch | null {
  const course = originOfCourse(days) ?? null;
  const input = originCity.trim() ? koreanAirport(originCity) : null;
  const flight = selectedFlight?.departAirport ? koreanAirport(selectedFlight.departAirport) : null;
  const known = [course, input, flight].filter((x): x is string => Boolean(x));
  if (new Set(known).size <= 1) return null;
  const parts = [course && `일정 ${course} 출발`, input && `입력 출발지 ${input}`, flight && `적용한 항공편 ${flight} 출발`].filter(Boolean);
  return { course, input, flight, text: `출발 공항이 서로 다릅니다 — ${parts.join(" · ")}. 하나로 맞춰야 항공 조회·견적·일정표가 같은 공항을 씁니다` };
}

/** 일정의 국내 공항 이름을 바꾸고(가는 편 출발·오는 편 도착) 비행시간·시차를 다시 계산한다 */
export function renameOrigin(days: DayPlan[], airport: string): DayPlan[] {
  const target = zoneOf(airport);
  if (!target || target.country !== "한국") return days;
  const rename = (name: string) => {
    const z = zoneOf(name);
    if (!z || z.country !== "한국" || z.key === target.key) return name;
    const word = /도착/.test(name) ? "도착" : "출발";
    return `${airport.replace(/\s*(국제)?\s*공항$/, "")} 국제공항 ${word}`;
  };
  const last = days.length - 1;
  return days.map((d, i) => {
    if (i !== 0 && i !== last && i !== last - 1) return d;
    let changed = false;
    const items = d.items.map((it) => {
      if (it.type !== "flight") return it;
      const name = rename(it.name);
      if (name === it.name) return it;
      changed = true;
      return { ...it, name };
    });
    return changed ? recalcFlightDay({ ...d, items }, undefined, true) : d;
  });
}
