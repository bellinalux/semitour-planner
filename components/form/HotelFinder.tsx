"use client";

import { AlertTriangle, ExternalLink, Loader2, Map, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { Skeleton } from "@/components/ui/Skeleton";
import { useHotelSearch } from "@/hooks/useHotelSearch";
import { HOTEL_GRADES, HOTEL_PREFERENCES } from "@/lib/itemTypes";
import { midpoint } from "@/lib/travelEstimate";
import type { HotelCandidate, HotelPreference, LodgingType } from "@/types";
import { HotelCard } from "./HotelCard";
import type { SectionProps } from "./types";

interface Props extends SectionProps {
  /** 일정에서 센 도시별 숙박 수. 2곳 이상이면 지역을 도시별로 고를 수 있다 */
  stays: { city: string; nights: number }[];
}

/** 후보 카드에서 견적에 필요한 정보만 골라 선택한 숙소로 저장한다 */
function toSelected(hotel: HotelCandidate) {
  const { name, grade, area, nearestStation, walkMinutes, nightlyLow, nightlyHigh, priceBasis, mapUrl } = hotel;
  return { name, grade, area, nearestStation, walkMinutes, nightlyLow, nightlyHigh, priceBasis, mapUrl };
}

function lodgingWord(lodgingType: LodgingType): string {
  return lodgingType === "bnb" ? "BnB 숙소" : lodgingType === "resort" ? "리조트" : "호텔";
}

/** 그 지역의 숙소들을 구글 지도 검색 결과로 한 번에 훑어볼 수 있는 링크 (핀이 여러 개 함께 표시된다) */
function regionMapUrl(region: string, lodgingType: LodgingType): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${region} ${lodgingWord(lodgingType)}`)}`;
}

export function HotelFinder({ input, onChange, stays }: Props) {
  const [region, setRegion] = useState("");
  const isBnb = input.lodgingType === "bnb";
  const word = lodgingWord(input.lodgingType);
  const { state, result, run } = useHotelSearch();

  // 코스에 잡힌 숙박 도시들. 2곳 이상이면 도시별로 검색 지역을 고를 수 있다
  const cities = useMemo(() => stays.map((s) => s.city).filter(Boolean), [stays]);
  const effectiveRegion = region.trim() || cities[0] || input.destination.trim();
  const canSearch = effectiveRegion !== "";
  const perCity = cities.length >= 2;

  const togglePreference = (id: HotelPreference) =>
    onChange({
      hotelPreferences: input.hotelPreferences.includes(id)
        ? input.hotelPreferences.filter((p) => p !== id)
        : [...input.hotelPreferences, id],
    });

  const search = () => {
    if (!canSearch) return;
    return run({
      destination: effectiveRegion,
      grade: input.hotelGrade,
      lodgingType: input.lodgingType,
      preferences: input.hotelPreferences,
      currency: input.currency,
    });
  };

  // 호텔을 고르면 검색한 지역을 키로 저장한다. 도시가 2곳 이상이면 그 도시의 1박 요금도 같이 채운다(도시별 요금).
  const select = (hotel: HotelCandidate) => {
    const key = effectiveRegion;
    const rate = midpoint(hotel.nightlyLow, hotel.nightlyHigh);
    onChange({
      selectedHotels: { ...input.selectedHotels, [key]: toSelected(hotel) },
      ...(perCity ? { lodgingCityRates: { ...input.lodgingCityRates, [key]: rate } } : { lodgingRatePerNight: rate }),
      costStatus: { ...input.costStatus, lodging: "estimated" },
    });
  };

  const deselect = (key: string) => {
    const next = { ...input.selectedHotels };
    delete next[key];
    onChange({ selectedHotels: next });
  };

  const selectedEntries = Object.entries(input.selectedHotels);

  return (
    <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/30 p-3">
      <p className="text-xs font-semibold text-slate-800">{isBnb ? "숙소 찾기 (웹 검색)" : `${word} 찾기 (웹 검색)`}</p>

      {selectedEntries.length > 0 && (
        <ul className="space-y-1.5">
          {selectedEntries.map(([key, hotel]) => (
            <li key={key} className="flex items-start justify-between gap-2 rounded-md bg-white p-2.5 ring-1 ring-indigo-200">
              <div className="min-w-0 text-[11px] leading-4 text-slate-600">
                <p className="text-xs font-semibold text-slate-900">
                  {key}: {hotel.name} <span className="font-normal text-slate-500">({hotel.grade})</span>
                </p>
                <p>{hotel.area}</p>
              </div>
              <button
                type="button"
                onClick={() => deselect(key)}
                aria-label={`${key} 선택한 숙소 해제`}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1.5">
        <label htmlFor="hotelRegion" className="block text-[11px] font-medium text-slate-600">
          검색 지역
        </label>
        <input
          id="hotelRegion"
          type="text"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          placeholder={cities[0] ? `비워두면 "${cities[0]}"로 찾습니다` : input.destination.trim() ? `비워두면 "${input.destination.trim()}"로 찾습니다` : "예) 로마 시내"}
          className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        {cities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {cities.map((city) => (
              <button
                key={city}
                type="button"
                onClick={() => setRegion(city)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  effectiveRegion === city ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-indigo-300"
                }`}
              >
                {city}
              </button>
            ))}
          </div>
        )}
        {perCity && (
          <p className="text-[10px] leading-4 text-slate-500">코스에 여러 도시가 있어 도시별로 따로 검색하고 선택합니다.</p>
        )}
      </div>

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
          {state.status === "loading" ? "웹에서 조사 중..." : `"${effectiveRegion || "지역"}" ${word} 검색`}
        </button>
        {!canSearch && <span className="text-[11px] text-slate-500">여행지나 검색 지역을 먼저 입력하세요.</span>}
        {canSearch && (
          <a
            href={regionMapUrl(effectiveRegion, input.lodgingType)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
          >
            <Map className="h-4 w-4" aria-hidden />
            지역 지도에서 보기
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        )}
      </div>
      {canSearch && (
        <p className="text-[10px] leading-4 text-slate-500">
          지도에서 보기를 누르면 &quot;{effectiveRegion} {word}&quot;를 구글 지도에서 검색해, 그 지역의 숙소들이 지도 위에 핀으로 함께 표시됩니다. 위치를 보고 마음에 드는 곳을 고른 뒤, 아래에서 같은 이름을 검색해 선택하세요.
        </p>
      )}

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
                selected={input.selectedHotels[effectiveRegion]?.name === hotel.name}
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
