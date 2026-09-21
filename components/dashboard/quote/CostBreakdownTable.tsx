import { formatMoney } from "@/lib/currency";
import type { CostLine, CurrencyCode, PricingMode, QuoteScenario } from "@/types";

interface Props {
  lines: CostLine[];
  scenario: QuoteScenario;
  currency: CurrencyCode;
  pricingMode: PricingMode;
  /** 미정 항목까지 포함했을 때의 시나리오 (미정 항목이 없으면 null) */
  withUndecided: QuoteScenario | null;
}

function StatusChip({ line }: { line: CostLine }) {
  if (line.excluded) {
    return <span className="ml-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">미정 · 제외</span>;
  }
  if (line.status === "estimated") {
    return <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">추정</span>;
  }
  return null;
}

export function CostBreakdownTable({ lines, scenario, currency, pricingMode, withUndecided }: Props) {
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
            <tr key={line.key} className={line.excluded || line.amount === 0 ? "text-slate-400" : "text-slate-700"}>
              <td className="py-2 pr-3 font-medium">
                {line.label}
                <StatusChip line={line} />
              </td>
              <td className="py-2 pr-3 text-slate-500">{line.note ?? ""}</td>
              <td className={`py-2 text-right tabular-nums ${line.excluded ? "line-through" : ""}`}>{money(line.amount)}</td>
            </tr>
          ))}
          <tr className="bg-slate-50 font-semibold text-slate-900">
            <td className="py-2 pl-2 pr-3" colSpan={2}>
              총 원가{withUndecided ? " (미정 항목 제외)" : ""}
            </td>
            <td className="py-2 pr-2 text-right tabular-nums">{money(scenario.baseCost)}</td>
          </tr>
          {withUndecided && (
            <tr className="text-slate-500">
              <td className="py-2 pl-2 pr-3" colSpan={2}>
                미정 항목 포함 시 총 원가
              </td>
              <td className="py-2 pr-2 text-right tabular-nums">{money(withUndecided.baseCost)}</td>
            </tr>
          )}
          <tr className="text-slate-700">
            <td className="py-2 pr-3 font-medium">카드 수수료</td>
            <td className="py-2 pr-3 text-slate-500">판매가 대비</td>
            <td className="py-2 text-right tabular-nums">{money(scenario.cardFee)}</td>
          </tr>
          <tr className={scenario.profit >= 0 ? "text-emerald-700" : "text-red-600"}>
            <td className="py-2 pr-3 font-medium">이익</td>
            <td className="py-2 pr-3">판매가의 {scenario.actualMarginRate.toFixed(1)}%</td>
            <td className="py-2 text-right tabular-nums">{money(scenario.profit)}</td>
          </tr>
          <tr className="bg-indigo-50 font-bold text-indigo-900">
            <td className="py-2.5 pl-2 pr-3" colSpan={2}>
              {pricingMode === "fixed_price" ? "판매가 (입력값, 총액)" : "최종 판매가 (총액)"}
            </td>
            <td className="py-2.5 pr-2 text-right tabular-nums">{money(scenario.totalPrice)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
