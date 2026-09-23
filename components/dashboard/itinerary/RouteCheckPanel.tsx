"use client";

import { AlertTriangle, Loader2, Route } from "lucide-react";
import { useRequest } from "@/hooks/useRequest";
import type { RouteCheckRequest, RouteCheckResponse } from "@/lib/schemas/routeCheck";
import type { ItineraryItem } from "@/types";

interface Props {
  /** 방문 순서대로 나열한 이 세션(오전/오후/하루)의 항목들 */
  items: ItineraryItem[];
  destination: string;
  /** 이 세션이 속한 도시 (다지역 코스에서 더 정확한 위치 확인에 쓴다) */
  city?: string;
  /** 제안된 순서(항목 id 배열)를 적용한다 */
  onApply: (orderedIds: string[]) => void;
}

/** AI 웹 검색으로 이 세션 방문 순서가 지그재그로 비효율적인지 확인하고, 더 나은 순서를 제안·적용한다. */
export function RouteCheckPanel({ items, destination, city, onApply }: Props) {
  const { state, data, run } = useRequest<RouteCheckRequest, RouteCheckResponse>("/api/check-route");
  const canCheck = items.length >= 3 && destination.trim() !== "";
  if (!canCheck) return null;

  const check = () =>
    run({
      destination: destination.trim(),
      city: city?.trim() || undefined,
      items: items.map((i) => ({ id: i.id, name: i.name })),
    });

  const apply = () => {
    if (data && data.suggestedOrder.length > 0) onApply(data.suggestedOrder);
  };

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={check}
        disabled={state.status === "loading"}
        title="이 순서대로 다니면 동선이 비효율적으로 왔다갔다하는지 웹 검색으로 확인합니다"
        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state.status === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Route className="h-3.5 w-3.5" aria-hidden />}
        {state.status === "loading" ? "동선 확인 중..." : "동선 확인"}
      </button>

      {state.status === "error" && <p className="mt-1 text-[11px] text-red-600">{state.error}</p>}

      {state.status === "success" && data && !data.searched && <p className="mt-1 text-[11px] text-amber-700">웹 검색 근거를 확보하지 못해 확인하지 못했습니다.</p>}

      {state.status === "success" &&
        data &&
        data.searched &&
        (data.isZigzag ? (
          <div className="mt-1.5 space-y-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-900">
            <p className="flex items-start gap-1.5 font-semibold">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              동선이 비효율적일 수 있습니다
            </p>
            <p>{data.reason}</p>
            <button type="button" onClick={apply} className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2 py-1 font-semibold text-white hover:bg-amber-700">
              제안한 순서로 변경
            </button>
          </div>
        ) : (
          <p className="mt-1 text-[11px] leading-4 text-emerald-700">현재 순서가 대체로 자연스럽습니다. {data.reason}</p>
        ))}
    </div>
  );
}
