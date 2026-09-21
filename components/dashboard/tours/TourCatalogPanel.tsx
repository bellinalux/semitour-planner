"use client";

import { AlertTriangle, Compass, Info, Loader2, Search } from "lucide-react";
import { useState } from "react";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { useTourSearch } from "@/hooks/useTourSearch";
import { TOUR_CATEGORIES } from "@/lib/itemTypes";
import { slotOptions, tourToItem } from "@/lib/tourItem";
import type { CourseMeta, DayPlan, ItineraryItem, TourCandidate, TourCategory, TourSlot, TripInput } from "@/types";
import { TourCard } from "./TourCard";

interface Props {
  input: TripInput;
  meta: CourseMeta | null;
  days: DayPlan[];
  onAddTour: (dayNo: number, slot: TourSlot, item: ItineraryItem) => void;
  onAddOption: (tour: TourCandidate, dayNo: number) => void;
}

/** 검색할 도시 목록. 여러 도시를 도는 코스면 도시를 고를 수 있게 한다. */
function searchCities(input: TripInput, meta: CourseMeta | null): string[] {
  if (meta && meta.cities.length > 1) return meta.cities;
  return [input.destination.trim()].filter(Boolean);
}

export function TourCatalogPanel({ input, meta, days, onAddTour, onAddOption }: Props) {
  const cities = searchCities(input, meta);
  const [categories, setCategories] = useState<TourCategory[]>(["city", "night"]);
  const [cityIndex, setCityIndex] = useState(0);
  const [added, setAdded] = useState<Record<string, string[]>>({});
  const [optionAdded, setOptionAdded] = useState<Record<string, number>>({});
  const { state, result, run } = useTourSearch();
  const city = cities[Math.min(cityIndex, cities.length - 1)] ?? "";

  const toggle = (id: TourCategory) =>
    setCategories((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  const search = () => {
    setAdded({});
    setOptionAdded({});
    return run({ destination: city, categories, currency: input.currency });
  };

  const add = (tourName: string, dayNo: number, slot: TourSlot) => {
    const tour = result?.tours.find((t) => t.name === tourName);
    const day = days.find((d) => d.day === dayNo);
    if (!tour || !day) return;
    onAddTour(dayNo, slot, tourToItem(tour));
    const where = `DAY ${dayNo} ${slotOptions(day).find((s) => s.slot === slot)?.label ?? ""}`.trim();
    setAdded((prev) => ({ ...prev, [tourName]: [...(prev[tourName] ?? []), where] }));
  };

  const addOption = (tourName: string, dayNo: number) => {
    const tour = result?.tours.find((t) => t.name === tourName);
    if (!tour) return;
    onAddOption(tour, dayNo);
    setOptionAdded((prev) => ({ ...prev, [tourName]: (prev[tourName] ?? 0) + 1 }));
  };

  return (
    <SectionCard
      title="지역 투어 카탈로그"
      description="시내·야경·박물관 투어 등을 웹에서 조회해 일정에 넣습니다"
      icon={Compass}
    >
      <div className="space-y-3">
        {cities.length > 1 && (
          <div role="radiogroup" aria-label="투어를 찾을 도시" className="flex flex-wrap gap-1.5">
            {cities.map((c, i) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={i === cityIndex}
                onClick={() => setCityIndex(i)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  i === cityIndex ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-indigo-300"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {TOUR_CATEGORIES.map((c) => (
            <ChipToggle key={c.id} label={`${c.emoji} ${c.label}`} selected={categories.includes(c.id)} onToggle={() => toggle(c.id)} />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={search}
            disabled={city === "" || categories.length === 0 || state.status === "loading"}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {state.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
            {state.status === "loading" ? "웹에서 조사 중..." : "투어 검색"}
          </button>
          {categories.length === 0 && <span className="text-[11px] text-slate-500">투어 종류를 하나 이상 고르세요.</span>}
          {city === "" && <span className="text-[11px] text-slate-500">왼쪽에서 여행지를 먼저 입력하세요.</span>}
        </div>

        {state.status === "loading" && (
          <div className="space-y-2" aria-busy="true" aria-label="투어 검색 중">
            <p className="text-[11px] text-slate-500">웹 검색으로 판매 중인 투어와 요금, 후기를 확인하고 있습니다. 1분 정도 걸릴 수 있어요.</p>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        )}

        {state.status === "error" && (
          <ErrorBanner title="투어를 찾지 못했습니다" message={state.error ?? "잠시 후 다시 시도해 주세요."} onRetry={search} />
        )}

        {state.status === "success" && result && (
          <div className="space-y-2">
            {!result.searched && (
              <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                웹 검색 근거를 확보하지 못했습니다. AI 기억에 의존한 참고 정보라서 상품명, 요금, 운영 여부를 반드시 직접 확인하세요.
              </p>
            )}
            <p className="flex items-start gap-1.5 rounded-md bg-slate-50 px-2.5 py-2 text-[11px] leading-4 text-slate-500">
              <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              &quot;일정에 넣기&quot;는 1인 요금(검색 범위의 중간값)을 기본 견적의 입장·체험료에 넣고, &quot;선택 옵션으로 추가&quot;는 기본 요금 밖에서 고객이 고르는 옵션으로 등록합니다. 오후 코스는 고객이 선택한 코스만 원가에 포함됩니다.
            </p>
            <ul className="space-y-2">
              {result.tours.map((tour) => (
                <TourCard
                  key={tour.name}
                  tour={tour}
                  currency={input.currency}
                  days={days}
                  addedTo={added[tour.name] ?? []}
                  optionCount={optionAdded[tour.name] ?? 0}
                  onAdd={(dayNo, slot) => add(tour.name, dayNo, slot)}
                  onAddOption={(dayNo) => addOption(tour.name, dayNo)}
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
              요금과 운영 여부는 검색 시점의 참고 정보입니다. 판매 전에 예약처에서 날짜별 요금과 잔여 좌석을 확인하세요.
            </p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
