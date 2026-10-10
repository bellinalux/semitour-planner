"use client";

import type { MonthRow } from "@/lib/salesStats";

/**
 * 월별 실적 — 축이 다른 값은 차트를 나눈다 (건수 차트 / 금액 차트, 이중 축 없음).
 * 색: 견적 = 파랑(1번), 성약 = 주황(2번) — 범례 + 막대 위 값으로 색만으로 구분하지 않는다. 막대마다 마우스를 올리면 값이 보인다.
 */
const SERIES = { quotes: "#2a78d6", won: "#eb6834", revenue: "#2a78d6" } as const;
const W = 560;
const H = 150;
const PAD = { top: 16, right: 8, bottom: 22, left: 8 };

function label(month: string) {
  return `${Number(month.slice(5))}월`;
}

function CountChart({ rows }: { rows: MonthRow[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.quotes, r.won)));
  const band = (W - PAD.left - PAD.right) / rows.length;
  const bar = Math.max(3, Math.min(14, band / 3));
  const y = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - v / max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="월별 나간 견적과 성약 건수">
      <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="#d4d4d0" strokeWidth={1} />
      {rows.map((r, i) => {
        const cx = PAD.left + band * i + band / 2;
        return (
          <g key={r.month}>
            {(
              [
                ["quotes", r.quotes, cx - bar - 1],
                ["won", r.won, cx + 1],
              ] as const
            ).map(([k, v, x]) =>
              v > 0 ? (
                <g key={k}>
                  <rect x={x} y={y(v)} width={bar} height={H - PAD.bottom - y(v)} rx={2} fill={SERIES[k]}>
                    <title>{`${label(r.month)} ${k === "quotes" ? "나간 견적" : "성약"} ${v}건`}</title>
                  </rect>
                  {band >= 30 && (
                    <text x={x + bar / 2} y={y(v) - 3} textAnchor="middle" fontSize={9} fill="#52514e">
                      {v}
                    </text>
                  )}
                </g>
              ) : null,
            )}
            <text x={cx} y={H - 7} textAnchor="middle" fontSize={9} fill="#52514e">
              {label(r.month)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function RevenueChart({ rows }: { rows: MonthRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.revenue));
  const band = (W - PAD.left - PAD.right) / rows.length;
  const bar = Math.max(4, Math.min(22, band * 0.55));
  const y = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - v / max);
  const peak = rows.reduce((a, b) => (b.revenue > a.revenue ? b : a), rows[0]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="월별 성약 금액 (원화)">
      <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="#d4d4d0" strokeWidth={1} />
      {rows.map((r, i) => {
        const cx = PAD.left + band * i + band / 2;
        return (
          <g key={r.month}>
            {r.revenue > 0 && (
              <rect x={cx - bar / 2} y={y(r.revenue)} width={bar} height={H - PAD.bottom - y(r.revenue)} rx={2} fill={SERIES.revenue}>
                <title>{`${label(r.month)} 성약 ${r.revenue.toLocaleString("ko-KR")}원`}</title>
              </rect>
            )}
            {r === peak && r.revenue > 0 && (
              <text x={cx} y={y(r.revenue) - 3} textAnchor="middle" fontSize={9} fill="#52514e">
                {`${Math.round(r.revenue / 10000).toLocaleString("ko-KR")}만`}
              </text>
            )}
            <text x={cx} y={H - 7} textAnchor="middle" fontSize={9} fill="#52514e">
              {label(r.month)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function MonthlyChart({ rows }: { rows: MonthRow[] }) {
  if (rows.every((r) => r.quotes === 0 && r.won === 0)) return null;
  return (
    <div className="space-y-2" aria-label="월별 실적">
      <div>
        <p className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-600">
          월별 견적 · 성약 (건)
          <span className="inline-flex items-center gap-1 font-normal">
            <span className="size-2 rounded-sm" style={{ background: SERIES.quotes }} aria-hidden />
            나간 견적
          </span>
          <span className="inline-flex items-center gap-1 font-normal">
            <span className="size-2 rounded-sm" style={{ background: SERIES.won }} aria-hidden />
            성약
          </span>
        </p>
        <CountChart rows={rows} />
      </div>
      {rows.some((r) => r.revenue > 0) && (
        <div>
          <p className="text-[11px] font-semibold text-slate-600">월별 성약 금액 (원화 예약)</p>
          <RevenueChart rows={rows} />
        </div>
      )}
      <details className="text-[11px]">
        <summary className="cursor-pointer text-slate-500">표로 보기</summary>
        <table className="mt-1 w-full tabular-nums">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-0.5 pr-2 font-medium">월</th>
              <th className="py-0.5 pr-2 text-right font-medium">나간 견적</th>
              <th className="py-0.5 pr-2 text-right font-medium">성약</th>
              <th className="py-0.5 pr-2 text-right font-medium">성약 금액</th>
              <th className="py-0.5 text-right font-medium">견적 평균 마진</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month} className="border-b border-slate-100">
                <td className="py-0.5 pr-2">{r.month}</td>
                <td className="py-0.5 pr-2 text-right">{r.quotes}</td>
                <td className="py-0.5 pr-2 text-right">{r.won}</td>
                <td className="py-0.5 pr-2 text-right">{r.revenue.toLocaleString("ko-KR")}</td>
                <td className="py-0.5 text-right">{r.avgMargin === null ? "—" : `${r.avgMargin}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
