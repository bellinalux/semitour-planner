"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

interface Props {
  label: string;
  /** 접힌 상태에서 라벨 옆에 보여주는 현재 설정 요약 */
  summary?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/** 길어지는 선택 항목을 한 줄로 접어 두는 드롭다운. 접어도 안의 입력값은 그대로 유지된다. */
export function Disclosure({ label, summary, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-slate-100/60"
      >
        <span className="text-xs font-semibold text-slate-700">{label}</span>
        {!open && summary && <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">{summary}</span>}
        <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      <div className="space-y-4 border-t border-slate-200 p-3" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
