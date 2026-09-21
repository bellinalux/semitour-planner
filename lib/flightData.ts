import type { FlightDeal } from "@/types";

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

function dateOf(v: unknown): string {
  return typeof v === "string" && DATE_RE.test(v) ? v.slice(0, 10) : "";
}

function toDeal(raw: Obj, fallbackDate: string): FlightDeal | null {
  const price = Number(raw.price ?? raw.value);
  const departDate = dateOf(raw.departure_at) || dateOf(raw.depart_date) || fallbackDate;
  if (!Number.isFinite(price) || price <= 0 || !departDate) return null;
  const transfers = Number(raw.transfers ?? raw.number_of_changes ?? 0);
  return {
    departDate,
    returnDate: dateOf(raw.return_at) || dateOf(raw.return_date),
    price: Math.round(price),
    transfers: Number.isFinite(transfers) ? transfers : 0,
    airline: typeof raw.airline === "string" ? raw.airline : "",
    expiresAt: typeof raw.expires_at === "string" ? raw.expires_at : "",
  };
}

/**
 * Travelpayouts 요금 달력(/v1/prices/calendar) 응답을 후보 목록으로 바꾼다.
 * data는 { "2026-11-03": { price, airline, transfers, departure_at, return_at, expires_at } } 형태다.
 * 형식이 다르거나 요금이 없는 항목은 건너뛴다.
 */
export function parseCalendarResponse(body: unknown): FlightDeal[] {
  if (!isObj(body) || body.success === false) return [];
  const data = body.data;
  const deals: FlightDeal[] = [];
  if (Array.isArray(data)) {
    for (const row of data) {
      const deal = isObj(row) ? toDeal(row, "") : null;
      if (deal) deals.push(deal);
    }
  } else if (isObj(data)) {
    for (const [key, row] of Object.entries(data)) {
      const deal = isObj(row) ? toDeal(row, dateOf(key)) : null;
      if (deal) deals.push(deal);
    }
  }
  return deals;
}

/** YYYY-MM-DD 두 날짜 사이의 일수 */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86_400_000) : NaN;
}

/** 오늘로부터 minLeadDays일 이후 출발만 남기고, 같은 출발일은 가장 싼 것 하나만 둔다. */
export function usableDeals(deals: FlightDeal[], today: string, minLeadDays: number): FlightDeal[] {
  const best = new Map<string, FlightDeal>();
  for (const d of deals) {
    if (daysBetween(today, d.departDate) < minLeadDays) continue;
    const prev = best.get(d.departDate);
    if (!prev || d.price < prev.price) best.set(d.departDate, d);
  }
  return [...best.values()].sort((a, b) => a.price - b.price || a.departDate.localeCompare(b.departDate));
}

/** 월(YYYY-MM)별로 가장 싼 요금 하나씩. 월 순서대로 돌려준다. */
export function monthlyCheapest(deals: FlightDeal[]): { month: string; deal: FlightDeal }[] {
  const best = new Map<string, FlightDeal>();
  for (const d of deals) {
    const month = d.departDate.slice(0, 7);
    const prev = best.get(month);
    if (!prev || d.price < prev.price) best.set(month, d);
  }
  return [...best.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, deal]) => ({ month, deal }));
}

/** 오늘부터 count개월의 YYYY-MM 목록 (이번 달 포함) */
export function upcomingMonths(today: string, count: number): string[] {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const total = (y ?? 1970) * 12 + ((m ?? 1) - 1) + i;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
  });
}
