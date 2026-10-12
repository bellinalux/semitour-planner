"use client";

import type { LucideIcon } from "lucide-react";
import { useId } from "react";
import { useNumberText } from "@/hooks/useNumberText";

interface Props {
  label: string;
  icon: LucideIcon;
  value: number;
  onChange: (value: number) => void;
}

/** 자주 쓰는 소요 시간 — 입력칸을 누르면 고를 수 있게 보인다 */
const QUICK = [30, 60, 90, 120, 180];

/** 타임라인 안에서 쓰는 소요 시간(분) 입력 (라벨 + −/+ 10분 + 숫자 + "분", 자주 쓰는 시간 고르기) */
export function DurationInput({ label, icon: Icon, value, onChange }: Props) {
  const { text, onTextChange, onBlur } = useNumberText(value, onChange);
  const listId = useId();
  const step = (d: number) => onTextChange(String(Math.max(0, value + d)));

  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 py-0.5 pl-2 pr-1 text-[11px] font-medium text-slate-600">
      <Icon className="h-3 w-3" aria-hidden />
      {label}
      <button type="button" onClick={() => step(-10)} disabled={value <= 0} aria-label={`${label} 10분 줄이기`} className="rounded px-1 text-slate-500 hover:bg-white hover:text-slate-900 disabled:opacity-30">
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={5}
        value={text}
        placeholder="0"
        list={listId}
        aria-label={`${label} 시간(분)`}
        onChange={(e) => onTextChange(e.target.value)}
        onBlur={onBlur}
        className="w-14 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs tabular-nums text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
      />
      <button type="button" onClick={() => step(10)} aria-label={`${label} 10분 늘리기`} className="rounded px-1 text-slate-500 hover:bg-white hover:text-slate-900">
        +
      </button>
      <span className="text-slate-400">분</span>
      <datalist id={listId}>
        {QUICK.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </span>
  );
}
