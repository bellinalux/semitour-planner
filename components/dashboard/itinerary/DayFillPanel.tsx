"use client";

import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { useRequest } from "@/hooks/useRequest";
import { formatDuration } from "@/lib/format";
import type { DayGap } from "@/lib/dayLoad";
import type { DayFillRequest, DayFillResponse } from "@/lib/schemas/dayFill";
import { dayFillToItem } from "@/lib/tourItem";
import type { CurrencyCode, ItineraryItem, TourSlot } from "@/types";

interface Props {
  dayNo: number;
  gap: DayGap;
  destination: string;
  city?: string;
  currency: CurrencyCode;
  /** 이미 일정에 있는 장소 이름 (중복 추천을 피하는 데 쓴다) */
  existingNames: string[];
  onApply: (dayNo: number, slot: TourSlot, items: ItineraryItem[]) => void;
}

/** 도착일처럼 오후~저녁이 통째로 비는 날짜에, 한국인 관광객에게 인기 있는 코스를 웹 검색으로 추천해 채운다. */
export function DayFillPanel({ dayNo, gap, destination, city, currency, existingNames, onApply }: Props) {
  const { state, data, run } = useRequest<DayFillRequest, DayFillResponse>("/api/suggest-day-fill");

  const suggest = () =>
    run({
      destination: destination.trim(),
      city: city?.trim() || undefined,
      currency,
      existingNames,
      freeMinutes: gap.freeMinutes,
      fromTime: gap.fromTime,
    });

  const apply = () => {
    if (!data || data.suggestions.length === 0) return;
    const items = data.suggestions.map((s, i) => dayFillToItem(s, i === data.suggestions.length - 1));
    onApply(dayNo, "day", items);
  };

  return (
    <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-start gap-1.5 text-[11px] leading-4 text-indigo-900">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-indigo-500" aria-hidden />
          {gap.fromTime}부터 저녁까지 약 {formatDuration(gap.freeMinutes)}이 비어 있습니다. 이대로 두면 버려지는 일정이 됩니다.
        </p>
        <button
          type="button"
          onClick={suggest}
          disabled={state.status === "loading"}
          title="한국인 관광객에게 인기 있는 코스를 웹 검색으로 찾아 이 빈 시간에 채웁니다"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state.status === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
          {state.status === "loading" ? "추천 일정 찾는 중..." : "추천일정 채우기"}
        </button>
      </div>

      {state.status === "error" && <p className="mt-2 text-[11px] text-red-600">{state.error}</p>}

      {state.status === "success" && data && !data.searched && (
        <p className="mt-2 text-[11px] text-amber-700">웹 검색 근거를 확보하지 못해 추천하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
      )}

      {state.status === "success" && data && data.searched && data.suggestions.length === 0 && (
        <p className="mt-2 text-[11px] text-slate-500">겹치지 않으면서 근거 있게 추천할 만한 곳을 찾지 못했습니다.</p>
      )}

      {state.status === "success" && data && data.suggestions.length > 0 && (
        <div className="mt-2.5 space-y-2 border-t border-indigo-100 pt-2.5">
          <ul className="space-y-1.5">
            {data.suggestions.map((s) => (
              <li key={s.name} className="rounded-md bg-white px-2.5 py-2 text-[11px] leading-4 text-slate-700 ring-1 ring-indigo-100">
                <p className="font-semibold text-slate-900">
                  {s.name} <span className="font-normal text-slate-400">· 체류 {formatDuration(s.stayMinutes)}</span>
                </p>
                <p>{s.description}</p>
                {s.reason && <p className="mt-0.5 text-indigo-700">{s.reason}</p>}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={apply}
            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            이 일정 추가
          </button>
          {data.sources.length > 0 && (
            <details>
              <summary className="cursor-pointer text-[11px] font-medium text-indigo-700">참고한 출처 ({data.sources.length})</summary>
              <ul className="mt-1 space-y-0.5">
                {data.sources.map((src) => (
                  <li key={src.url}>
                    <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-indigo-600 hover:underline">
                      {src.title}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
