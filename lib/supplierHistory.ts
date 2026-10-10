import type { CurrencyCode, SupplierQuote, TripInput } from "@/types";

/**
 * 업체 견적 기록 — 읽은 업체 견적서를 여행지별로 쌓아 둔다 (이 브라우저, 백업 파일에 포함).
 *  - 같은 업체의 지난 요금과 견줘 단가 추이를 보고 (협상 근거)
 *  - 같은 여행지로 받은 여러 업체 견적을 한 표에서 견준다 (공급가·요일별 범위·호텔·최소 인원·포함)
 */

const KEY = "semitour-planner:supplierQuotes";
export const MAX_RECORDS = 100;

export interface SupplierRecord {
  id: string;
  at: string;
  /** 업체 이름 (파일 이름에서 짐작, 고칠 수 있다) */
  supplier: string;
  fileName: string;
  packageName: string;
  destination: string;
  nights: number;
  days: number;
  currency: CurrencyCode;
  /** 앱 통화 1인 공급가 (요일별 요금이면 고른 요일) */
  pricePerPerson: number;
  /** 요일별 요금 범위 (앱 통화) */
  priceLow: number;
  priceHigh: number;
  originalPrice: number;
  originalCurrency: string;
  rate: number | null;
  hotels: string[];
  minTravelers: number;
  includes: string[];
  excludes: string[];
  shopping: string;
  options: string;
}

/** 파일 이름에서 업체 이름 짐작 — "261005 노노 패키지(마카오) 인베스트 투어.docx" → "인베스트 투어" */
export function supplierNameFromFile(name: string): string {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/^[\d\s._-]+/, "").trim();
  const afterParen = base.split(/[)\]]/).pop()?.trim() ?? "";
  if (afterParen.length >= 2) return afterParen.slice(0, 40);
  return base.slice(0, 40);
}

export function recordFromQuote(q: SupplierQuote, input: Pick<TripInput, "destination" | "nights" | "days" | "currency" | "supplierPricePerPerson">, fileName: string, packageName: string, now = new Date()): SupplierRecord {
  const dated = (q.datePrices ?? []).filter((d) => d.nights === 0 || d.nights === input.nights).map((d) => d.pricePerPerson).filter((v) => v > 0);
  const price = input.supplierPricePerPerson || q.picked?.price || q.pricePerPerson;
  return {
    id: `sq-${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    at: now.toISOString(),
    supplier: supplierNameFromFile(fileName) || "업체",
    fileName,
    packageName,
    destination: input.destination.trim(),
    nights: input.nights,
    days: input.days,
    currency: input.currency,
    pricePerPerson: Math.round(price),
    priceLow: Math.round(dated.length ? Math.min(...dated) : price),
    priceHigh: Math.round(dated.length ? Math.max(...dated) : price),
    originalPrice: q.originalPrice,
    originalCurrency: q.originalCurrency,
    rate: q.rate,
    hotels: (q.hotelNames ?? []).slice(0, 6),
    minTravelers: q.minTravelers ?? 0,
    includes: q.includes.slice(0, 20),
    excludes: q.excludes.slice(0, 20),
    shopping: q.shopping,
    options: q.options,
  };
}

export function loadSupplierHistory(): SupplierRecord[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as SupplierRecord[];
    return Array.isArray(list) ? list.filter((r) => r && typeof r.id === "string" && typeof r.pricePerPerson === "number") : [];
  } catch {
    return [];
  }
}

function save(list: SupplierRecord[]): SupplierRecord[] {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_RECORDS)));
  } catch {
    /* 저장 못 해도 화면은 계속 */
  }
  return list.slice(0, MAX_RECORDS);
}

/** 맨 앞에 넣는다. 같은 파일·같은 요금을 다시 읽은 것은 바꿔 넣는다 */
export function addSupplierRecord(list: SupplierRecord[], rec: SupplierRecord): SupplierRecord[] {
  const same = (r: SupplierRecord) => r.fileName === rec.fileName && r.originalPrice === rec.originalPrice && r.nights === rec.nights;
  return save([rec, ...list.filter((r) => !same(r))]);
}

export function updateSupplierRecord(list: SupplierRecord[], id: string, patch: Partial<SupplierRecord>): SupplierRecord[] {
  return save(list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
}

export function removeSupplierRecord(list: SupplierRecord[], id: string): SupplierRecord[] {
  return save(list.filter((r) => r.id !== id));
}

const tokens = (s: string) =>
  s
    .toLowerCase()
    .split(/[\s,/·()]+/)
    .map((t) => t.replace(/(시|도|성|섬)$/, ""))
    .filter((t) => t.length >= 2);

/** 같은 여행지 기록 (여행지 이름이 한 단어라도 겹치면), 최근 순 */
export function sameDestination(list: SupplierRecord[], destination: string): SupplierRecord[] {
  const want = new Set(tokens(destination));
  if (want.size === 0) return [];
  return list.filter((r) => tokens(`${r.destination} ${r.packageName}`).some((t) => want.has(t)));
}

export interface SupplierTrend {
  supplier: string;
  /** 같은 업체·같은 박수의 바로 전 기록 */
  previous: SupplierRecord;
  latest: SupplierRecord;
  /** 원문 통화 기준 변화율 % (환율 영향 없이) */
  changePct: number;
}

/** 같은 업체·같은 박수로 받은 견적의 요금 변화 (원문 통화 기준) */
export function supplierTrends(list: SupplierRecord[]): SupplierTrend[] {
  const out: SupplierTrend[] = [];
  const seen = new Set<string>();
  for (const r of list) {
    const key = `${r.supplier}|${r.nights}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const prev = list.find((x) => x !== r && x.supplier === r.supplier && x.nights === r.nights && x.originalCurrency === r.originalCurrency && x.at < r.at);
    if (!prev || prev.originalPrice <= 0) continue;
    out.push({ supplier: r.supplier, previous: prev, latest: r, changePct: Math.round((r.originalPrice / prev.originalPrice - 1) * 1000) / 10 });
  }
  return out;
}
