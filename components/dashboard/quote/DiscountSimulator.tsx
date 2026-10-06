"use client";

import { Plus, Trash2 } from "lucide-react";
import { discountOutcome, maxDiscountRate } from "@/lib/channels";
import { formatMoney } from "@/lib/currency";
import { createDiscount, MAX_DISCOUNTS } from "@/lib/defaults";
import type { CurrencyCode, DiscountScenario, QuoteData, TripInput } from "@/types";

interface Props {
  quote: QuoteData;
  input: TripInput;
  currency: CurrencyCode;
  onInputChange: (patch: Partial<TripInput>) => void;
}

const PRESETS: { name: string; rate: number }[] = [
  { name: "플랫폼 쿠폰", rate: 5 },
  { name: "얼리버드", rate: 7 },
  { name: "단체 할인", rate: 10 },
];

const cellInput =
  "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30";

/**
 * 할인·쿠폰을 넣었을 때 채널별 이익이 어떻게 변하는지, 목표 마진을 지키면서 줄 수 있는 최대 할인폭은 얼마인지 보여준다.
 * 수수료는 할인 후 고객 결제액에 붙는다고 보고 계산한다(플랫폼 쿠폰처럼 플랫폼이 부담하는 할인은 0%로 두세요).
 */
export function DiscountSimulator({ quote, input, currency, onInputChange }: Props) {
  const money = (v: number) => formatMoney(v, currency);
  const { discounts } = input;
  const cost = quote.scenario.baseCost;
  const n = quote.travelers;
  const target = input.targetMarginRate / 100;

  const set = (list: DiscountScenario[]) => onInputChange({ discounts: list });
  const replace = (id: string, patch: Partial<DiscountScenario>) => set(discounts.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.filter((p) => !discounts.some((d) => d.name === p.name)).map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => set([...discounts, createDiscount(p.name, p.rate)])}
            disabled={discounts.length >= MAX_DISCOUNTS}
            className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50"
          >
            + {p.name} {p.rate}%
          </button>
        ))}
        <button
          type="button"
          onClick={() => set([...discounts, createDiscount("직접 입력", 0)])}
          disabled={discounts.length >= MAX_DISCOUNTS}
          className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50"
        >
          <Plus className="h-3 w-3" aria-hidden />
          할인 추가
        </button>
      </div>

      {discounts.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {discounts.map((d) => (
            <li key={d.id} className="flex items-center gap-2">
              <input
                aria-label="할인 이름"
                value={d.name}
                onChange={(e) => replace(d.id, { name: e.target.value })}
                className={cellInput}
              />
              <span className="relative w-24 shrink-0">
                <input
                  aria-label={`${d.name || "할인"} 할인율`}
                  type="number"
                  min={0}
                  max={100}
                  value={d.rate}
                  onChange={(e) => replace(d.id, { rate: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                  className={`${cellInput} pr-6 text-right tabular-nums`}
                />
                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[11px] text-slate-400">%</span>
              </span>
              <button
                type="button"
                onClick={() => set(discounts.filter((x) => x.id !== d.id))}
                aria-label={`${d.name || "할인"} 삭제`}
                className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-xs">
          <caption className="sr-only">할인 적용 시 채널별 이익</caption>
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] text-slate-500">
              <th className="py-2 pr-3 font-medium">채널</th>
              <th className="py-2 pr-3 text-right font-medium">마진 유지 최대 할인</th>
              <th className="py-2 pr-3 text-right font-medium">손익분기 최대 할인</th>
              {discounts.map((d) => (
                <th key={d.id} className="py-2 pr-3 text-right font-medium">
                  {d.name || "할인"} {d.rate}%
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quote.channels.map((row) => {
              const keep = maxDiscountRate(row, n, cost, target);
              const breakEven = maxDiscountRate(row, n, cost, 0);
              return (
                <tr key={row.id} className="text-slate-700">
                  <td className="py-2 pl-2 pr-3 font-medium">{row.name}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{keep === null ? "—" : keep <= 0 ? "여유 없음" : `${keep.toFixed(1)}%`}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{breakEven === null ? "—" : breakEven <= 0 ? "여유 없음" : `${breakEven.toFixed(1)}%`}</td>
                  {discounts.map((d) => {
                    const result = discountOutcome(row, n, cost, d.rate);
                    const loss = result.profit < 0;
                    return (
                      <td key={d.id} className={`py-2 pr-3 text-right tabular-nums ${loss ? "font-semibold text-red-600" : result.marginRate < input.targetMarginRate - 0.05 ? "text-amber-700" : ""}`}>
                        {result.marginRate.toFixed(1)}%
                        <span className="block text-[10px] text-slate-400">{money(result.profit)}</span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] leading-4 text-slate-500">
        &quot;마진 유지 최대 할인&quot;은 목표 마진 {input.targetMarginRate}%를 지키는 최대 할인율, &quot;손익분기 최대 할인&quot;은 이익이 0이 되는 할인율입니다.
        표의 이익률은 할인 후 고객 결제액 기준입니다.
      </p>
    </div>
  );
}
