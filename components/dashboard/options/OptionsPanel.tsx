"use client";

import { AlertTriangle, ListChecks, Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/ui/SectionCard";
import { formatMoney } from "@/lib/currency";
import { newManualOption, simulateOptions } from "@/lib/options";
import type { CourseMeta, DayPlan, TourOption, TripInput } from "@/types";
import { OptionRow } from "./OptionRow";

interface Props {
  input: TripInput;
  days: DayPlan[];
  meta: CourseMeta | null;
  /** 기본 상품의 예상 이익 (견적이 준비되지 않았으면 null) */
  baseProfit: number | null;
  onChange: (options: TourOption[]) => void;
}

const SENSITIVITY_RATES = [20, 40, 60, 80, 100];

export function OptionsPanel({ input, days, meta, baseProfit, onChange }: Props) {
  const { options, currency } = input;
  const money = (v: number) => formatMoney(v, currency);
  const travelers = Math.max(1, Math.round(input.travelers));
  const sim = simulateOptions(options, travelers, input.cardFeeRate);

  const patch = (id: string, change: Partial<TourOption>) =>
    onChange(options.map((o) => (o.id === id ? { ...o, ...change } : o)));

  return (
    <SectionCard
      title="선택 옵션"
      description="기본 요금과 별도로 고객이 고르는 투어입니다. 옵션 매출을 시뮬레이션합니다"
      icon={ListChecks}
      action={
        <button
          type="button"
          onClick={() => onChange([...options, newManualOption()])}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          직접 추가
        </button>
      }
    >
      {options.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="등록된 선택 옵션이 없습니다"
          description="위 지역 투어 카탈로그에서 투어의 '선택 옵션으로 추가'를 누르거나, '직접 추가'로 바나나보트 같은 옵션을 넣으세요."
        />
      ) : (
        <div className="space-y-4">
          {meta?.noOption && (
            <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-800">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              붙여넣은 코스는 &quot;노옵션&quot;을 내세우는 상품입니다. 선택 옵션을 넣으면 고객용 안내와 세일즈 포인트에서 노옵션 표기를 뺍니다.
            </p>
          )}

          <ul className="space-y-2.5">
            {options.map((option, i) => (
              <OptionRow
                key={option.id}
                option={option}
                result={sim.rows[i]}
                days={days}
                currency={currency}
                pricing={input}
                onChange={(change) => patch(option.id, change)}
                onDelete={() => onChange(options.filter((o) => o.id !== option.id))}
              />
            ))}
          </ul>

          <section aria-label="옵션 매출 시뮬레이션" className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <h3 className="text-xs font-semibold text-slate-800">옵션 매출 시뮬레이션 ({travelers}명 기준)</h3>
            <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "옵션 매출", value: money(sim.revenue) },
                { label: "옵션 원가", value: money(sim.cost) },
                { label: "카드 수수료", value: money(sim.cardFee) },
                { label: "옵션 이익", value: `${money(sim.profit)} (${sim.marginRate.toFixed(1)}%)`, strong: true },
              ].map((item) => (
                <div key={item.label} className="rounded-md bg-white p-2 ring-1 ring-slate-200">
                  <dt className="text-[11px] text-slate-500">{item.label}</dt>
                  <dd className={`mt-0.5 text-xs tabular-nums ${item.strong ? "font-bold text-emerald-700" : "font-semibold text-slate-900"}`}>{item.value}</dd>
                </div>
              ))}
            </dl>

            {baseProfit !== null && (
              <p className="mt-2 rounded-md bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
                기본 상품 이익 <span className="font-semibold tabular-nums">{money(baseProfit)}</span> + 옵션 이익{" "}
                <span className="font-semibold tabular-nums">{money(sim.profit)}</span> ={" "}
                <span className="font-bold tabular-nums">{money(baseProfit + sim.profit)}</span>
              </p>
            )}
            {sim.notRunning > 0 && (
              <p className="mt-2 text-[11px] leading-4 text-amber-700">
                옵션 {sim.notRunning}개는 예상 신청 인원이 최소 인원에 못 미쳐 진행되지 않는 것으로 계산했습니다.
              </p>
            )}

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[360px] text-[11px]">
                <caption className="mb-1 text-left text-[11px] font-medium text-slate-600">참여율이 달라지면? (모든 옵션에 같은 참여율 적용)</caption>
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-1.5 pr-3 font-medium">참여율</th>
                    <th className="py-1.5 pr-3 text-right font-medium">옵션 매출</th>
                    <th className="py-1.5 text-right font-medium">옵션 이익</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {SENSITIVITY_RATES.map((rate) => {
                    const s = simulateOptions(options, travelers, input.cardFeeRate, rate);
                    return (
                      <tr key={rate} className="text-slate-700">
                        <td className="py-1.5 pr-3">{rate}%</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{money(s.revenue)}</td>
                        <td className="py-1.5 text-right font-medium tabular-nums">{money(s.profit)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <p className="text-[11px] leading-4 text-slate-400">
            옵션은 기본 판매가·견적에 들어가지 않습니다. 고객용 복사 텍스트에는 &quot;선택 옵션 안내&quot;가 별도 섹션으로 들어갑니다.
          </p>
        </div>
      )}
    </SectionCard>
  );
}
