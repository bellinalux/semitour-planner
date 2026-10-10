import { knowledgeKey } from "@/lib/knowledge";

/**
 * 회사 요금표 — 호텔·차량·가이드 요금을 업체 견적(실제 거래가)과 웹 시세로 쌓아 두고, 다음 견적은 이것부터 쓴다.
 *  - 업체 견적가: 6개월 안, 같은 시즌(출발 달 ±1개월)이면 그대로 쓴다 (가장 믿을 만함)
 *  - 웹 시세: 30일 안이면 다시 찾지 않는다
 *  - 둘 다 없거나 오래됐으면 웹에서 새로 찾고 요금표에 더한다
 * 회사(접근 코드) 안에서만 쓴다 — 업체 실제 요금은 영업 비밀. 순수 함수만 둔다 (저장은 lib/server/rateStore.ts).
 */

export interface RateObs {
  at: string;
  /** 숙박·이용 달 (1~12, 모르면 0) */
  month: number;
  low: number;
  high: number;
  currency: string;
  source: "supplier" | "web";
  /** 업체·사이트 이름 */
  by: string;
  note?: string;
}

export interface HotelCheck {
  exists: boolean;
  officialName: string;
  grade: string;
  area: string;
  /** 주요 관광지까지 거리·위치 한 줄 */
  location: string;
  note: string;
  at: string;
}

export interface HotelRateCard {
  key: string;
  name: string;
  city: string;
  grade: string;
  area: string;
  /** 한국인 이용 확인 (한국어 후기·커뮤니티) */
  korean: boolean;
  koreanNote: string;
  /** 이 호텔을 쓰는 국내 여행사 패키지 */
  agencies: string[];
  check?: HotelCheck;
  rates: RateObs[];
  updatedAt: string;
}

export interface GroundRateCard {
  key: string;
  kind: "vehicle" | "guide";
  /** 차종·가이드 종류 (예: 16인승, 한국어 가이드) */
  label: string;
  rates: RateObs[];
  updatedAt: string;
}

export interface CityRates {
  city: string;
  hotels: HotelRateCard[];
  ground: GroundRateCard[];
  updatedAt: string;
}

const MAX_OBS = 40;
const MAX_HOTELS = 200;
export const SUPPLIER_FRESH_DAYS = 180;
export const WEB_FRESH_DAYS = 30;

export const emptyRates = (city: string): CityRates => ({ city, hotels: [], ground: [], updatedAt: "" });
const daysAgo = (iso: string, now: Date) => Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
const uniq = (xs: string[], n: number) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))].slice(0, n);

/** 같은 호텔 찾기 (괄호 병기·띄어쓰기 달라도, 한쪽 이름이 다른 쪽에 들어 있어도) */
export function findHotel(doc: CityRates, name: string): HotelRateCard | undefined {
  const key = knowledgeKey(name);
  if (!key) return undefined;
  return doc.hotels.find((h) => h.key === key) ?? doc.hotels.find((h) => key.length >= 4 && (h.key.includes(key) || key.includes(h.key)));
}

export interface HotelInfo {
  name: string;
  grade?: string;
  area?: string;
  korean?: boolean;
  koreanNote?: string;
  agencies?: string[];
  check?: HotelCheck;
}

/** 호텔 정보·요금 기록을 더한다 (요금이 0이면 정보만) */
export function addHotel(doc: CityRates, info: HotelInfo, obs?: RateObs | null, now = new Date()): CityRates {
  const at = now.toISOString();
  const cur = findHotel(doc, info.name);
  const key = cur?.key ?? knowledgeKey(info.name);
  if (!key) return doc;
  const rates = obs && obs.high > 0 ? [obs, ...(cur?.rates ?? [])].slice(0, MAX_OBS) : (cur?.rates ?? []);
  const next: HotelRateCard = {
    key,
    name: cur?.name ?? info.name.trim().slice(0, 100),
    city: doc.city,
    grade: info.grade?.trim() || cur?.grade || "",
    area: info.area?.trim() || cur?.area || "",
    korean: Boolean(info.korean || cur?.korean),
    koreanNote: info.koreanNote?.trim() || cur?.koreanNote || "",
    agencies: uniq([...(cur?.agencies ?? []), ...(info.agencies ?? [])], 8),
    ...(info.check ? { check: info.check } : cur?.check ? { check: cur.check } : {}),
    rates,
    updatedAt: at,
  };
  const hotels = cur ? doc.hotels.map((h) => (h.key === cur.key ? next : h)) : [next, ...doc.hotels].slice(0, MAX_HOTELS);
  return { ...doc, hotels, updatedAt: at };
}

/** 차량·가이드 요금 기록 */
export function addGround(doc: CityRates, kind: GroundRateCard["kind"], label: string, obs: RateObs, now = new Date()): CityRates {
  if (!(obs.high > 0)) return doc;
  const at = now.toISOString();
  const key = `${kind}:${knowledgeKey(label) || "기본"}`;
  const cur = doc.ground.find((g) => g.key === key);
  const next: GroundRateCard = { key, kind, label: label.trim().slice(0, 40) || (kind === "vehicle" ? "차량" : "가이드"), rates: [obs, ...(cur?.rates ?? [])].slice(0, MAX_OBS), updatedAt: at };
  return { ...doc, ground: cur ? doc.ground.map((g) => (g.key === key ? next : g)) : [...doc.ground, next], updatedAt: at };
}

const monthNear = (a: number, b: number) => a === 0 || b === 0 || Math.min(Math.abs(a - b), 12 - Math.abs(a - b)) <= 1;

export interface PickedRate {
  low: number;
  high: number;
  mid: number;
  obs: RateObs;
  /** 근거 한 줄 (예: "3주 전 ○○랜드사 견적가") */
  basis: string;
}

export function ageText(days: number): string {
  if (days <= 0) return "오늘";
  if (days < 7) return `${days}일 전`;
  if (days < 60) return `${Math.round(days / 7)}주 전`;
  return `${Math.round(days / 30)}개월 전`;
}

/**
 * 쓸 요금 고르기 — 같은 통화에서 ① 업체 견적가(180일 안, 같은 시즌) ② 웹 시세(30일 안). 없으면 null(새로 찾는다)
 * month: 출발 달 (모르면 0 — 시즌을 가리지 않는다)
 */
export function pickRate(rates: RateObs[], currency: string, month: number, now = new Date()): PickedRate | null {
  const same = rates.filter((r) => r.currency === currency && r.high > 0);
  const supplier = same.filter((r) => r.source === "supplier" && daysAgo(r.at, now) <= SUPPLIER_FRESH_DAYS && monthNear(r.month, month));
  const web = same.filter((r) => r.source === "web" && daysAgo(r.at, now) <= WEB_FRESH_DAYS);
  const obs = [...supplier].sort((a, b) => b.at.localeCompare(a.at))[0] ?? [...web].sort((a, b) => b.at.localeCompare(a.at))[0];
  if (!obs) return null;
  const low = Math.min(obs.low || obs.high, obs.high);
  return {
    low,
    high: obs.high,
    mid: Math.round((low + obs.high) / 2),
    obs,
    basis: `${ageText(daysAgo(obs.at, now))} ${obs.by || (obs.source === "supplier" ? "업체" : "웹")} ${obs.source === "supplier" ? "견적가" : "시세"}`,
  };
}

/**
 * AI 일정용 호텔 점수 — 한국인 이용(+2)·국내 여행사 패키지 사용(곳당 +1, 최대 3)·업체 견적가 있음(+2)·실재 확인(+1)
 */
export function hotelScore(h: HotelRateCard): number {
  return (h.korean ? 2 : 0) + Math.min(3, h.agencies.length) + (h.rates.some((r) => r.source === "supplier") ? 2 : 0) + (h.check?.exists ? 1 : 0);
}

/** 등급 조건에 맞는지 ("4", "4-5", "resort", "any") */
export function gradeMatches(grade: string, want: string): boolean {
  if (!want || want === "any") return true;
  if (want === "resort") return /리조트|resort/i.test(grade);
  const star = Number(/(\d)(?:\.\d)?\s*성|(\d)\s*star/i.exec(grade)?.slice(1).find(Boolean) ?? NaN);
  if (!Number.isFinite(star)) return false;
  const [lo, hi] = want.split("-").map(Number);
  return star >= lo && star <= (hi || lo);
}

/** 업체 견적서의 항목별 금액 → 요금표 기록 (호텔 1박·차량/가이드 1일) */
export function supplierObsFromQuote(
  q: { lines: { label: string; amount: number; unit: string }[]; hotelNames?: string[]; originalCurrency: string },
  supplier: string,
  month: number,
  now = new Date(),
): { hotels: { name: string; obs: RateObs }[]; ground: { kind: GroundRateCard["kind"]; label: string; obs: RateObs }[] } {
  const at = now.toISOString();
  const currency = q.originalCurrency.toUpperCase();
  const mk = (amount: number, note: string): RateObs => ({ at, month, low: amount, high: amount, currency, source: "supplier", by: supplier || "업체 견적", note });
  const hotels: { name: string; obs: RateObs }[] = [];
  const ground: { kind: GroundRateCard["kind"]; label: string; obs: RateObs }[] = [];
  const names = q.hotelNames ?? [];
  for (const l of q.lines) {
    if (!(l.amount > 0)) continue;
    if (l.unit === "per_room_night" && /호텔|숙박|객실|룸|room|hotel/i.test(l.label)) {
      // 호텔 후보가 여럿이면("~ 중 하나") 모두 같은 값으로 남긴다 (메모에 표시)
      for (const n of names.slice(0, 4)) hotels.push({ name: n, obs: mk(l.amount, names.length > 1 ? `후보 ${names.length}곳 공통 요금` : l.label) });
    } else if (l.unit === "per_day" && /차량|버스|밴|기사|vehicle|bus|van|car/i.test(l.label)) {
      ground.push({ kind: "vehicle", label: l.label.replace(/\s*\(.*?\)\s*/g, " ").trim(), obs: mk(l.amount, l.label) });
    } else if (l.unit === "per_day" && /가이드|guide/i.test(l.label)) {
      ground.push({ kind: "guide", label: l.label.replace(/\s*\(.*?\)\s*/g, " ").trim(), obs: mk(l.amount, l.label) });
    }
  }
  return { hotels, ground };
}

/** 최신 업체 견적가 / 웹 시세 (표시용) */
export function latest(rates: RateObs[], source: RateObs["source"]): RateObs | undefined {
  return [...rates].filter((r) => r.source === source).sort((a, b) => b.at.localeCompare(a.at))[0];
}
