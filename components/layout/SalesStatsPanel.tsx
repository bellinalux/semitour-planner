"use client";

import { formatMoney } from "@/lib/currency";
import type { Booking } from "@/lib/bookings";
import type { QuoteLogEntry } from "@/lib/quoteLog";
import { salesStats, type StatRow } from "@/lib/salesStats";

function Table({ title, rows }: { title: string; rows: StatRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-[11px]">
        <caption className="mb-1 text-left text-[11px] font-semibold text-slate-600">{title}</caption>
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-1 pr-2 font-medium">구분</th>
            <th className="py-1 pr-2 text-right font-medium">나간 견적</th>
            <th className="py-1 pr-2 text-right font-medium">성약 / 결정</th>
            <th className="py-1 pr-2 text-right font-medium">성약률</th>
            <th className="py-1 pr-2 text-right font-medium">성약 1인가</th>
            <th className="py-1 text-right font-medium">성약 마진</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 tabular-nums text-slate-700">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="py-1 pr-2">{r.key}</td>
              <td className="py-1 pr-2 text-right">{r.quotes}</td>
              <td className="py-1 pr-2 text-right">
                {r.won} / {r.decided}
              </td>
              <td className={`py-1 pr-2 text-right font-semibold ${r.winRate !== null && r.winRate >= 50 ? "text-emerald-700" : ""}`}>{r.winRate === null ? "—" : `${r.winRate}%`}</td>
              <td className="py-1 pr-2 text-right">{r.avgWonPrice === null ? "—" : formatMoney(Math.round(r.avgWonPrice), "KRW")}</td>
              <td className="py-1 text-right">{r.avgWonMargin === null ? "—" : `${r.avgWonMargin}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 견적 성과 — 나간 견적과 예약 진행으로 여행지별·가격대별 성약률, 성약 건 가격·마진 */
export function SalesStatsPanel({ quotes, bookings }: { quotes: QuoteLogEntry[]; bookings: Booking[] | null }) {
  const s = salesStats(quotes, bookings ?? []);
  if (s.totalQuotes === 0 && s.totalDecided === 0) return null;
  return (
    <section aria-label="견적 성과" className="space-y-2">
      <h3 className="text-xs font-semibold text-slate-700">견적 성과</h3>
      <div className="grid gap-2 sm:grid-cols-4">
        {[
          { k: "나간 견적", v: `${s.totalQuotes}건` },
          { k: "성약 / 결정", v: `${s.totalWon} / ${s.totalDecided}` },
          { k: "성약률", v: s.winRate === null ? "—" : `${s.winRate}%` },
          { k: "견적 평균 마진", v: s.avgQuoteMargin === null ? "—" : `${s.avgQuoteMargin}%` },
        ].map((x) => (
          <div key={x.k} className="rounded-md bg-slate-50 px-2.5 py-2 ring-1 ring-slate-200">
            <p className="text-[10px] text-slate-500">{x.k}</p>
            <p className="text-sm font-semibold tabular-nums text-slate-900">{x.v}</p>
          </div>
        ))}
      </div>
      <Table title="여행지별" rows={s.byDestination} />
      <Table title="1인 가격대별 (원화)" rows={s.byPriceBand} />
      <p className="text-[10px] leading-4 text-slate-400">
        성약 = 예약 관리에서 계약·계약금·완납·출발 상태, 결정 = 견적 발송 이후 단계(취소 포함). 성약 마진은 같은 여행지·출발일·인원으로 나간 마지막 견적의 마진입니다.
        {bookings === null && " 예약 목록을 불러오는 중입니다."}
      </p>
    </section>
  );
}
