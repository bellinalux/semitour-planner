"use client";

import { AlertTriangle, ArrowUpDown, Check, ExternalLink, Loader2, PlaneTakeoff, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { useRequest } from "@/hooks/useRequest";
import { formatMoney } from "@/lib/currency";
import type { FlightOption } from "@/types";
import type { SectionProps } from "./types";

interface Result {
  flights: FlightOption[];
  sources: { title: string; url: string }[];
  searched: boolean;
}

type SortMode = "priceAsc" | "departAsc" | "durationAsc";
type StopFilter = "all" | "direct" | "transit";

const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: "priceAsc", label: "요금 낮은순" },
  { id: "departAsc", label: "출발 이른순" },
  { id: "durationAsc", label: "비행시간 짧은순" },
];

const STOP_FILTERS: { id: StopFilter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "direct", label: "직항만" },
  { id: "transit", label: "경유만" },
];

/** "5시간 30분" 같은 표기에서 대략의 분 단위 값을 뽑는다 (정렬용, 실패하면 매우 큰 값) */
function durationMinutes(text: string): number {
  const h = /(\d+)\s*시간/.exec(text);
  const m = /(\d+)\s*분/.exec(text);
  if (!h && !m) return Number.MAX_SAFE_INTEGER;
  return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
}

/**
 * API가 아니라 AI 웹 검색으로 개별 항공편(편명·시간·공항)을 여러 개 찾아, 정렬·필터해서 고를 수 있게 한다.
 * "/api/search-flight-price"(가격대만)의 더 상세한 버전이다.
 */
export function FlightOptionsPanel({ input, onChange }: SectionProps) {
  const { state, data, run } = useRequest<{ origin: string; destination: string; days: number; departureDate: string; currency: string }, Result>(
    "/api/search-flight-options",
  );
  const [sort, setSort] = useState<SortMode>("priceAsc");
  const [stopFilter, setStopFilter] = useState<StopFilter>("all");
  const [appliedNumber, setAppliedNumber] = useState<string | null>(null);
  const canRun = input.originCity.trim() !== "" && input.destination.trim() !== "" && input.days >= 2;

  const search = () => {
    setAppliedNumber(null);
    return run({ origin: input.originCity.trim(), destination: input.destination.trim(), days: input.days, departureDate: input.departureDate, currency: input.currency });
  };

  const apply = (f: FlightOption) => {
    onChange({ flightPricePerPerson: f.price, costStatus: { ...input.costStatus, flight: "estimated" } });
    setAppliedNumber(f.flightNumber || f.airline);
  };

  const flights = useMemo(() => {
    const list = (data?.flights ?? []).filter((f) => stopFilter === "all" || (stopFilter === "direct" ? f.stops === 0 : f.stops > 0));
    const sorted = [...list];
    if (sort === "priceAsc") sorted.sort((a, b) => (a.price || Infinity) - (b.price || Infinity));
    if (sort === "departAsc") sorted.sort((a, b) => (a.departTime || "99:99").localeCompare(b.departTime || "99:99"));
    if (sort === "durationAsc") sorted.sort((a, b) => durationMinutes(a.duration) - durationMinutes(b.duration));
    return sorted;
  }, [data, sort, stopFilter]);

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
          {state.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PlaneTakeoff className="h-4 w-4" aria-hidden />}
          {state.status === "loading" ? "항공편 여러 개 찾는 중..." : "항공편 상세 검색 (편명·시간·직항 여부)"}
        </button>
        {!canRun && <span className="text-[11px] text-slate-500">출발지·여행지·여행 일수(2일 이상)를 먼저 입력하세요.</span>}
      </div>

      {state.status === "error" && (
        <ErrorBanner title="항공편을 찾지 못했습니다" message={state.error ?? "잠시 후 다시 시도해 주세요."} onRetry={search} />
      )}

      {state.status === "success" && data && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-[11px] leading-4 text-slate-700">
          {!data.searched && (
            <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-2 text-amber-800">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              웹 검색 근거를 확보하지 못했습니다. 편명·시간을 확인하지 못해 결과가 비어 있을 수 있습니다. 잠시 후 다시 시도해 주세요.
            </p>
          )}

          {flights.length === 0 ? (
            <p className="text-slate-500">조건에 맞는 항공편을 찾지 못했습니다. 필터를 &quot;전체&quot;로 바꾸거나 다시 검색해 보세요.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <span className="text-slate-500">총 {flights.length}개</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <div role="radiogroup" aria-label="직항·경유 필터" className="inline-flex overflow-hidden rounded-md border border-slate-300">
                    {STOP_FILTERS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        role="radio"
                        aria-checked={stopFilter === f.id}
                        onClick={() => setStopFilter(f.id)}
                        className={`px-2 py-1 text-[11px] font-medium ${stopFilter === f.id ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <label className="inline-flex items-center gap-1 text-slate-500">
                    <ArrowUpDown className="h-3 w-3" aria-hidden />
                    <select
                      aria-label="정렬"
                      value={sort}
                      onChange={(e) => setSort(e.target.value as SortMode)}
                      className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[11px] text-slate-700"
                    >
                      {SORT_OPTIONS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <ul className="space-y-1.5">
                {flights.map((f, i) => {
                  const key = `${f.flightNumber || f.airline}-${i}`;
                  const applied = appliedNumber !== null && appliedNumber === (f.flightNumber || f.airline);
                  return (
                    <li key={key} className="rounded-md border border-slate-200 p-2">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold text-slate-900">{f.airline || "항공사 미확인"}</span>
                        {f.flightNumber && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{f.flightNumber}</span>}
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${f.stops === 0 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                          {f.stops === 0 ? "직항" : `경유 ${f.stops}회`}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${f.basis === "searched" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
                          title={f.basis === "searched" ? "검색 결과 페이지에서 확인한 요금" : "AI 추정"}
                        >
                          {f.basis === "searched" ? "검색 확인" : "추정"}
                        </span>
                        <span className="ml-auto font-semibold tabular-nums text-slate-900">{f.price > 0 ? money(f.price) : "요금 확인 못함"}</span>
                      </div>
                      <p className="mt-1 tabular-nums text-slate-600">
                        {f.departDate && `${f.departDate} · `}
                        {f.departAirport || "출발지"} {f.departTime || "--:--"} → {f.arriveAirport || "도착지"} {f.arriveTime || "--:--"}
                        {f.duration && ` · ${f.duration}`}
                      </p>
                      {f.sourceName && <p className="mt-0.5 text-slate-400">확인 출처: {f.sourceName}</p>}
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {f.price > 0 && (
                          <button
                            type="button"
                            onClick={() => apply(f)}
                            className="inline-flex items-center gap-1 rounded-md border border-indigo-300 bg-indigo-50 px-2 py-1 font-semibold text-indigo-700 hover:bg-indigo-100"
                          >
                            {applied ? <Check className="h-3 w-3" aria-hidden /> : null}
                            {applied ? "적용됨" : "이 항공편 요금 적용"}
                          </button>
                        )}
                        {f.link && (
                          <a href={f.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline">
                            <Search className="h-3 w-3" aria-hidden />
                            찾아보기
                            <ExternalLink className="h-3 w-3" aria-hidden />
                          </a>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {data.sources.length > 0 && (
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
              <p className="text-slate-400">웹 검색 시점의 참고 정보입니다. 실제 예약 전 항공사·예약처에서 잔여 좌석과 정확한 시간을 다시 확인하세요.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
