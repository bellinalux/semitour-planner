"use client";

import { AlertTriangle, Check, ExternalLink, Loader2, Search } from "lucide-react";
import { useState } from "react";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { useRequest } from "@/hooks/useRequest";
import { formatMoney } from "@/lib/currency";
import type { LodgingWebEstimate, SearchSource } from "@/types";
import type { SectionProps } from "./types";

interface Result {
  estimate: LodgingWebEstimate;
  sources: SearchSource[];
  searched: boolean;
}

/**
 * API가 아니라 AI 웹 검색(Booking.com, Agoda, 네이버 호텔 등)으로 숙박 요금을 확인한다.
 * 가입·키가 필요 없다. 항공 요금 확인과는 별도로 숙박만 따로 조회한다.
 */
export function HotelWebSearchPanel({ input, onChange }: SectionProps) {
  const { state, data, run } = useRequest<
    { destination: string; lodgingType: string; hotelGrade: string; currency: string },
    Result
  >("/api/search-lodging-price");
  const [applied, setApplied] = useState(false);
  const canRun = input.destination.trim() !== "";
  const isBnb = input.lodgingType === "bnb";
  const unitLabel = isBnb ? "유닛" : "실";

  const search = () => {
    setApplied(false);
    return run({ destination: input.destination.trim(), lodgingType: input.lodgingType, hotelGrade: input.hotelGrade, currency: input.currency });
  };

  const apply = () => {
    if (!data) return;
    const patch: Partial<typeof input> = { lodgingRatePerNight: data.estimate.rateLow, costStatus: { ...input.costStatus, lodging: "estimated" } };
    if (data.estimate.cityTaxPerPersonPerNight > 0 && input.cityTaxPerPersonPerNight === 0) {
      patch.cityTaxPerPersonPerNight = data.estimate.cityTaxPerPersonPerNight;
    }
    onChange(patch);
    setApplied(true);
  };

  const e = data?.estimate;
  const money = (v: number) => formatMoney(v, input.currency);

  return (
    <div className="space-y-2 border-t border-slate-200 pt-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={search}
          disabled={!canRun || state.status === "loading"}
          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
          {state.status === "loading" ? "웹에서 숙박 요금 찾는 중..." : "AI 웹 검색으로 숙박 요금 확인"}
        </button>
        {!canRun && <span className="text-[11px] text-slate-500">여행지를 먼저 입력하세요.</span>}
      </div>

      {state.status === "error" && (
        <ErrorBanner title="숙박 요금을 찾지 못했습니다" message={state.error ?? "잠시 후 다시 시도해 주세요."} onRetry={search} />
      )}

      {state.status === "success" && e && (
        <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-3 text-[11px] leading-4 text-slate-700">
          {!data?.searched && (
            <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-2 text-amber-800">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              웹 검색 근거를 확보하지 못했습니다. AI 기억에 의존한 참고 정보라서 요금을 반드시 직접 확인하세요.
            </p>
          )}
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold tabular-nums text-slate-900">
              1{unitLabel} 1박 {e.rateLow === e.rateHigh ? money(e.rateLow) : `${money(e.rateLow)} ~ ${money(e.rateHigh)}`}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                e.basis === "searched" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
              }`}
              title={e.basis === "searched" ? "검색 결과 페이지에서 확인한 요금" : "AI 추정"}
            >
              {e.basis === "searched" ? "검색 확인" : "추정"}
            </span>
          </p>
          {e.areaNote && <p>추천 지역: {e.areaNote}</p>}
          {e.cityTaxPerPersonPerNight > 0 && <p>숙박세 1인 1박 {money(e.cityTaxPerPersonPerNight)}</p>}
          {e.priceNote && <p className="text-amber-700">{e.priceNote}</p>}
          {e.sourceName && <p className="text-slate-400">확인 출처: {e.sourceName}</p>}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {e.rateLow > 0 && (
              <button
                type="button"
                onClick={apply}
                className="inline-flex items-center gap-1 rounded-md border border-indigo-300 bg-indigo-50 px-2 py-1 font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                {applied ? <Check className="h-3 w-3" aria-hidden /> : null}
                {applied ? "적용됨" : "최저가로 적용"}
              </button>
            )}
            <a href={e.searchUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline">
              직접 검색해 보기
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </div>

          {data && data.sources.length > 0 && (
            <details>
              <summary className="cursor-pointer text-slate-500">참고한 출처 ({data.sources.length})</summary>
              <ul className="mt-1 space-y-0.5">
                {data.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="text-slate-400">웹 검색 시점의 참고 정보입니다. 실제 예약 전 예약처에서 날짜별 요금을 다시 확인하세요.</p>
        </div>
      )}
    </div>
  );
}
