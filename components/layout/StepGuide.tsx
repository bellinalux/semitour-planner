"use client";

import { Check, ChevronRight, Loader2 } from "lucide-react";

export type StepStatus = "done" | "current" | "todo" | "warn" | "running";

export interface GuideStep {
  label: string;
  status: StepStatus;
  /** 상태 한 줄 (예: "확인할 값 3건") */
  detail: string;
  onClick: () => void;
}

const TONE: Record<StepStatus, string> = {
  done: "border-emerald-200 bg-emerald-50 text-emerald-800",
  current: "border-indigo-300 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-200",
  todo: "border-slate-200 bg-white text-slate-500",
  warn: "border-amber-300 bg-amber-50 text-amber-900",
  running: "border-indigo-300 bg-indigo-50 text-indigo-900",
};

/** 화면 위 진행 안내: ① 입력 → ② 코스 → ③ 견적 → ④ 문서. 지금 할 일을 강조하고, 누르면 그 단계로 간다 */
export function StepGuide({ steps }: { steps: GuideStep[] }) {
  return (
    <nav aria-label="진행 단계" className="border-b border-slate-200 bg-white px-3 py-1.5">
      <ol className="flex items-stretch gap-1 overflow-x-auto">
        {steps.map((step, i) => (
          <li key={step.label} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />}
            <button
              type="button"
              onClick={step.onClick}
              aria-current={step.status === "current" ? "step" : undefined}
              className={`flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-left text-[11px] leading-4 hover:brightness-95 ${TONE[step.status]}`}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/70 text-[10px] font-bold">
                {step.status === "done" ? <Check className="h-3 w-3" aria-hidden /> : step.status === "running" ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : i + 1}
              </span>
              <span className="font-semibold whitespace-nowrap">{step.label}</span>
              <span className="hidden truncate opacity-80 sm:inline">{step.detail}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
