"use client";

import { AlertTriangle, ChevronDown } from "lucide-react";
import { useState } from "react";

interface Props {
  /** 이 날 확인할 것 이름 (예: 일정 과부하, 지그재그 동선) */
  labels: string[];
  children: React.ReactNode;
}

/**
 * 일정 카드의 확인할 것 묶음 — 과부하·지그재그·동선 밖 식당·연속 운전·늦은 종료를 한 줄("이 날 확인할 것 3개")로 접어 두고,
 * 펼치면 각각의 설명과 고치기 버튼이 나온다. 카드가 경고로 길어지지 않게 한다.
 */
export function DayIssues({ labels, children }: Props) {
  const [open, setOpen] = useState(false);
  if (labels.length === 0) return null;
  return (
    <div className="border-b border-slate-100">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-1.5 bg-amber-50 px-4 py-2 text-left text-[11px] leading-4 text-amber-900 hover:bg-amber-100/70"
      >
        <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
        <b>이 날 확인할 것 {labels.length}개</b>
        {labels.map((l) => (
          <span key={l} className="rounded bg-white/80 px-1.5 py-0.5 font-medium ring-1 ring-amber-200">
            {l}
          </span>
        ))}
        <span className="ml-auto inline-flex items-center gap-0.5 text-amber-700">
          {open ? "접기" : "자세히·고치기"}
          <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </span>
      </button>
      <div hidden={!open}>{children}</div>
    </div>
  );
}
