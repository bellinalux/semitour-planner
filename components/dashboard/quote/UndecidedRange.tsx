import { Scale } from "lucide-react";
import { formatMoney } from "@/lib/currency";
import type { CurrencyCode, QuoteScenario } from "@/types";

interface Props {
  labels: string[];
  base: QuoteScenario;
  withUndecided: QuoteScenario;
  currency: CurrencyCode;
}

/** 미정 항목이 있을 때 "제외 시 ~ 포함 시" 가격 범위를 보여준다 */
export function UndecidedRange({ labels, base, withUndecided, currency }: Props) {
  const money = (v: number) => formatMoney(v, currency);

  return (
    <div className="rounded-lg border border-slate-300 bg-slate-50 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
        <Scale className="h-3.5 w-3.5" aria-hidden />
        가격 범위 — 미정 항목({labels.join(", ")}) 확정 전
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="rounded-md bg-white p-2.5 ring-1 ring-slate-200">
          <p className="text-[11px] text-slate-500">미정 항목 제외 (지금 기본 가격)</p>
          <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">1인 {money(base.pricePerPerson)}</p>
          <p className="text-[11px] tabular-nums text-slate-500">이익률 {base.actualMarginRate.toFixed(1)}%</p>
        </div>
        <div className="rounded-md bg-white p-2.5 ring-1 ring-slate-200">
          <p className="text-[11px] text-slate-500">미정 항목 포함 (입력해 둔 참고 금액 기준)</p>
          <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">1인 {money(withUndecided.pricePerPerson)}</p>
          <p className="text-[11px] tabular-nums text-slate-500">이익률 {withUndecided.actualMarginRate.toFixed(1)}%</p>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-slate-500">
        미정 항목의 금액이 확정되면 해당 항목의 확정도를 &quot;확정&quot;으로 바꾸세요. 그러면 기본 가격에 반영됩니다.
      </p>
    </div>
  );
}
