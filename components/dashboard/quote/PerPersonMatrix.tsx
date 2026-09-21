import { formatMoney } from "@/lib/currency";
import type { CurrencyCode, QuoteData } from "@/types";

interface Props {
  quote: QuoteData;
  currency: CurrencyCode;
  targetMarginRate: number;
}

function minTravelersText(n: number | null) {
  return n === null ? "달성 불가" : `${n}명`;
}

export function PerPersonMatrix({ quote, currency, targetMarginRate }: Props) {
  const money = (v: number) => formatMoney(v, currency);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] text-xs">
          <caption className="sr-only">인원별 1인 견적</caption>
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] text-slate-500">
              <th className="py-2 pr-3 font-medium">인원</th>
              <th className="py-2 pr-3 text-right font-medium">1인 원가</th>
              <th className="py-2 pr-3 text-right font-medium">1인 권장가</th>
              <th className="py-2 pr-3 text-right font-medium">총 판매가</th>
              <th className="py-2 text-right font-medium">이익률</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quote.matrix.map((row) => {
              const isCurrent = row.travelers === quote.travelers;
              return (
                <tr key={row.travelers} className={isCurrent ? "bg-indigo-50 font-semibold text-indigo-900" : "text-slate-700"}>
                  <td className="py-2 pl-2 pr-3">
                    {row.travelers}명
                    {isCurrent && <span className="ml-1.5 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] text-white">현재</span>}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(row.costPerPerson)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(row.pricePerPerson)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(row.totalPrice)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{row.actualMarginRate.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <dl className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-[11px] text-slate-500">손익분기 최소 출발 인원</dt>
          <dd className="mt-0.5 font-semibold text-slate-900">{minTravelersText(quote.breakEvenTravelers)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-slate-500">목표 마진 {targetMarginRate}% 달성 최소 인원</dt>
          <dd className="mt-0.5 font-semibold text-slate-900">{minTravelersText(quote.targetMarginTravelers)}</dd>
        </div>
        <p className="text-[11px] leading-4 text-slate-500 sm:col-span-2">
          현재 인원({quote.travelers}명) 기준 권장가 {money(quote.scenario.pricePerPerson)}로 판매할 때 기준입니다. 이보다 적은 인원이
          출발하면 고정비 때문에 마진이 줄어듭니다.
        </p>
      </dl>
    </div>
  );
}
