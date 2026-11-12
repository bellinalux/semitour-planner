"use client";

import { Undo2 } from "lucide-react";
import type { UndoHistoryView } from "@/hooks/useUndoHistory";
import { TaskTray, type TrayTask } from "./TaskTray";

/**
 * 화면 오른쪽 아래에 떠 있는 상태 표시 — 적용하지 않은 자동 변경 경고, 되돌리기 버튼, 진행 중인 작업 목록.
 * (PlannerApp에서 떼어 냄)
 */
export function FloatingStatus({ history, tasks }: { history: UndoHistoryView; tasks: TrayTask[] }) {
  return (
      <div className="screen-only pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 flex flex-col items-end gap-2 [&>*]:pointer-events-auto">
      {history.blocked && (
        <div role="alert" className="w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-rose-300 bg-rose-50 p-3 text-[11px] leading-4 text-rose-900 shadow-md">
          <p className="font-semibold">“{history.blocked.label}”을(를) 적용하지 않았습니다 — 할 수 없는 시간이 새로 생깁니다</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-pretty">
            {history.blocked.reasons.slice(0, 5).map((r) => (
              <li key={r}>{r}</li>
            ))}
            {history.blocked.reasons.length > 5 && <li>그 밖에 {history.blocked.reasons.length - 5}건</li>}
          </ul>
          <div className="mt-2 flex gap-1.5">
            <button type="button" onClick={history.applyBlocked} className="rounded-md border border-rose-300 bg-white px-2 py-0.5 font-semibold hover:bg-rose-100">
              그래도 적용
            </button>
            <button type="button" onClick={history.dismissBlocked} className="rounded-md px-2 py-0.5 text-rose-700 hover:bg-rose-100">
              닫기
            </button>
          </div>
        </div>
      )}
      {history.last && (
        <button
          type="button"
          onClick={history.undo}
          title="Ctrl+Z로도 되돌릴 수 있습니다"
          className="inline-flex max-w-[calc(100vw-2rem)] items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-md hover:bg-slate-50"
        >
          <Undo2 className="size-3.5" aria-hidden />
          <span className="truncate">되돌리기 — {history.last}</span>
          {history.count > 1 && <span className="font-normal text-slate-400">({history.count})</span>}
        </button>
      )}
      <TaskTray tasks={tasks} />
      </div>
  );
}
