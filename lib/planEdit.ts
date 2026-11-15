/**
 * 고객용 코스 화면의 쉬운 수정·요약·도시 사이 교통 비교 (AI 없음, 화면에서 바로 계산).
 */
import { dayTourStart, formatClock, walkTimeline } from "@/lib/dayLoad";
import { km } from "@/lib/courseEngine/time";
import type { DayPlan, ItineraryItem } from "@/types";

const TOUR = new Set(["sightseeing", "experience", "shopping", "massage"]);
export const isTourItem = (i: ItineraryItem) => TOUR.has(i.type ?? "sightseeing");

/** 장소 빼기 — 앞 장소가 빠진 장소의 다음 이동을 이어받는다 */
export function removeItem(days: DayPlan[], id: string): DayPlan[] {
  return days.map((d) => {
    const k = d.items.findIndex((i) => i.id === id);
    if (k < 0) return d;
    const items = d.items.slice();
    const [gone] = items.splice(k, 1);
    if (k > 0) items[k - 1] = { ...items[k - 1], travelMinutesToNext: Math.max(items[k - 1].travelMinutesToNext ?? 0, gone.travelMinutesToNext ?? 0) };
    return { ...d, items };
  });
}

/** 다른 날로 옮기기 — 그날 숙박·공항 줄 앞에 넣는다 */
export function moveItem(days: DayPlan[], id: string, toDay: number): DayPlan[] {
  const item = days.flatMap((d) => d.items).find((i) => i.id === id);
  if (!item) return days;
  const removed = removeItem(days, id);
  return removed.map((d) => {
    if (d.day !== toDay) return d;
    let at = d.items.length;
    while (at > 0 && ["hotel", "flight", "transfer"].includes(d.items[at - 1].type ?? "")) at--;
    const items = d.items.slice();
    items.splice(at, 0, { ...item, travelMinutesToNext: item.travelMinutesToNext ?? 20 });
    return { ...d, items };
  });
}

/** 비슷한 곳으로 바꾸기 — 이름만 바꾸고 체류는 그대로 (추천 장소 목록에서 아직 없는 곳) */
export function swapItem(days: DayPlan[], id: string, name: string): DayPlan[] {
  return days.map((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, name, description: "", lat: undefined, lng: undefined } : i)) }));
}

/** 이 날 가볍게 — 마지막 관광 하나를 빼고, 늦은 출발(10:00) */
export function lightenDay(days: DayPlan[], dayNo: number): DayPlan[] {
  const d = days.find((x) => x.day === dayNo);
  if (!d) return days;
  const last = [...d.items].reverse().find(isTourItem);
  const next = last && d.items.filter(isTourItem).length > 1 ? removeItem(days, last.id) : days;
  return next.map((x) => (x.day === dayNo && !x.items.some((i) => i.type === "flight") ? { ...x, meetingTime: "10:00" } : x));
}

/** 날짜별 시각 (화면 표시) */
export function dayTimes(d: DayPlan): Map<string, string> {
  return new Map(walkTimeline(d.items, dayTourStart(d)).map((s) => [s.item.id, formatClock(s.start)]));
}

/** 한 화면 요약 — 도시별 숙박·관광 수·식사 수 */
export function planSummary(days: DayPlan[]): { nights: { city: string; nights: number }[]; tours: number; meals: number } {
  const nights: { city: string; nights: number }[] = [];
  for (const d of days) {
    const c = (d.overnightCity ?? "").trim();
    if (!c) continue;
    const last = nights.at(-1);
    if (last && last.city === c) last.nights += 1;
    else nights.push({ city: c, nights: 1 });
  }
  const all = days.flatMap((d) => d.items);
  return { nights, tours: all.filter(isTourItem).length, meals: all.filter((i) => i.type === "meal").length };
}

// ── 도시 사이 교통 비교 ──

export interface TransportOption {
  mode: "car" | "bus" | "train" | "flight";
  label: string;
  minutes: number;
  note: string;
}

/**
 * 직선거리로 어림한 도시 사이 이동 — 차량(도로 우회 1.3배, 평균 60km/h), 고속버스(55km/h + 승하차 20분),
 * 기차(80km 이상, 평균 90km/h + 역 이동 30분), 항공(400km 이상, 비행 700km/h + 공항 2시간 30분). 요금은 상담 때 확인.
 */
export function transportOptions(a: { lat: number; lng: number }, b: { lat: number; lng: number }): { km: number; options: TransportOption[] } {
  const d = Math.round(km(a, b) * 1.3);
  const opts: TransportOption[] = [
    { mode: "car", label: "전용차량", minutes: Math.round((d / 60) * 60) + 10, note: "짐 걱정 없이 문 앞에서 문 앞까지" },
    { mode: "bus", label: "고속버스", minutes: Math.round((d / 55) * 60) + 20, note: "가장 저렴 · 정류장까지 이동 필요" },
  ];
  if (d >= 80) opts.push({ mode: "train", label: "기차", minutes: Math.round((d / 90) * 60) + 30, note: "정시성 좋음 · 역까지 이동 필요" });
  if (d >= 400) opts.push({ mode: "flight", label: "항공", minutes: Math.round((d / 700) * 60) + 150, note: "공항 수속 포함" });
  return { km: d, options: opts.sort((x, y) => x.minutes - y.minutes) };
}

/** 대중교통 길찾기 (구글 지도 — 무료 링크) */
export function transitLink(from: string, to: string): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}&travelmode=transit`;
}
