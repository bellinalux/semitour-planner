"use client";

import { useMemo } from "react";
import { CopyButton } from "@/components/dashboard/CopyButton";
import { formatMoney } from "@/lib/currency";
import { priceGrid, priceGridTsv, pricePlans } from "@/lib/customerPrices";
import type { PmChoice } from "@/lib/itinerary";
import type { CourseMeta, DayPlan, QuoteData, TripInput } from "@/types";

interface Props {
  input: TripInput;
  days: DayPlan[];
  pmChoice: PmChoice;
  quote: QuoteData;
  meta: CourseMeta | null;
}

/**
 * 고객 제시용 가격 — A/B/C안(숙소 등급만 다른 세 안)과 인원별 요금표(인원 × 출발 요일 또는 안).
 * 상담할 때 인원·등급마다 견적을 다시 내지 않도록 한 번에 보여 주고, 엑셀로 복사하거나 '비교 견적서'로 인쇄한다.
 */
export function CustomerPricePanel({ input, days, pmChoice, quote, meta }: Props) {
  const plans = useMemo(() => pricePlans(input, days, pmChoice, quote, meta), [input, days, pmChoice, quote, meta]);
  const grid = useMemo(() => priceGrid(input, days, pmChoice, quote, meta), [input, days, pmChoice, quote, meta]);
  const money = (v: number) => formatMoney(Math.round(v), input.currency);
  const vehicleRows = grid.rows.filter((r) => r.vehicleChange);

  return (
    <div className="space-y-3 text-xs">
      {plans.length >= 2 ? (
        <div role="group" aria-label="A/B/C안" className="grid gap-2 sm:grid-cols-3">
          {plans.map((p) => (
            <div key={p.key} className={`rounded-lg p-3 ring-1 ${p.isCurrent ? "bg-indigo-50 ring-indigo-300" : "bg-white ring-slate-200"}`}>
              <p className="flex items-center gap-1.5 font-semibold text-slate-800">
                {p.key}안 · {p.label}
                {p.isCurrent && <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] text-white">추천</span>}
              </p>
              <p className="mt-1 text-base font-bold tabular-nums text-slate-900">1인 {money(p.salePrice)}</p>
              <p className="tabular-nums text-slate-500">
                {input.travelers}명 총 {money(p.totalPrice)}
                {p.diff !== 0 && <span className={p.diff > 0 ? "text-rose-600" : "text-emerald-700"}> ({p.diff > 0 ? "+" : "−"}{money(Math.abs(p.diff))})</span>}
              </p>
              {p.marginRate !== null && <p className="mt-1 text-[10px] text-slate-400">수익률 {p.marginRate.toFixed(1)}% (내부용 — 문서에는 안 나감)</p>}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-pretty text-slate-500">숙소가 들어간 호텔 견적에서 숙박 요금과 등급(3~5성)을 정하면 A/B/C안을 함께 만듭니다.</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px]">
          <caption className="sr-only">인원별 1인 요금</caption>
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] text-slate-500">
              <th className="py-1.5 pr-2 font-medium">인원</th>
              {grid.columns.map((c) => (
                <th key={c} className="py-1.5 pr-2 text-right font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {grid.rows.map((r) => (
              <tr key={r.travelers} className={r.isCurrent ? "bg-indigo-50/70 font-semibold" : r.belowMin ? "text-slate-400" : "text-slate-700"}>
                <td className="py-1.5 pr-2">
                  {r.travelers}명
                  {r.isCurrent && <span className="ml-1 rounded bg-indigo-600 px-1 text-[10px] text-white">지금</span>}
                  {r.belowMin && <span className="ml-1 text-[10px]">최소 인원 미만</span>}
                  {r.vehicleChange && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">차종 바뀜</span>}
                </td>
                {r.prices.map((p, i) => (
                  <td key={i} className="py-1.5 pr-2 text-right">
                    {p === null ? "—" : money(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-pretty text-[11px] text-slate-500">
        1인 요금은 2인 1실 기준이며 {grid.kind === "weekday" ? "업체 요일별 공급가로" : grid.kind === "plan" ? "안마다 숙박 요금을 바꿔" : "지금 견적으로"} 인원마다 다시 계산했습니다.
        {grid.minTravelers > 0 && ` 최소 출발 ${grid.minTravelers}명.`}
        {vehicleRows.length > 0 && ` "차종 바뀜" 인원은 지금 차량비(${input.vehicleCostPerDay.toLocaleString()}/일)를 그대로 썼으니 그 차종 요금으로 확인하세요.`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton label="표 복사 (엑셀)" variant="secondary" disabled={false} getText={() => priceGridTsv(grid)} />
        <span className="text-[11px] text-slate-500">고객용 문서는 아래 문서 인쇄의 &quot;비교 견적서 (A/B/C안·인원별)&quot;로 뽑습니다.</span>
      </div>
    </div>
  );
}
