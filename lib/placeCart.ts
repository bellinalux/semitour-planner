/**
 * 장소 담기 → 자동 배치 (마이로 방식) — 넣고 싶은 장소를 담으면 날짜별로 나누고, 코스 엔진이 영업시간·점심·동선에 맞춰 순서와 시각을 정한다.
 * 이 파일은 AI 없이 도는 나누기·일정 변환만 (서버 경로: app/api/place-cart).
 */
import { km } from "@/lib/courseEngine/time";
import type { TimelineStop } from "@/lib/courseEngine/types";
import type { DayPlan, ItineraryItem } from "@/types";

export interface CartPlace {
  id: string;
  name: string;
  lat?: number;
  lng?: number;
  /** 머무는 시간 (분) */
  stayMin: number;
}

const has = (p: CartPlace) => typeof p.lat === "number" && typeof p.lng === "number";
/** 장소 하나에 드는 시간 — 체류 + 이동 어림 20분 */
const cost = (p: CartPlace) => Math.max(20, p.stayMin) + 20;

/**
 * 날짜 수만큼 나눈다 — 좌표가 있는 곳은 가까운 순서로 이은 뒤(최근접 이웃) 하루 시간이 고르게 끊고,
 * 좌표를 모르는 곳은 가장 가벼운 날에 붙인다. 하루 7시간 30분을 넘기면 다음 날로 넘긴다.
 */
export function splitIntoDays(places: CartPlace[], days: number, budget = 450): CartPlace[][] {
  const n = Math.max(1, Math.min(days, places.length));
  const located = places.filter(has);
  const loose = places.filter((p) => !has(p));
  // 최근접 이웃 사슬 — 가장 서쪽 장소에서 시작 (한 방향으로 훑는다)
  const chain: CartPlace[] = [];
  const left = located.slice().sort((a, b) => a.lng! - b.lng!);
  let cur = left.shift();
  while (cur) {
    chain.push(cur);
    let bi = -1;
    let bd = Infinity;
    left.forEach((p, i) => {
      const d = km({ lat: cur!.lat!, lng: cur!.lng! }, { lat: p.lat!, lng: p.lng! });
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    cur = bi >= 0 ? left.splice(bi, 1)[0] : undefined;
  }
  const total = chain.reduce((s, p) => s + cost(p), 0) + loose.reduce((s, p) => s + cost(p), 0);
  const target = Math.min(budget, Math.ceil(total / n));
  const out: CartPlace[][] = Array.from({ length: n }, () => []);
  let di = 0;
  let used = 0;
  for (const p of chain) {
    if (used > 0 && used + cost(p) > target && di < n - 1) {
      di += 1;
      used = 0;
    }
    out[di].push(p);
    used += cost(p);
  }
  for (const p of loose) {
    const light = out.reduce((bi, d, i) => (d.reduce((s, x) => s + cost(x), 0) < out[bi].reduce((s, x) => s + cost(x), 0) ? i : bi), 0);
    out[light].push(p);
  }
  return out.filter((d) => d.length > 0);
}

/** 코스 엔진 시간표 → 일정 하루 (장소 사이 이동 = 다음 장소 도착 − 이 장소 끝) */
export function timelineToDay(dayNo: number, city: string, start: string, stops: TimelineStop[], places: Map<string, CartPlace & { meal?: boolean }>): DayPlan {
  const items: ItineraryItem[] = stops.map((s, k) => {
    const p = places.get(s.id);
    const next = stops[k + 1];
    const meal = !!p?.meal;
    return {
      id: `cart-${dayNo}-${s.id}`,
      type: meal ? "meal" : "sightseeing",
      ...(meal ? { mealSlot: "lunch" as const, cuisine: "현지식" } : {}),
      admission: meal ? "none" : "unknown",
      name: s.name,
      description: "",
      stayMinutes: Math.max(0, Math.round(s.end - s.start)),
      travelMinutesToNext: next ? Math.max(0, Math.round(next.arrive - s.end)) : 0,
      entryFee: 0,
      mealCost: 0,
      isEstimated: true,
      ...(p && has(p) ? { lat: p.lat, lng: p.lng } : {}),
    };
  });
  return { day: dayNo, theme: `DAY ${dayNo} ${city}`.trim(), kind: "linear", items, amGuided: [], pmFreeOptions: [], overnightCity: city, meetingTime: start };
}
