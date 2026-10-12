"use client";

import { Bus } from "lucide-react";
import { useState } from "react";
import { formatDuration } from "@/lib/format";
import { useNumberText } from "@/hooks/useNumberText";

/** 항목 사이 이동 줄 — 작고 연하게 보이고, 누르면 그 자리에서 이동 시간(분)을 고친다 */
export function TravelLine({ minutes, label, onChange }: { minutes: number; label: string; onChange: (minutes: number) => void }) {
  const [editing, setEditing] = useState(false);
  const { text, onTextChange, onBlur } = useNumberText(minutes, (v) => onChange(Math.min(1440, Math.round(v))));
  if (editing) {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
        <Bus className="size-3" aria-hidden />
        다음 장소까지 이동
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={5}
          autoFocus
          value={text}
          aria-label={`${label} 시간(분)`}
          onChange={(e) => onTextChange(e.target.value)}
          onBlur={() => {
            onBlur();
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur();
          }}
          className="w-14 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-right text-xs tabular-nums text-slate-900 focus:border-indigo-500 focus:outline-none"
        />
        분
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="누르면 이동 시간을 고칩니다"
      className="mt-2 flex items-center gap-1.5 rounded px-1 -ml-1 text-[11px] text-slate-400 hover:bg-slate-100 hover:text-slate-700"
    >
      <Bus className="size-3" aria-hidden />
      다음 장소까지 이동 {formatDuration(minutes)}
    </button>
  );
}
