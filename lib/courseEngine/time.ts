import { DAY_KEYS, type DayKey } from "./types";

/** "09:30" → 570, 못 읽으면 null */
export function hm(s?: string | null): number | null {
  const m = /(\d{1,2})\s*[:시]\s*(\d{2})?/.exec(String(s ?? ""));
  return m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : null;
}
/** 570 → "09:30" (24시 넘으면 다음날 시각) */
export function fmt(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
/** "약 1시간 30분" · "90분" · "1.5시간" → 분 */
export function durMin(s?: string | null): number | null {
  const t = String(s ?? "");
  let m = 0, hit = false;
  const h = /(\d+(?:\.\d+)?)\s*(?:시간|h(?:ours?)?\b)/i.exec(t); if (h) { m += parseFloat(h[1]) * 60; hit = true; }
  const mi = /(\d+)\s*(?:분|min)/i.exec(t); if (mi) { m += Number(mi[1]); hit = true; }
  return hit ? Math.round(m) : null;
}
/** 영업시간 글자 → [[열기, 닫기]] / [] 휴무 / null 모름 */
export function parseRange(s?: string | null): [number, number][] | null {
  const t = String(s ?? "").trim();
  if (!t) return null;
  if (/closed|휴무|휴관|휴업/i.test(t)) return [];
  if (/24\s*(시간|h)|open 24/i.test(t)) return [[0, 1440]];
  const out: [number, number][] = [];
  const re = /(\d{1,2}:\d{2})\s*[-–~]\s*(\d{1,2}:\d{2})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const a = hm(m[1])!, b0 = hm(m[2])!;
    out.push([a, b0 <= a ? b0 + 1440 : b0]);
  }
  return out.length ? out : null;
}
export const dayKey = (weekday?: number): DayKey | null => (weekday == null || weekday < 0 || weekday > 6 ? null : DAY_KEYS[weekday]);

/** 두 좌표 사이 직선거리(km) */
export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, r = (x: number) => (x * Math.PI) / 180;
  const dLa = r(b.lat - a.lat), dLo = r(b.lng - a.lng);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/**
 * 지도 길찾기를 못 쓸 때의 이동 시간 어림(분) — 직선거리 × 도로 우회 계수 ÷ 속도 + 타고 내리는 시간.
 * 도보 4.5km/h, 차량 시내 25km/h·교외 50km/h, 대중교통 18km/h + 대기 8분
 */
export function estimateTravel(a: { lat?: number; lng?: number }, b: { lat?: number; lng?: number }, mode: "car" | "walk" | "public"): number {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return 15;
  const d = km({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }) * 1.35;
  if (d < 0.05) return 0;
  if (mode === "walk") return Math.max(3, Math.round((d / 4.5) * 60));
  if (mode === "public") return Math.round((d / 18) * 60 + 8);
  const v = d < 8 ? 25 : 50;
  return Math.round((d / v) * 60 + 5);
}

/** 요일별 영업시간을 사람이 읽는 한 줄로 ("월 휴무 · 화~일 09:00-18:00") */
export function hoursText(open?: Partial<Record<DayKey, string>>): string {
  if (!open) return "";
  const KO = ["일", "월", "화", "수", "목", "금", "토"], order = [1, 2, 3, 4, 5, 6, 0];
  const v = (d: number) => { const s = String(open[DAY_KEYS[d]] ?? "").trim(); return /closed/i.test(s) ? "휴무" : /24h/i.test(s) ? "24시간" : s; };
  if (!order.some(d => v(d))) return "";
  const groups: { from: number; to: number; v: string }[] = [];
  order.forEach(d => { const x = v(d) || "?"; const g = groups[groups.length - 1]; if (g && g.v === x) g.to = d; else groups.push({ from: d, to: d, v: x }); });
  return groups.map(g => `${KO[g.from]}${g.from !== g.to ? "~" + KO[g.to] : ""} ${g.v}`).join(" · ");
}
