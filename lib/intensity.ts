import { km } from "@/lib/courseEngine/time";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import type { DayPlan, ItineraryItem } from "@/types";

/**
 * 활동 강도 — 하루 걷는 거리(어림)와 계단·오르막이 있는 곳으로 "쉬움 / 보통 / 많이 걸음"을 정한다.
 * 상품 소개서·일정표에 적어 시니어·가족 고객이 미리 고르게 한다 (판매용 표기, 현장용 아님).
 *  - 걷는 거리: 걸어서 잇는 이동(좌표가 있으면 직선×1.3, 없으면 도보 10분 이하 이동을 4.5km/h로) + 둘러보는 곳 안에서 걷는 거리(1시간에 약 1km)
 *  - 계단·오르막: 이름·설명에 등산·트레킹·계단·성곽·전망대 오르막 같은 말이 있는 곳
 */

export type IntensityLevel = "easy" | "moderate" | "hard";
export const INTENSITY_LABEL: Record<IntensityLevel, string> = { easy: "쉬움", moderate: "보통", hard: "많이 걸음" };

const STAIRS = /등산|트레킹|하이킹|계단|오르막|성곽|산행|정상|협곡|동굴 탐험/;
const BROWSE = new Set(["sightseeing", "shopping", "experience"]);

export interface DayIntensity {
  day: number;
  km: number;
  stairs: string[];
  level: IntensityLevel;
}

const coord = (i: ItineraryItem) => (typeof i.lat === "number" && typeof i.lng === "number" ? { lat: i.lat, lng: i.lng } : null);

export function dayIntensity(day: DayPlan, pmChoice: PmChoice): DayIntensity {
  const items = dayItems(day, pmChoice);
  let walk = 0;
  items.forEach((it, k) => {
    if (BROWSE.has(it.type ?? "sightseeing")) walk += (Math.max(0, it.stayMinutes) / 60) * 1;
    const next = items[k + 1];
    const t = it.travelMinutesToNext ?? 0;
    if (!next || t <= 0 || t > 12) return;
    const a = coord(it);
    const b = coord(next);
    walk += a && b ? Math.min(1.5, km(a, b) * 1.3) : (t / 60) * 4.5;
  });
  const stairs = items.filter((i) => STAIRS.test(`${i.name} ${i.description}`)).map((i) => i.name);
  const kmRound = Math.round(walk * 10) / 10;
  const level: IntensityLevel = kmRound >= 8 || stairs.some((s) => /등산|트레킹|하이킹|산행|정상/.test(s)) ? "hard" : kmRound >= 4 || stairs.length > 0 ? "moderate" : "easy";
  return { day: day.day, km: kmRound, stairs, level };
}

/** 여행 전체 — 가장 힘든 날 기준, 하루 평균 걷는 거리 */
export function tripIntensity(days: DayPlan[], pmChoice: PmChoice): { level: IntensityLevel; avgKm: number; maxKm: number; days: DayIntensity[] } {
  const list = days.map((d) => dayIntensity(d, pmChoice)).filter((d) => d.km > 0 || d.stairs.length > 0);
  const order: IntensityLevel[] = ["easy", "moderate", "hard"];
  const level = list.reduce<IntensityLevel>((m, d) => (order.indexOf(d.level) > order.indexOf(m) ? d.level : m), "easy");
  const avg = list.length ? Math.round((list.reduce((s, d) => s + d.km, 0) / list.length) * 10) / 10 : 0;
  return { level, avgKm: avg, maxKm: Math.max(0, ...list.map((d) => d.km)), days: list };
}

/** 문서용 한 줄 ("보통 · 하루 평균 약 4.5km 걷기 · 계단 있는 곳: ○○") */
export function intensityText(days: DayPlan[], pmChoice: PmChoice): string {
  const t = tripIntensity(days, pmChoice);
  if (t.days.length === 0) return "";
  const stairs = [...new Set(t.days.flatMap((d) => d.stairs))].slice(0, 3);
  return `${INTENSITY_LABEL[t.level]} · 하루 평균 약 ${t.avgKm}km 걷기${stairs.length ? ` · 계단·오르막: ${stairs.join(", ")}` : ""}`;
}
