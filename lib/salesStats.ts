import type { Booking } from "@/lib/bookings";
import type { QuoteLogEntry } from "@/lib/quoteLog";

/**
 * 견적 성과 — 고객에게 나간 견적(견적 이력)과 예약 진행(예약 관리)을 모아, 어디·어느 가격대가 잘 팔리는지 본다.
 *  - 성약: 계약·계약금·완납·출발 (취소는 놓친 것으로)
 *  - 성약률 = 성약 ÷ (견적 발송 이후 단계 전체 — 문의만 한 것은 뺀다)
 *  - 성약 건 마진: 같은 여행지·출발일·인원으로 나간 마지막 견적의 마진
 */

export const WON = new Set<Booking["status"]>(["contracted", "deposit", "paid", "departed"]);
const DECIDED = new Set<Booking["status"]>(["quoted", "contracted", "deposit", "paid", "departed", "cancelled"]);

export interface StatRow {
  key: string;
  quotes: number;
  decided: number;
  won: number;
  /** 성약률 % (판단할 예약이 없으면 null) */
  winRate: number | null;
  /** 성약 건 1인 평균 판매가 (원화 예약만) */
  avgWonPrice: number | null;
  /** 성약 건 평균 마진 % (맞는 견적을 찾은 것만) */
  avgWonMargin: number | null;
}

export interface SalesStats {
  totalQuotes: number;
  totalDecided: number;
  totalWon: number;
  winRate: number | null;
  avgQuoteMargin: number | null;
  byDestination: StatRow[];
  byPriceBand: StatRow[];
}

const BANDS: { max: number; label: string }[] = [
  { max: 500_000, label: "50만 원 미만" },
  { max: 1_000_000, label: "50~100만 원" },
  { max: 1_500_000, label: "100~150만 원" },
  { max: 2_000_000, label: "150~200만 원" },
  { max: Infinity, label: "200만 원 이상" },
];

const perPerson = (b: Booking) => (b.travelers > 0 ? b.totalPrice / b.travelers : 0);
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);
const destKey = (s: string) => s.split(/[,\s]+/)[0]?.trim() || "미지정";

/** 예약과 같은 여행지·출발일·인원으로 나간 마지막 견적 */
function quoteFor(b: Booking, quotes: QuoteLogEntry[]): QuoteLogEntry | null {
  return quotes.find((q) => destKey(q.destination) === destKey(b.destination) && q.travelers === b.travelers && (!b.departureDate || !q.departureDate || q.departureDate === b.departureDate)) ?? null;
}

function row(key: string, quotes: QuoteLogEntry[], bookings: Booking[], allQuotes: QuoteLogEntry[]): StatRow {
  const decided = bookings.filter((b) => DECIDED.has(b.status));
  const won = decided.filter((b) => WON.has(b.status));
  return {
    key,
    quotes: quotes.length,
    decided: decided.length,
    won: won.length,
    winRate: decided.length ? Math.round((won.length / decided.length) * 1000) / 10 : null,
    avgWonPrice: avg(won.filter((b) => b.currency === "KRW").map(perPerson)),
    avgWonMargin: avg(won.map((b) => quoteFor(b, allQuotes)?.marginRate).filter((m): m is number => typeof m === "number")),
  };
}

export function salesStats(quotes: QuoteLogEntry[], bookings: Booking[]): SalesStats {
  const sorted = [...quotes].sort((a, b) => b.at.localeCompare(a.at));
  const dests = [...new Set([...sorted.map((q) => destKey(q.destination)), ...bookings.map((b) => destKey(b.destination))])];
  const byDestination = dests
    .map((d) =>
      row(
        d,
        sorted.filter((q) => destKey(q.destination) === d),
        bookings.filter((b) => destKey(b.destination) === d),
        sorted,
      ),
    )
    .sort((a, b) => b.won - a.won || b.quotes - a.quotes);
  const krw = bookings.filter((b) => b.currency === "KRW" && b.travelers > 0);
  const byPriceBand = BANDS.map((band, i) => {
    const min = i === 0 ? 0 : BANDS[i - 1].max;
    const inBand = krw.filter((b) => perPerson(b) >= min && perPerson(b) < band.max);
    const q = sorted.filter((x) => x.currency === "KRW" && x.pricePerPerson >= min && x.pricePerPerson < band.max);
    return row(band.label, q, inBand, sorted);
  }).filter((r) => r.quotes > 0 || r.decided > 0);
  const all = row("전체", sorted, bookings, sorted);
  return {
    totalQuotes: sorted.length,
    totalDecided: all.decided,
    totalWon: all.won,
    winRate: all.winRate,
    avgQuoteMargin: avg(sorted.map((q) => q.marginRate)),
    byDestination,
    byPriceBand,
  };
}

/** 저장한 일정 이름별 성약 수 (예약의 '연결한 일정 이름'과 같은 것) */
export function wonByPlanName(bookings: Booking[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of bookings) if (WON.has(b.status) && b.planName.trim()) out.set(b.planName.trim(), (out.get(b.planName.trim()) ?? 0) + 1);
  return out;
}
