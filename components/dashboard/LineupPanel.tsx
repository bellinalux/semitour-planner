"use client";

import { Layers } from "lucide-react";
import { useEffect, useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import { formatMoney } from "@/lib/currency";
import type { PmChoice } from "@/lib/itinerary";
import { citiesOf } from "@/lib/knowledge";
import { lineup } from "@/lib/lineup";
import type { CityRates } from "@/lib/rateBook";
import type { DayPlan, TripInput } from "@/types";

interface Props {
  input: TripInput;
  days: DayPlan[];
  pmChoice: PmChoice;
  onApply: (input: Partial<TripInput>, days: DayPlan[]) => void;
}

/** 상품 등급 라인업 — 실속·스탠다드(지금)·프리미엄의 호텔·식사·선택관광 포함과 1인 판매가 */
export function LineupPanel({ input, days, pmChoice, onApply }: Props) {
  const [book, setBook] = useState<CityRates | null>(null);
  const city = citiesOf(input.destination)[0] ?? "";
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!city) return;
    let alive = true;
    fetch(`/api/rates?city=${encodeURIComponent(city)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ doc: CityRates }>) : null))
      .then((j) => alive && setBook(j?.doc ?? null))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [city]);
  const tiers = lineup(input, days, pmChoice, book);
  const money = (v: number) => formatMoney(Math.round(v), input.currency);
  if (tiers.every((t) => t.salePrice === null)) return null;
  return (
    <SectionCard title="상품 등급 라인업" description="같은 코스로 실속·스탠다드·프리미엄 — 호텔·식사·선택관광 포함과 판매가" icon={Layers} collapsible defaultOpen={false} summary={tiers.map((t) => `${t.label} ${t.salePrice !== null ? money(t.salePrice) : "—"}`).join(" · ")} anchorId="lineup">
      <div className="space-y-2 text-xs">
        <div className="overflow-x-auto">
          <table aria-label="등급 라인업" className="w-full min-w-[560px]">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-1 pr-2 font-medium">등급</th>
                <th className="py-1 pr-2 font-medium">호텔</th>
                <th className="py-1 pr-2 font-medium">식사</th>
                <th className="py-1 pr-2 font-medium">포함 선택관광</th>
                <th className="py-1 pr-2 text-right font-medium">1인 판매가</th>
                <th className="py-1 font-medium">
                  <span className="sr-only">적용</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top tabular-nums">
              {tiers.map((t) => (
                <tr key={t.key} className={t.key === "standard" ? "bg-indigo-50/50" : ""}>
                  <td className="py-1.5 pr-2 font-semibold text-slate-800">
                    {t.label}
                    {t.key === "standard" && <span className="ml-1 rounded bg-indigo-600 px-1 text-[10px] text-white">지금</span>}
                  </td>
                  <td className="py-1.5 pr-2">
                    {t.gradeLabel || "—"}
                    {t.gradeLabel && <span className="block text-[10.5px] text-slate-400">1박 {money(t.ratePerNight)} · {t.rateBasis}</span>}
                    {t.hotels.length > 0 && <span className="block text-[10.5px] text-indigo-700">예: {t.hotels.join(", ")}</span>}
                  </td>
                  <td className="py-1.5 pr-2">{t.mealNote}</td>
                  <td className="py-1.5 pr-2">{t.included.join(", ") || "—"}</td>
                  <td className="py-1.5 pr-2 text-right">
                    <b>{t.salePrice !== null ? money(t.salePrice) : "—"}</b>
                    {t.diff !== null && t.diff !== 0 && <span className={`block text-[10.5px] ${t.diff > 0 ? "text-rose-600" : "text-emerald-700"}`}>{`${t.diff > 0 ? "+" : "−"}${money(Math.abs(t.diff))}`}</span>}
                  </td>
                  <td className="py-1.5">
                    {t.key !== "standard" && (
                      <button
                        type="button"
                        onClick={() => {
                          const { hotelGrade, lodgingRatePerNight, lodgingCityRates, supplierPricePerPerson, otherFixedCost, options } = t.input;
                          onApply({ hotelGrade, lodgingRatePerNight, lodgingCityRates, supplierPricePerPerson, otherFixedCost, options }, t.days);
                          setMessage(`${t.label} 등급으로 바꿨습니다. 되돌리기는 화면 위 [되돌리기] (일정) · 입력은 다시 바꿔 주세요.`);
                        }}
                        className="rounded-md border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-50"
                      >
                        이 등급으로
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {message && (
          <p role="status" className="text-emerald-700">
            {message}
          </p>
        )}
        <p className="text-[10.5px] text-slate-400">실속은 호텔 한 단계 아래·식대 80%, 프리미엄은 한 단계 위·특식(식대 140%)·가장 비싼 선택관광 포함. 호텔 요금은 회사 요금표에 그 등급이 있으면 그 평균을 씁니다. 숙소 등급만 비교하는 고객용 문서는 [비교 견적서]입니다.</p>
      </div>
    </SectionCard>
  );
}
