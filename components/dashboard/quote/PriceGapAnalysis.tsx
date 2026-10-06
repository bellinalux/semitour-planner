import { ArrowRight, Info, Minus, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { analyzeCompetitors, type OurPolicy } from "@/lib/competitorDiff";
import { formatMoney } from "@/lib/currency";
import type { Competitor, CurrencyCode, QuoteData, TripInput } from "@/types";

interface Props {
  competitors: Competitor[];
  quote: QuoteData;
  input: TripInput;
  ourPolicy: OurPolicy;
  currency: CurrencyCode;
}

const REASON_STYLE = {
  premium: { icon: TrendingUp, className: "text-emerald-700", label: "우리가 비싼 근거" },
  gap: { icon: TrendingDown, className: "text-red-600", label: "경쟁사가 앞서는 점" },
  info: { icon: Info, className: "text-slate-500", label: "참고" },
} as const;

/**
 * 경쟁사보다 비쌀 때 그 이유를 찾아 주는 표.
 * 경쟁사에만 들어 있는 항공·숙박은 우리 비용을 더해 같은 조건으로 맞춘 뒤 차이를 다시 계산한다.
 */
export function PriceGapAnalysis({ competitors, quote, input, ourPolicy, currency }: Props) {
  const priced = competitors.filter((c) => c.price > 0);
  if (priced.length === 0) return null;

  const diffs = analyzeCompetitors(priced, quote, input, ourPolicy);
  const money = (v: number) => formatMoney(v, currency);

  return (
    <div className="space-y-3">
      {diffs.map(({ competitor, rawDiff, adjustedOurPrice, adjustedCompetitorPrice, adjustments, adjustedDiff, reasons }) => {
        const weAreExpensive = adjustedDiff !== null && adjustedDiff < 0;
        const gap = adjustedDiff === null ? 0 : Math.abs(adjustedDiff);

        return (
          <div key={competitor.id} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-900">{competitor.name.trim() || "경쟁사"}</p>
              <p className={`text-xs font-bold tabular-nums ${weAreExpensive ? "text-red-600" : "text-emerald-700"}`}>
                {adjustedDiff === null ? "비교 불가" : weAreExpensive ? `우리가 ${money(gap)} 비쌈` : `우리가 ${money(gap)} 저렴`}
              </p>
            </div>

            {adjustments.length > 0 && (
              <div className="mt-2 space-y-1 rounded-md bg-slate-50 px-2.5 py-2 text-[11px] leading-4 text-slate-600">
                <p className="font-medium text-slate-700">같은 조건으로 맞춤 ({input.compareBasis === "land" ? "랜드(지상) 기준" : "총액 기준"})</p>
                {(["ours", "theirs"] as const).map((side) => {
                  const list = adjustments.filter((a) => a.side === side);
                  if (list.length === 0) return null;
                  const base = side === "ours" ? quote.scenario.pricePerPerson : competitor.price;
                  const after = side === "ours" ? adjustedOurPrice : adjustedCompetitorPrice;
                  return (
                    <p key={side} className="flex flex-wrap items-center gap-1">
                      <span className="w-12 text-slate-500">{side === "ours" ? "우리" : "경쟁사"}</span>
                      <span className="tabular-nums">{money(base)}</span>
                      {list.map((a) => (
                        <span key={a.label} className="inline-flex items-center gap-0.5 tabular-nums">
                          {a.amount >= 0 ? <Plus className="h-3 w-3" aria-hidden /> : <Minus className="h-3 w-3" aria-hidden />}
                          {a.label} {money(Math.abs(a.amount))}
                        </span>
                      ))}
                      <ArrowRight className="h-3 w-3" aria-hidden />
                      <span className="font-semibold tabular-nums text-slate-900">{money(after)}</span>
                    </p>
                  );
                })}
                {rawDiff !== null && (
                  <p className="text-slate-400">
                    표시 가격만 비교하면 {rawDiff > 0 ? "우리가" : "경쟁사가"} {money(Math.abs(rawDiff))} 저렴합니다.
                  </p>
                )}
              </div>
            )}

            <ul className="mt-2 space-y-1">
              {reasons.map((reason) => {
                const style = REASON_STYLE[reason.kind];
                const Icon = style.icon;
                return (
                  <li key={reason.text} className={`flex items-start gap-1.5 text-[11px] leading-4 ${style.className}`}>
                    <Icon className="mt-px h-3.5 w-3.5 shrink-0" aria-label={style.label} />
                    <span>{reason.text}</span>
                  </li>
                );
              })}
              {reasons.length === 0 && (
                <li className="flex items-start gap-1.5 text-[11px] text-slate-500">
                  <Minus className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>포함 항목과 정책이 같습니다. 가격 차이는 원가와 마진 구조의 차이입니다.</span>
                </li>
              )}
            </ul>
          </div>
        );
      })}

      <p className="text-[11px] leading-4 text-slate-400">
        항공·숙박은 우리 입력값(왕복 항공료, 1박 요금 원가)으로 더하거나 빼서 같은 범위로 맞춰 비교합니다. 그 값이 0이면 맞추지 못하고 참고로 표시합니다. 비교 기준은 왼쪽 &quot;경쟁사 정보&quot;에서 바꿀 수 있습니다.
      </p>
    </div>
  );
}
