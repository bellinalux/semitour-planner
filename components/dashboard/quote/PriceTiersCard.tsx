import { AlertTriangle } from "lucide-react";
import { formatMoney } from "@/lib/currency";
import type { PriceTiers } from "@/lib/pricing";
import type { CurrencyCode } from "@/types";

interface Props {
  tiers: PriceTiers;
  currency: CurrencyCode;
  targetMarginRate: number;
}

const TIER_STYLE = {
  floor: "bg-slate-50 ring-slate-200",
  recommended: "bg-indigo-50 ring-indigo-300",
  competitive: "bg-emerald-50 ring-emerald-200",
} as const;

/** 최저 · 권장 · 경쟁력 세 가격대와, 그 가격으로 팔 때 남는 마진 */
export function PriceTiersCard({ tiers, currency, targetMarginRate }: Props) {
  const money = (v: number) => formatMoney(v, currency);

  return (
    <div className="space-y-2.5">
      <div className="grid gap-3 sm:grid-cols-3">
        {tiers.tiers.map((tier) => {
          const belowTarget = tier.marginRate !== null && tier.marginRate < targetMarginRate - 0.05;
          const lossMaking = tier.marginRate !== null && tier.marginRate < 0;
          return (
            <div key={tier.key} className={`rounded-lg p-3 ring-1 ${TIER_STYLE[tier.key]}`}>
              <p className="text-[11px] font-medium text-slate-600">{tier.label} (1인)</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{tier.price === null ? "—" : money(tier.price)}</p>
              <p className={`mt-0.5 text-[11px] tabular-nums ${lossMaking ? "font-semibold text-red-600" : belowTarget ? "text-amber-700" : "text-slate-600"}`}>
                {tier.marginRate === null ? "계산 불가" : `이익률 ${tier.marginRate.toFixed(1)}%`}
              </p>
              <p className="mt-1 text-[10px] leading-4 text-slate-500">{tier.note}</p>
            </div>
          );
        })}
      </div>

      {tiers.position && <p className="text-[11px] leading-4 text-slate-600">{tiers.position}</p>}
      {tiers.competitiveBelowFloor && (
        <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          경쟁사 하위 가격이 우리 최저 판매가보다 낮습니다. 그 가격에 맞추면 최소 마진을 지키지 못하니, 가격이 아니라 포함 항목·일정 품질로 차별화하세요.
        </p>
      )}
      <p className="text-[10px] leading-4 text-slate-400">
        계산 기준: {tiers.basisName}. 경쟁사 가격은 우리가 포함한 항목(항공·숙박·현지 지불 경비) 범위로 환산한 값이며, 판매 전에 경쟁사 가격이 최신인지 확인하세요.
      </p>
    </div>
  );
}
