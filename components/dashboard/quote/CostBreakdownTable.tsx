import { formatMoney } from "@/lib/currency";
import type { CostLine, CurrencyCode, QuoteScenario } from "@/types";

interface Props {
  lines: CostLine[];
  scenario: QuoteScenario;
  currency: CurrencyCode;
}

export function CostBreakdownTable({ lines, scenario, currency }: Props) {
  const money = (v: number) => formatMoney(v, currency);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-xs">
        <caption className="sr-only">원가 내역</caption>
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] text-slate-500">
            <th className="py-2 pr-3 font-medium">항목</th>
            <th className="py-2 pr-3 font-medium">산정 근거</th>
            <th className="py-2 text-right font-medium">금액</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lines.map((line) => (
            <tr key={line.key} className={line.amount === 0 ? "text-slate-400" : "text-slate-700"}>
              <td className="py-2 pr-3 font-medium">{line.label}</td>
              <td className="py-2 pr-3 text-slate-500">{line.note ?? ""}</td>
              <td className="py-2 text-right tabular-nums">{money(line.amount)}</td>
            </tr>
          ))}
          <tr className="bg-slate-50 font-semibold text-slate-900">
            <td className="py-2 pl-2 pr-3" colSpan={2}>
              총 원가
            </td>
            <td className="py-2 pr-2 text-right tabular-nums">{money(scenario.baseCost)}</td>
          </tr>
          <tr className="text-slate-700">
            <td className="py-2 pr-3 font-medium">카드 수수료</td>
            <td className="py-2 pr-3 text-slate-500">판매가 대비</td>
            <td className="py-2 text-right tabular-nums">{money(scenario.cardFee)}</td>
          </tr>
          <tr className="text-emerald-700">
            <td className="py-2 pr-3 font-medium">이익</td>
            <td className="py-2 pr-3">판매가의 {scenario.actualMarginRate.toFixed(1)}%</td>
            <td className="py-2 text-right tabular-nums">{money(scenario.profit)}</td>
          </tr>
          <tr className="bg-indigo-50 font-bold text-indigo-900">
            <td className="py-2.5 pl-2 pr-3" colSpan={2}>
              최종 판매가 (총액)
            </td>
            <td className="py-2.5 pr-2 text-right tabular-nums">{money(scenario.totalPrice)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
