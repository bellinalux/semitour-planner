"use client";

import { Save, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import { formatMoney } from "@/lib/currency";
import { MAX_PRICE_SCENARIOS } from "@/lib/defaults";
import { makeSnapshot, snapshotPatch } from "@/lib/priceScenarios";
import type { QuoteData, TripInput } from "@/types";

interface Props {
  quote: QuoteData;
  input: TripInput;
  onInputChange: (patch: Partial<TripInput>) => void;
}

/** 지금의 가격 설정을 이름을 붙여 저장해 두고, 저장한 가격안과 현재 결과를 나란히 비교한다 */
export function ScenarioCompare({ quote, input, onInputChange }: Props) {
  const [name, setName] = useState("");
  const scenarios = input.priceScenarios;
  const full = scenarios.length >= MAX_PRICE_SCENARIOS;
  const s = quote.scenario;

  const save = () => {
    onInputChange({ priceScenarios: [...scenarios, makeSnapshot(name || `가격안 ${scenarios.length + 1}`, input, quote)] });
    setName("");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="가격안 이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`가격안 ${scenarios.length + 1} (예: 마진 20% 안)`}
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
        />
        <button
          type="button"
          onClick={save}
          disabled={full}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-indigo-300 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" aria-hidden />
          지금 가격 저장
        </button>
      </div>
      {full && <p className="text-[11px] text-amber-700">가격안은 최대 {MAX_PRICE_SCENARIOS}개까지 저장할 수 있습니다. 쓰지 않는 안을 삭제하세요.</p>}

      {scenarios.length === 0 ? (
        <p className="text-[11px] text-slate-500">마진율·인원·채널·원가를 바꿔 가며 여러 안을 저장해 두고 비교할 수 있습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <caption className="sr-only">저장한 가격안 비교</caption>
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] text-slate-500">
                <th className="py-2 pr-3 font-medium">가격안</th>
                <th className="py-2 pr-3 text-right font-medium">인원</th>
                <th className="py-2 pr-3 text-right font-medium">1인 판매가</th>
                <th className="py-2 pr-3 text-right font-medium">총 이익</th>
                <th className="py-2 pr-3 text-right font-medium">이익률</th>
                <th className="py-2 pr-3 text-right font-medium">손익분기</th>
                <th className="py-2 text-right font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="bg-indigo-50 font-semibold text-indigo-900">
                <td className="py-2 pl-2 pr-3">
                  현재 입력 <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-normal text-white">지금</span>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{quote.travelers}명</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(s.pricePerPerson, input.currency)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(s.profit, input.currency)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{s.actualMarginRate.toFixed(1)}%</td>
                <td className="py-2 pr-3 text-right tabular-nums">{quote.breakEvenTravelers === null ? "불가" : `${quote.breakEvenTravelers}명`}</td>
                <td />
              </tr>
              {scenarios.map((sc) => {
                const sameCurrency = sc.summary.currency === input.currency;
                const priceDiff = sc.summary.pricePerPerson - s.pricePerPerson;
                return (
                  <tr key={sc.id} className="text-slate-700">
                    <td className="py-2 pl-2 pr-3">
                      <span className="font-medium">{sc.name}</span>
                      <span className="block text-[10px] text-slate-400">{sc.savedAt.slice(0, 10)} 저장</span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{sc.summary.travelers}명</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatMoney(sc.summary.pricePerPerson, sc.summary.currency)}
                      {sameCurrency && priceDiff !== 0 && (
                        <span className={`block text-[10px] ${priceDiff > 0 ? "text-red-500" : "text-emerald-600"}`}>
                          현재보다 {priceDiff > 0 ? "+" : "-"}
                          {formatMoney(Math.abs(priceDiff), sc.summary.currency)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(sc.summary.profit, sc.summary.currency)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{sc.summary.marginRate.toFixed(1)}%</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{sc.summary.breakEvenTravelers === null ? "불가" : `${sc.summary.breakEvenTravelers}명`}</td>
                    <td className="py-2 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() => onInputChange(snapshotPatch(sc))}
                          title="이 가격안의 입력값으로 되돌립니다"
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Undo2 className="h-3 w-3" aria-hidden />
                          복원
                        </button>
                        <button
                          type="button"
                          onClick={() => onInputChange({ priceScenarios: scenarios.filter((x) => x.id !== sc.id) })}
                          aria-label={`${sc.name} 삭제`}
                          className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] leading-4 text-slate-500">
        저장 값은 저장 시점의 결과 요약입니다. &quot;복원&quot;은 가격에 영향을 주는 입력(인원·마진·원가·채널·항공 등)만 되돌리고 일정은 바꾸지 않습니다.
      </p>
    </div>
  );
}
