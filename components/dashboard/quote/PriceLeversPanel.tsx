"use client";

import { TrendingDown, Undo2 } from "lucide-react";
import { useState } from "react";
import { formatMoney } from "@/lib/currency";
import type { PmChoice } from "@/lib/itinerary";
import { buildPriceLevers, combinedLevers, type PriceLever } from "@/lib/priceLevers";
import type { CourseMeta, DayPlan, QuoteData, TripInput } from "@/types";

interface Props {
  input: TripInput;
  days: DayPlan[];
  pmChoice: PmChoice;
  quote: QuoteData;
  meta: CourseMeta | null;
  onInputChange: (patch: Partial<TripInput>) => void;
  onReplaceDays?: (days: DayPlan[]) => void;
}

const MODE_LABEL: Record<PriceLever["mode"], { text: string; tone: string }> = {
  apply: { text: "바로 적용", tone: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  request: { text: "업체 요청", tone: "bg-indigo-50 text-indigo-800 ring-indigo-200" },
  info: { text: "고객 조건", tone: "bg-slate-100 text-slate-600 ring-slate-200" },
};

/**
 * 가격 낮추기 (경쟁 상품 기준) — 업계에서 쓰는 절감 방법을 지금 견적으로 계산해, 방법마다 1인 판매가·경쟁 순위 변화·잃는 것을 보여 준다.
 * 골라서 함께 보면 합친 판매가·순위를 미리 보고, 우리 원가 견적은 바로 적용(되돌리기), 업체 공급가 견적은 업체 요청서에 넣는다.
 */
export function PriceLeversPanel({ input, days, pmChoice, quote, meta, onInputChange, onReplaceDays }: Props) {
  const [picked, setPicked] = useState<string[]>([]);
  const [undo, setUndo] = useState<{ input: Partial<TripInput>; days: DayPlan[] } | null>(null);
  const r = buildPriceLevers(input, days, pmChoice, quote, meta);
  if (!r || r.levers.length === 0) return null;
  const money = (v: number) => formatMoney(Math.round(v), input.currency);
  const total = r.competitorPrices.length + 1;
  const rankText = (rank: number | null) => (rank === null ? "" : `${total}개 중 ${rank}위`);
  const chosen = r.levers.filter((l) => picked.includes(l.id) && l.mode !== "info");
  const combo = chosen.length > 0 ? combinedLevers(input, days, pmChoice, quote, meta, chosen.map((l) => l.id)) : null;
  const supplier = input.pricingMode === "supplier";
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const apply = () => {
    if (!combo) return;
    const requestIds = chosen.filter((l) => l.mode === "request" && l.cutId).map((l) => l.cutId!);
    const applyIds = chosen.filter((l) => l.mode === "apply").map((l) => l.id);
    // 업체 요청은 요청서의 일정 조정에 넣는다 (공급가는 업체가 답할 때까지 그대로)
    if (requestIds.length > 0) onInputChange({ supplierCutIds: [...new Set([...(input.supplierCutIds ?? []), ...requestIds])] });
    if (applyIds.length > 0) {
      const applied = combinedLevers(input, days, pmChoice, quote, meta, applyIds);
      const changed = (Object.keys(applied.input) as (keyof TripInput)[]).filter((k) => applied.input[k] !== input[k] && k !== "supplierPricePerPerson");
      setUndo({ input: Object.fromEntries(changed.map((k) => [k, input[k]])) as Partial<TripInput>, days });
      if (changed.length > 0) onInputChange(Object.fromEntries(changed.map((k) => [k, applied.input[k]])) as Partial<TripInput>);
      if (applied.days !== days) onReplaceDays?.(applied.days);
    }
    setPicked([]);
  };

  return (
    <section id="price-levers" aria-label="가격 낮추기" className="scroll-mt-4 space-y-2 rounded-lg border border-slate-200 p-3 text-[11px] leading-4">
      <div className="flex flex-wrap items-center gap-2">
        <TrendingDown className="size-4 text-emerald-600" aria-hidden />
        <b className="text-xs text-slate-900">가격 낮추기 (경쟁 상품 기준)</b>
        <span className="text-slate-500">
          지금 1인 {money(r.basePrice)}
          {r.rank !== null && ` · 같은 조건 ${rankText(r.rank)} (1위 = 가장 저렴)`}
        </span>
      </div>
      <p className="text-pretty text-slate-500">
        업계에서 쓰는 절감 방법을 지금 견적으로 계산했습니다. 쇼핑·선택관광을 늘려 메우는 방법은 강매·불만으로 이어져 넣지 않았습니다.
        {supplier && " 업체 공급가 견적이라 일정·호텔 조정은 업체에 요청할 것이고, 금액은 업체가 받아들였을 때의 예상입니다."}
      </p>
      <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
        {r.levers.map((l) => (
          <li key={l.id} className="flex gap-2 px-2.5 py-2">
            <input
              type="checkbox"
              aria-label={l.label}
              className="mt-0.5"
              disabled={l.mode === "info"}
              checked={picked.includes(l.id)}
              onChange={() => toggle(l.id)}
            />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5">
                <b className="text-slate-900">{l.label}</b>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${MODE_LABEL[l.mode].tone}`}>{MODE_LABEL[l.mode].text}</span>
              </p>
              <p className="text-pretty text-slate-500">{l.detail}</p>
              {l.lose.length > 0 && <p className="text-pretty text-amber-700">잃는 것: {l.lose.join(" · ")}</p>}
              <p className="text-pretty text-slate-400">업계 기준: {l.guide}</p>
            </div>
            <div className="shrink-0 text-right tabular-nums">
              {l.saving > 0 ? (
                <>
                  <b className="block text-emerald-700">−{money(l.saving)}</b>
                  <span className="block text-slate-500">→ {money(l.newPrice)}</span>
                  {l.rankAfter !== null && r.rank !== null && l.rankAfter !== r.rank && (
                    <span className="block font-semibold text-emerald-700">
                      {r.rank}위 → {l.rankAfter}위
                    </span>
                  )}
                </>
              ) : (
                <span className="text-slate-400">문의</span>
              )}
            </div>
          </li>
        ))}
      </ul>
      {combo && combo.price !== null && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-emerald-900 ring-1 ring-emerald-200">
          <span className="flex-1 text-pretty">
            고른 {chosen.length}개를 함께 하면 1인 <b>{money(combo.price)}</b> (−{money(r.basePrice - combo.price)})
            {combo.rank !== null && ` · 같은 조건 ${rankText(combo.rank)}`}
          </span>
          <button type="button" onClick={apply} className="rounded-md bg-emerald-600 px-2.5 py-1 font-semibold text-white hover:bg-emerald-700">
            {chosen.some((l) => l.mode === "request") ? (chosen.some((l) => l.mode === "apply") ? "적용·업체 요청서에 넣기" : "업체 요청서에 넣기") : "고른 것 적용"}
          </button>
        </div>
      )}
      {undo && (
        <p role="status" className="flex items-center gap-2 text-slate-600">
          <span className="flex-1">가격 낮추기를 적용했습니다.</span>
          <button
            type="button"
            onClick={() => {
              onInputChange(undo.input);
              onReplaceDays?.(undo.days);
              setUndo(null);
            }}
            className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
          >
            <Undo2 className="size-3" aria-hidden />
            되돌리기
          </button>
        </p>
      )}
    </section>
  );
}
