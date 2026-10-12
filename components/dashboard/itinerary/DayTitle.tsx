"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";

/** 날짜 카드 제목 — 누르면 그 자리에서 고친다 (Enter 저장, Esc 취소) */
export function DayTitle({ day, theme, onChange, children }: { day: number; theme: string; onChange: (theme: string) => void; children?: React.ReactNode }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft !== null) {
    const save = () => {
      const next = draft.trim();
      if (next && next !== theme) onChange(next);
      setDraft(null);
    };
    return (
      <input
        autoFocus
        value={draft}
        aria-label={`DAY ${day} 제목`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setDraft(null);
        }}
        className="min-w-0 flex-1 basis-48 rounded-md border border-indigo-400 bg-white px-2 py-1 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
      />
    );
  }
  return (
    <h3 className="min-w-0 flex-1 basis-48 text-pretty text-sm font-semibold leading-6 text-slate-900">
      <button type="button" onClick={() => setDraft(theme)} title="누르면 제목을 고칩니다" className="group text-left hover:text-indigo-700">
        {theme || `DAY ${day}`}
        <Pencil className="ml-1 inline size-3 text-slate-300 group-hover:text-indigo-500" aria-hidden />
      </button>
      {children}
    </h3>
  );
}
