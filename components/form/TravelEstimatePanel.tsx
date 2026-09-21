"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { useTravelEstimate } from "@/hooks/useTravelEstimate";
import { formatMoney } from "@/lib/currency";
import { estimateToPatch } from "@/lib/travelEstimate";
import type { CurrencyCode } from "@/types";
import type { SectionProps } from "./types";

function range(low: number, high: number, currency: CurrencyCode): string {
  return low === high ? formatMoney(low, currency) : `${formatMoney(low, currency)} ~ ${formatMoney(high, currency)}`;
}

/** AI로 항공/숙박 시세를 추정해 비어 있거나 확정되지 않은 입력칸에 채워 준다. */
export function TravelEstimatePanel({ input, onChange }: SectionProps) {
  const { state, estimate, run } = useTravelEstimate();
  const [applied, setApplied] = useState<string[]>([]);
  const canRun = input.destination.trim() !== "" && (input.packageType !== "full" || input.originCity.trim() !== "");
  const currency = input.currency;

  const handleClick = async () => {
    const result = await run({
      origin: input.originCity.trim() || "인천",
      destination: input.destination.trim(),
      currency,
      nights: input.nights,
      hotelGrade: input.hotelGrade,
    });
    if (!result) return;
    const { patch, applied: names } = estimateToPatch(input, result);
    onChange(patch);
    setApplied(names);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleClick}
          disabled={!canRun || state.status === "loading"}
          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
          {state.status === "loading" ? "시세 추정 중..." : "AI로 항공·숙박 시세 추정"}
        </button>
        {!canRun && <span className="text-[11px] text-slate-500">여행지{input.packageType === "full" ? "와 출발지" : ""}를 먼저 입력하세요.</span>}
      </div>

      {state.status === "error" && (
        <ErrorBanner title="시세를 추정하지 못했습니다" message={state.error ?? "잠시 후 다시 시도해 주세요."} onRetry={handleClick} />
      )}

      {state.status === "success" && estimate && (
        <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-[11px] leading-4 text-slate-700">
          <p className="font-semibold text-amber-800">
            AI 추정 (실시간 요금이 아님){applied.length > 0 ? ` · 반영: ${applied.join(", ")}` : " · 이미 확정한 값은 덮어쓰지 않았습니다"}
          </p>
          {input.packageType === "full" && (
            <p>
              ✈ 왕복 {range(estimate.flight.roundTripLow, estimate.flight.roundTripHigh, currency)} · 편도 약 {estimate.flight.outboundHours}시간
              ({estimate.flight.direct ? "직항 추정" : "경유 추정"}) · 시차 {estimate.timeDifferenceHours > 0 ? "+" : ""}
              {estimate.timeDifferenceHours}시간
              {estimate.flight.note ? ` · ${estimate.flight.note}` : ""}
            </p>
          )}
          <p>
            🏨 호텔(2인실) {range(estimate.lodging.hotelLow, estimate.lodging.hotelHigh, currency)} / 박 · BnB(4인 유닛){" "}
            {range(estimate.lodging.bnbLow, estimate.lodging.bnbHigh, currency)} / 박
            {estimate.lodging.cityTaxPerPersonPerNight > 0 ? ` · 숙박세 ${formatMoney(estimate.lodging.cityTaxPerPersonPerNight, currency)}/인·박` : ""}
            {estimate.lodging.note ? ` · ${estimate.lodging.note}` : ""}
          </p>
          {estimate.seasonNote && <p>📅 {estimate.seasonNote}</p>}
          <p className="text-slate-500">노선·직항 여부와 요금은 AI 추정이라 틀릴 수 있습니다. 판매 전에 항공 검색과 숙소 견적으로 확인하세요.</p>
        </div>
      )}
    </div>
  );
}
