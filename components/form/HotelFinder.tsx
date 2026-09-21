"use client";

import { AlertTriangle, Loader2, Search, X } from "lucide-react";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { Skeleton } from "@/components/ui/Skeleton";
import { useHotelSearch } from "@/hooks/useHotelSearch";
import { HOTEL_GRADES, HOTEL_PREFERENCES } from "@/lib/itemTypes";
import { midpoint } from "@/lib/travelEstimate";
import type { HotelCandidate, HotelPreference } from "@/types";
import { HotelCard } from "./HotelCard";
import type { SectionProps } from "./types";

/** 후보 카드에서 견적에 필요한 정보만 골라 선택한 숙소로 저장한다 */
function toSelected(hotel: HotelCandidate) {
  const { name, grade, area, nearestStation, walkMinutes, nightlyLow, nightlyHigh, priceBasis, mapUrl } = hotel;
  return { name, grade, area, nearestStation, walkMinutes, nightlyLow, nightlyHigh, priceBasis, mapUrl };
}

export function HotelFinder({ input, onChange }: SectionProps) {
  const { state, result, run } = useHotelSearch();
  const isBnb = input.lodgingType === "bnb";
  const canSearch = input.destination.trim() !== "";

  const togglePreference = (id: HotelPreference) =>
    onChange({
      hotelPreferences: input.hotelPreferences.includes(id)
        ? input.hotelPreferences.filter((p) => p !== id)
        : [...input.hotelPreferences, id],
    });

  const search = () =>
    run({
      destination: input.destination.trim(),
      grade: input.hotelGrade,
      lodgingType: input.lodgingType,
      preferences: input.hotelPreferences,
      currency: input.currency,
    });

  // 호텔을 고르면 1박 요금이 그 호텔의 검색 요금 중간값(추정)으로 채워진다
  const select = (hotel: HotelCandidate) =>
    onChange({
      selectedHotel: toSelected(hotel),
      lodgingRatePerNight: midpoint(hotel.nightlyLow, hotel.nightlyHigh),
      costStatus: { ...input.costStatus, lodging: "estimated" },
    });

  return (
    <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/30 p-3">
      <p className="text-xs font-semibold text-slate-800">{isBnb ? "숙소 찾기 (웹 검색)" : "호텔 찾기 (웹 검색)"}</p>

      {input.selectedHotel && (
        <div className="flex items-start justify-between gap-2 rounded-md bg-white p-2.5 ring-1 ring-indigo-200">
          <div className="min-w-0 text-[11px] leading-4 text-slate-600">
            <p className="text-xs font-semibold text-slate-900">
              선택한 숙소: {input.selectedHotel.name} <span className="font-normal text-slate-500">({input.selectedHotel.grade})</span>
            </p>
            <p>{input.selectedHotel.area}</p>
          </div>
          <button
            type="button"
            onClick={() => onChange({ selectedHotel: null })}
            aria-label="선택한 숙소 해제"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {!isBnb && (
        <div role="radiogroup" aria-label="호텔 등급" className="flex flex-wrap gap-1.5">
          {HOTEL_GRADES.map((g) => (
            <button
              key={g.id}
              type="button"
              role="radio"
              aria-checked={input.hotelGrade === g.id}
              onClick={() => onChange({ hotelGrade: g.id })}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                input.hotelGrade === g.id
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:border-indigo-300"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {HOTEL_PREFERENCES.map((p) => (
          <ChipToggle key={p.id} label={p.label} selected={input.hotelPreferences.includes(p.id)} onToggle={() => togglePreference(p.id)} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={search}
          disabled={!canSearch || state.status === "loading"}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {state.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
          {state.status === "loading" ? "웹에서 조사 중..." : isBnb ? "숙소 검색" : "호텔 검색"}
        </button>
        {!canSearch && <span className="text-[11px] text-slate-500">여행지를 먼저 입력하세요.</span>}
      </div>

      {state.status === "loading" && (
        <div className="space-y-2" aria-busy="true" aria-label="호텔 검색 중">
          <p className="text-[11px] text-slate-500">웹 검색으로 호텔과 요금, 후기를 확인하고 있습니다. 30~40초 정도 걸릴 수 있어요.</p>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {state.status === "error" && (
        <ErrorBanner title="호텔을 찾지 못했습니다" message={state.error ?? "잠시 후 다시 시도해 주세요."} onRetry={search} />
      )}

      {state.status === "success" && result && (
        <div className="space-y-2">
          {!result.searched && (
            <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              웹 검색 근거를 확보하지 못했습니다. AI 기억에 의존한 참고 정보라서 요금, 위치, 후기를 반드시 직접 확인하세요.
            </p>
          )}
          <ul className="space-y-2">
            {result.hotels.map((hotel) => (
              <HotelCard
                key={hotel.name}
                hotel={hotel}
                currency={input.currency}
                selected={input.selectedHotel?.name === hotel.name}
                onSelect={() => select(hotel)}
              />
            ))}
          </ul>
          {result.sources.length > 0 && (
            <details className="rounded-md bg-white p-2.5 ring-1 ring-slate-200">
              <summary className="cursor-pointer text-[11px] font-medium text-slate-600">참고한 출처 ({result.sources.length})</summary>
              <ul className="mt-1.5 space-y-0.5">
                {result.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-indigo-600 hover:underline">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="text-[10px] leading-4 text-slate-400">
            요금은 검색 시점의 참고 범위이며 날짜·시즌·환율에 따라 크게 달라집니다. 판매 전에 예약처나 도매 요금으로 확인하세요.
          </p>
        </div>
      )}
    </div>
  );
}
