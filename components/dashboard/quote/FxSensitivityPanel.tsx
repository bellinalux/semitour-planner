import { formatMoney } from "@/lib/currency";
import { fxSensitivity } from "@/lib/pricing";
import type { QuoteData, TripInput } from "@/types";

interface Props {
  quote: QuoteData;
  input: TripInput;
}

/**
 * 원화 판매가를 고정해 두고 현지 통화 원가의 환율이 오르내릴 때 이익이 어떻게 변하는지 보여준다.
 * 견적 통화가 원화이거나 환율이 없으면 표시하지 않는다.
 */
export function FxSensitivityPanel({ quote, input }: Props) {
  const fx = fxSensitivity(quote, input);
  if (!fx) return null;
  const krw = (v: number) => formatMoney(v, "KRW");

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] text-xs">
          <caption className="sr-only">환율 변동에 따른 이익</caption>
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] text-slate-500">
              <th className="py-2 pr-3 font-medium">환율 변동</th>
              <th className="py-2 pr-3 text-right font-medium">환율</th>
              <th className="py-2 pr-3 text-right font-medium">원가 (원화)</th>
              <th className="py-2 pr-3 text-right font-medium">이익 (원화)</th>
              <th className="py-2 text-right font-medium">이익률</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {fx.rows.map((row) => {
              const current = row.shift === 0;
              const loss = row.profitKrw < 0;
              return (
                <tr key={row.shift} className={current ? "bg-indigo-50 font-semibold text-indigo-900" : "text-slate-700"}>
                  <td className="py-2 pl-2 pr-3">
                    {row.shift > 0 ? `+${row.shift}%` : `${row.shift}%`}
                    {current && <span className="ml-1.5 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] text-white">현재</span>}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{row.rate.toFixed(2)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{krw(row.costKrw)}</td>
                  <td className={`py-2 pr-3 text-right tabular-nums ${loss ? "font-semibold text-red-600" : ""}`}>{krw(row.profitKrw)}</td>
                  <td className={`py-2 pr-2 text-right tabular-nums ${loss ? "font-semibold text-red-600" : ""}`}>{row.marginRate.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] leading-4 text-slate-600">
        환율이 <span className="font-semibold">{fx.breakEvenShift.toFixed(1)}%</span> 오르면 이익이 0이 되고,{" "}
        <span className="font-semibold">{fx.targetShift.toFixed(1)}%</span>
        {fx.targetShift <= 0 ? " 이미 목표 마진을 못 냅니다" : " 오르면 목표 마진 " + input.targetMarginRate + "% 밑으로 내려갑니다"}.
        {input.fxBufferRate > 0 ? ` (원가에 환율 버퍼 ${input.fxBufferRate}%가 이미 들어 있습니다.)` : " 변동이 걱정되면 왼쪽 \"환율 변동 버퍼\"로 원가에 미리 반영하세요."}
      </p>
      <p className="text-[10px] leading-4 text-slate-400">
        원화 판매가 {krw(fx.priceKrw)}(총액)를 고정하고, 현지 통화 원가만 환율에 따라 변한다고 가정한 값입니다. 환전·선지급 시점에 따라 실제 영향은 다를 수 있습니다.
      </p>
    </div>
  );
}
