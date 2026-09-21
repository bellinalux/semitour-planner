import { formatMoney } from "@/lib/currency";
import type { CurrencyCode, PricingMode, QuoteScenario } from "@/types";

interface Props {
  scenario: QuoteScenario;
  pricingMode: PricingMode;
  currency: CurrencyCode;
  /** 1 견적통화 = ? KRW. 0이거나 KRW면 환산 금액을 숨긴다 */
  exchangeRateToKrw: number;
}

function KrwHint({ amount, currency, rate }: { amount: number; currency: CurrencyCode; rate: number }) {
  if (currency === "KRW" || rate <= 0) return null;
  return <p className="mt-0.5 text-[11px] tabular-nums opacity-70">≈ {formatMoney(amount * rate, "KRW")}</p>;
}

export function QuoteKpis({ scenario, pricingMode, currency, exchangeRateToKrw }: Props) {
  const money = (v: number) => formatMoney(v, currency);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
        <p className="text-[11px] font-medium text-slate-500">총 원가 ({scenario.travelers}명)</p>
        <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{money(scenario.baseCost)}</p>
        <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">1인 {money(scenario.costPerPerson)}</p>
        <KrwHint amount={scenario.baseCost} currency={currency} rate={exchangeRateToKrw} />
      </div>

      <div className="rounded-lg bg-indigo-600 p-3 text-white shadow-sm">
        <p className="text-[11px] font-medium text-indigo-100">{pricingMode === "fixed_price" ? "판매가 · 입력값 (1인)" : "최종 권장 판매가 (1인)"}</p>
        <p className="mt-1 text-xl font-bold tabular-nums">{money(scenario.pricePerPerson)}</p>
        <p className="mt-0.5 text-[11px] tabular-nums text-indigo-100">총 {money(scenario.totalPrice)}</p>
        <KrwHint amount={scenario.pricePerPerson} currency={currency} rate={exchangeRateToKrw} />
      </div>

      <div className="rounded-lg bg-emerald-50 p-3 ring-1 ring-emerald-200">
        <p className={`text-[11px] font-medium ${scenario.profit >= 0 ? "text-emerald-700" : "text-red-600"}`}>예상 이익</p>
        <p className={`mt-1 text-lg font-bold tabular-nums ${scenario.profit >= 0 ? "text-emerald-800" : "text-red-700"}`}>{money(scenario.profit)}</p>
        <p className="mt-0.5 text-[11px] tabular-nums text-emerald-700">
          마진율 {scenario.actualMarginRate.toFixed(1)}% (카드 수수료 차감 후)
        </p>
        <div className="text-emerald-700">
          <KrwHint amount={scenario.profit} currency={currency} rate={exchangeRateToKrw} />
        </div>
      </div>
    </div>
  );
}
