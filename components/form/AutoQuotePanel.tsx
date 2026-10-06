"use client";

import { Check, CircleAlert, Loader2, Minus, Sparkles } from "lucide-react";
import type { AutoQuote, AutoStepStatus } from "@/hooks/useAutoQuote";

const STATUS_ICON: Record<AutoStepStatus, React.ReactNode> = {
  pending: <span className="h-3.5 w-3.5 rounded-full border border-slate-300" aria-hidden />,
  running: <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" aria-hidden />,
  done: <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />,
  skipped: <Minus className="h-3.5 w-3.5 text-slate-400" aria-hidden />,
  error: <CircleAlert className="h-3.5 w-3.5 text-amber-600" aria-hidden />,
};

/** 비어 있는 원가·시세·경쟁사를 한 번에 채우는 "자동 견적" 버튼과 진행 상황 */
export function AutoQuotePanel({ auto }: { auto: AutoQuote }) {
  const started = auto.running || auto.filledCount !== null;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void auto.run()}
        disabled={auto.running}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
      >
        {auto.running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
        {auto.running ? "자동 견적 중... (1~2분)" : "자동 견적 — 빈 값 한 번에 채우기"}
      </button>
      <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
        <input type="checkbox" checked={auto.afterGenerate} onChange={(e) => auto.setAfterGenerate(e.target.checked)} />
        코스를 만들면 자동 견적도 바로 이어서 실행
      </label>
      <p className="text-[11px] leading-4 text-slate-500">
        이미 입력한 값은 그대로 두고 비어 있는 것만 채웁니다. 지난 견적 값이 있으면 그것을 먼저 쓰고, 없으면 웹 검색으로 추정합니다. 채운 값은 모두 &quot;추정&quot;으로 표시됩니다.
      </p>
      {started && (
        <ul className="space-y-1 rounded-lg bg-slate-50 p-2.5" aria-live="polite">
          {auto.steps.map((step) => (
            <li key={step.key} className="flex items-start gap-2 text-[11px] leading-4">
              <span className="mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center">{STATUS_ICON[step.status]}</span>
              <span className="font-medium text-slate-700">{step.label}</span>
              {step.message && <span className={step.status === "error" ? "text-amber-700" : "text-slate-500"}>{step.message}</span>}
            </li>
          ))}
          {auto.filledCount !== null && !auto.running && (
            <li className="pt-1 text-[11px] font-semibold text-indigo-800">
              {auto.filledCount > 0 ? `추정값 ${auto.filledCount}건을 채웠습니다. 판매 전에 확인하세요.` : "새로 채운 원가는 없습니다."}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
