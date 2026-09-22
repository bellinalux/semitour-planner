"use client";

import { AlertTriangle, ChevronLeft, ChevronRight, Compass, Info, Loader2, Plus, Search, Store } from "lucide-react";
import { useMemo, useState } from "react";
import { ChipToggle } from "@/components/ui/ChipToggle";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { useRequest } from "@/hooks/useRequest";
import { useTourSearch } from "@/hooks/useTourSearch";
import { TOUR_CATEGORIES } from "@/lib/itemTypes";
import { slotOptions, tourToItem } from "@/lib/tourItem";
import type { CourseMeta, DayPlan, ItineraryItem, TourCandidate, TourCategory, TourSlot, TripInput, ViatorSearchResult } from "@/types";
import { TourCard } from "./TourCard";

interface Props {
  input: TripInput;
  meta: CourseMeta | null;
  days: DayPlan[];
  onAddTour: (dayNo: number, slot: TourSlot, item: ItineraryItem) => void;
  onAddOption: (tour: TourCandidate, dayNo: number) => void;
}

type SortMode = "default" | "priceAsc" | "priceDesc" | "source";

const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: "default", label: "기본순" },
  { id: "priceAsc", label: "요금 낮은순" },
  { id: "priceDesc", label: "요금 높은순" },
  { id: "source", label: "출처별로 묶어보기" },
];

const PAGE_SIZE = 6;
const NO_SOURCE = "출처 미확인";

/** 검색할 도시 목록. 여러 도시를 도는 코스면 도시를 고를 수 있게 한다. */
function searchCities(input: TripInput, meta: CourseMeta | null): string[] {
  if (meta && meta.cities.length > 1) return meta.cities;
  return [input.destination.trim()].filter(Boolean);
}

/** 정렬 모드에 맞게 목록을 정리한다. "출처별"은 정렬이 아니라 출처별 묶음을 돌려준다. */
function sortTours(tours: TourCandidate[], mode: SortMode): TourCandidate[] {
  if (mode === "default") return tours;
  const avgPrice = (t: TourCandidate) => (t.priceLow + t.priceHigh) / 2;
  const sorted = [...tours];
  if (mode === "priceAsc") sorted.sort((a, b) => avgPrice(a) - avgPrice(b));
  if (mode === "priceDesc") sorted.sort((a, b) => avgPrice(b) - avgPrice(a));
  return sorted;
}

function groupBySource(tours: TourCandidate[]): { source: string; tours: TourCandidate[] }[] {
  const groups = new Map<string, TourCandidate[]>();
  for (const tour of tours) {
    const key = tour.sourceName || NO_SOURCE;
    groups.set(key, [...(groups.get(key) ?? []), tour]);
  }
  // 투어 수가 많은 출처가 위로 오게, 같은 개수면 가나다순
  return [...groups.entries()]
    .sort(([a, aTours], [b, bTours]) => bTours.length - aTours.length || a.localeCompare(b, "ko"))
    .map(([source, list]) => ({ source, tours: list }));
}

export function TourCatalogPanel({ input, meta, days, onAddTour, onAddOption }: Props) {
  const cities = searchCities(input, meta);
  const [categories, setCategories] = useState<TourCategory[]>(["city", "night"]);
  const [cityIndex, setCityIndex] = useState(0);
  const [operatorName, setOperatorName] = useState("");
  const [added, setAdded] = useState<Record<string, string[]>>({});
  const [optionAdded, setOptionAdded] = useState<Record<string, number>>({});
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const [page, setPage] = useState(1);
  const { state, result, run, moreState, loadMore } = useTourSearch();
  const viator = useRequest<{ destination: string; categories: TourCategory[]; currency: string }, ViatorSearchResult>("/api/viator-tours");
  const city = cities[Math.min(cityIndex, cities.length - 1)] ?? "";
  const operator = operatorName.trim();

  const orderedTours = useMemo(() => (result ? sortTours(result.tours, sortMode) : []), [result, sortMode]);
  const grouped = sortMode === "source" ? groupBySource(orderedTours) : null;
  const totalPages = Math.max(1, Math.ceil(orderedTours.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageTours = grouped ? [] : orderedTours.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const toggle = (id: TourCategory) =>
    setCategories((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  const search = () => {
    setAdded({});
    setOptionAdded({});
    setSortMode("default");
    setPage(1);
    return run({ destination: city, categories, currency: input.currency, operatorName: operator });
  };

  const changeSort = (mode: SortMode) => {
    setSortMode(mode);
    setPage(1);
  };

  const searchViator = () => {
    setAdded({});
    setOptionAdded({});
    return viator.run({ destination: city, categories, currency: input.currency });
  };

  const add = (tour: TourCandidate, dayNo: number, slot: TourSlot) => {
    const tourName = tour.name;
    const day = days.find((d) => d.day === dayNo);
    if (!day) return;
    onAddTour(dayNo, slot, tourToItem(tour));
    const where = `DAY ${dayNo} ${slotOptions(day).find((s) => s.slot === slot)?.label ?? ""}`.trim();
    setAdded((prev) => ({ ...prev, [tourName]: [...(prev[tourName] ?? []), where] }));
  };

  const addOption = (tour: TourCandidate, dayNo: number) => {
    onAddOption(tour, dayNo);
    setOptionAdded((prev) => ({ ...prev, [tour.name]: (prev[tour.name] ?? 0) + 1 }));
  };

  const renderCard = (tour: TourCandidate) => (
    <TourCard
      key={tour.name}
      tour={tour}
      currency={input.currency}
      days={days}
      addedTo={added[tour.name] ?? []}
      optionCount={optionAdded[tour.name] ?? 0}
      onAdd={(dayNo, slot) => add(tour, dayNo, slot)}
      onAddOption={(dayNo) => addOption(tour, dayNo)}
    />
  );

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

        <div>
          <label htmlFor="tourOperatorName" className="mb-1 block text-[11px] font-medium text-slate-600">
            운영사 이름 (선택)
          </label>
          <input
            id="tourOperatorName"
            value={operatorName}
            onChange={(e) => setOperatorName(e.target.value)}
            placeholder="예) 스케치북트래블"
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
          />
          <p className="mt-1 text-[11px] leading-4 text-slate-500">
            비워 두면 시장 전체에서 찾습니다. 업체 이름을 넣으면 그 업체가 운영·판매하는 투어만 찾습니다. (예: 우리 회사 이름을 넣으면 우리가 진행하는 투어만 나옵니다)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={search}
            disabled={city === "" || categories.length === 0 || state.status === "loading"}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {state.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
            {state.status === "loading" ? "웹에서 조사 중..." : operator ? `"${operator}" 투어 검색` : "투어 검색"}
          </button>
          <button
            type="button"
            onClick={searchViator}
            disabled={city === "" || categories.length === 0 || viator.state.status === "loading"}
            title="Viator에서 실제로 판매 중인 상품의 정가·평점·후기를 가져옵니다"
            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {viator.state.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Store className="h-4 w-4" aria-hidden />}
            {viator.state.status === "loading" ? "판매 상품 조회 중..." : "실제 판매 상품·시세 (Viator)"}
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
              &quot;일정에 넣기&quot;는 1인 요금(검색 범위의 중간값)을 기본 견적의 입장·체험료에 넣고, &quot;선택 옵션으로 추가&quot;는 기본 요금 밖에서 고객이 고르는 옵션으로 등록합니다. 웹 검색이 한 번에 찾는 개수에는 한계가 있습니다 — 더 필요하면 아래 &quot;더 찾기&quot;를 눌러 새로운 투어를 이어서 찾을 수 있습니다.
            </p>
            {operator && (
              <p className="rounded-md bg-indigo-50 px-2.5 py-1.5 text-[11px] font-medium text-indigo-700">
                &quot;{operator}&quot;이(가) 운영·판매하는 투어만 표시 중입니다.
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
              <span className="text-[11px] text-slate-500">총 {orderedTours.length}개 찾음</span>
              <div role="radiogroup" aria-label="정렬" className="flex flex-wrap gap-1">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={sortMode === opt.id}
                    onClick={() => changeSort(opt.id)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                      sortMode === opt.id ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-indigo-300"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {grouped ? (
              <div className="space-y-4">
                {grouped.map((g) => (
                  <div key={g.source}>
                    <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      {g.source}
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{g.tours.length}개</span>
                    </h4>
                    <ul className="space-y-2">{g.tours.map(renderCard)}</ul>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <ul className="space-y-2">{pageTours.map(renderCard)}</ul>
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      aria-label="이전 페이지"
                      className="rounded-md border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden />
                    </button>
                    <span className="text-[11px] text-slate-500">
                      {currentPage} / {totalPages} 페이지
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      aria-label="다음 페이지"
                      className="rounded-md border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                )}
              </>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={moreState.status === "loading"}
                className="inline-flex items-center gap-1.5 rounded-md border border-indigo-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {moreState.status === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
                {moreState.status === "loading" ? "더 찾는 중..." : "더 찾기"}
              </button>
              {moreState.status === "empty" && <span className="text-[11px] text-slate-500">겹치지 않는 새 투어를 더 찾지 못했습니다.</span>}
              {moreState.status === "error" && <span className="text-[11px] text-red-600">{moreState.error ?? "더 찾기에 실패했습니다."}</span>}
            </div>

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

        {viator.state.status === "loading" && (
          <div className="space-y-2" aria-busy="true" aria-label="Viator 조회 중">
            <p className="text-[11px] text-slate-500">Viator에서 판매 중인 상품을 조회하고 있습니다.</p>
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        )}

        {viator.state.status === "error" && (
          <ErrorBanner title="Viator 상품을 가져오지 못했습니다" message={viator.state.error ?? "잠시 후 다시 시도해 주세요."} onRetry={searchViator} />
        )}

        {viator.state.status === "success" && viator.data && (
          <section aria-label="Viator 판매 상품" className="space-y-2 border-t border-slate-100 pt-3">
            <h3 className="text-xs font-semibold text-slate-800">
              Viator 실제 판매 상품 · {viator.data.destinationName}
              <span className="ml-1.5 font-normal text-slate-500">({viator.data.tours.length}개, 평점·후기 순)</span>
            </h3>
            {viator.data.tours.length === 0 ? (
              <p className="rounded-md bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">조건에 맞는 판매 상품이 없습니다. 투어 종류를 바꿔 보세요.</p>
            ) : (
              <ul className="space-y-2">
                {viator.data.tours.map((tour) => (
                  <TourCard
                    key={tour.market?.productCode ?? tour.name}
                    tour={tour}
                    currency={input.currency}
                    days={days}
                    addedTo={added[tour.name] ?? []}
                    optionCount={optionAdded[tour.name] ?? 0}
                    onAdd={(dayNo, slot) => add(tour, dayNo, slot)}
                    onAddOption={(dayNo) => addOption(tour, dayNo)}
                  />
                ))}
              </ul>
            )}
            {viator.data.skipped.length > 0 && (
              <p className="text-[11px] text-amber-700">
                Viator 분류에서 찾지 못해 건너뛴 종류: {viator.data.skipped.map((c) => TOUR_CATEGORIES.find((t) => t.id === c)?.label ?? c).join(", ")}
              </p>
            )}
            <p className="text-[10px] leading-4 text-slate-400">
              Viator가 판매하는 정가입니다. 우리가 직접 운영·구매하는 투어의 원가와는 다를 수 있어, &quot;선택 옵션&quot;에 넣으면 원가와 요금은 직접 조정하세요. 상품 링크에는 Viator 제휴 추적이 포함되어 있습니다.
            </p>
          </section>
        )}
      </div>
    </SectionCard>
  );
}
