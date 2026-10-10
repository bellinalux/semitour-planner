"use client";

import { ArrowDownUp, Loader2, X } from "lucide-react";
import { useContext, useRef, useState } from "react";
import { CourseEngineContext } from "@/hooks/useCourseEngine";
import { formatDuration } from "@/lib/format";
import type { DayDiff } from "@/lib/reorder";
import type { DayPlan } from "@/types";

/**
 * [코스 재정렬] — 코스·시간을 계산해 순서를 바꾼 안을 미리 보여 주고, 적용하면 되돌리기 기록에 남긴다.
 *  전체: 여러 날 지역 묶기 → 날마다 추천 순서(영업시간·식사 시간대·이동·일몰/밤) → 식사 시간 맞추기
 *  하루(dayNo): 그날 추천 순서 → 식사 시간 맞추기
 */
export function ReorderButton({ dayNo, compact = false }: { dayNo?: number; compact?: boolean }) {
  const engine = useContext(CourseEngineContext);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<{ status: "idle" | "busy" | "ready" | "error"; days?: DayPlan[]; diffs?: DayDiff[]; message?: string }>({ status: "idle" });
  if (!engine) return null;

  const start = async () => {
    dialogRef.current?.showModal();
    setState({ status: "busy" });
    try {
      const r = await engine.reorder(dayNo ? [dayNo] : undefined);
      setState({ status: "ready", ...r });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "재정렬하지 못했습니다." });
    }
  };
  const changed = (state.diffs ?? []).filter((d) => d.changed);
  const title = dayNo ? `DAY ${dayNo} 코스 재정렬` : "코스 재정렬 (전체 일정)";

  return (
    <>
      <button
        type="button"
        onClick={() => void start()}
        aria-haspopup="dialog"
        title="코스·시간을 계산해 순서를 다시 짭니다 (미리 보고 적용)"
        className={
          compact
            ? "inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
            : "inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
        }
      >
        <ArrowDownUp className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden />
        {compact ? "재정렬" : "코스 재정렬"}
      </button>
      <dialog
        ref={dialogRef}
        aria-label={title}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-3xl rounded-xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/40"
      >
        <div className="flex max-h-[90dvh] flex-col text-xs">
          <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
              <p className="text-[11px] text-slate-500">{dayNo ? "추천 순서(영업시간·식사 시간대·이동·일몰/밤) → 식사 시간 맞추기" : "같은 지역 한 날로 묶기 → 날마다 추천 순서 → 식사 시간 맞추기"} · 적용 전에 비교해 봅니다</p>
            </div>
            <button type="button" onClick={() => dialogRef.current?.close()} aria-label="닫기" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </header>
          <div className="space-y-3 overflow-y-auto p-4">
            {state.status === "busy" && (
              <p role="status" className="flex items-center gap-2 text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                장소 정보(영업시간·위치)를 확인하며 순서를 계산합니다. 처음 보는 장소가 많으면 1분쯤 걸립니다.
              </p>
            )}
            {state.status === "error" && <p className="text-red-600">{state.message}</p>}
            {state.status === "ready" && changed.length === 0 && <p role="status" className="text-emerald-700">지금 순서가 가장 좋습니다. 바꿀 곳이 없습니다.</p>}
            {state.status === "ready" && changed.length > 0 && (
              <>
                <ul aria-label="재정렬 비교" className="space-y-3">
                  {changed.map((d) => (
                    <li key={d.day} className="space-y-1 rounded-md border border-slate-200 p-2.5">
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        <b className="text-slate-900">DAY {d.day}</b>
                        {d.endBefore && (
                          <span className="tabular-nums text-slate-600">
                            끝나는 시각 {d.endBefore} → <b className="text-slate-900">{d.endAfter}</b>
                          </span>
                        )}
                        <span className="tabular-nums text-slate-600">
                          이동 {formatDuration(d.travelBefore)} → <b className="text-slate-900">{formatDuration(d.travelAfter)}</b>
                        </span>
                        {d.scoreBefore !== null && d.scoreAfter !== null && d.scoreAfter !== d.scoreBefore && (
                          <span className="tabular-nums text-emerald-700">
                            점검 {d.scoreBefore} → {d.scoreAfter}점
                          </span>
                        )}
                      </p>
                      {d.notes.length > 0 && <p className="text-pretty text-[11px] text-indigo-800">{d.notes.join(" · ")}</p>}
                      <div className="grid gap-2 sm:grid-cols-2">
                        <ol aria-label={`DAY ${d.day} 바꾸기 전`} className="list-inside list-decimal space-y-0.5 rounded bg-slate-50 p-2 text-slate-500">
                          {d.before.map((n, k) => (
                            <li key={`${n}-${k}`} className="truncate">
                              {n}
                            </li>
                          ))}
                        </ol>
                        <ol aria-label={`DAY ${d.day} 바꾼 뒤`} className="list-inside list-decimal space-y-0.5 rounded bg-indigo-50/60 p-2 text-slate-800">
                          {d.after.map((n, k) => (
                            <li key={`${n}-${k}`} className={`truncate ${d.before[k] !== n ? "font-semibold text-indigo-900" : ""}`}>
                              {n}
                            </li>
                          ))}
                        </ol>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (state.days) engine.applyReorder(state.days);
                      dialogRef.current?.close();
                    }}
                    className="rounded-md bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700"
                  >
                    이 순서로 적용
                  </button>
                  <span className="text-[11px] text-slate-500">적용한 뒤에도 화면 위 [되돌리기] 또는 Ctrl+Z로 되돌릴 수 있습니다.</span>
                </div>
              </>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
