"use client";

import type { LucideIcon } from "lucide-react";
import { useNumberText } from "@/hooks/useNumberText";

interface Props {
  label: string;
  icon: LucideIcon;
  symbol: string;
  value: number;
  onChange: (value: number) => void;
}

/** 타임라인 안에서 쓰는 작은 금액 입력 (라벨 + 통화 기호 + 숫자) */
export function MoneyInput({ label, icon: Icon, symbol, value, onChange }: Props) {
  const { text, onTextChange, onBlur } = useNumberText(value, onChange);

  return (
    <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 py-0.5 pl-2 pr-1 text-[11px] font-medium text-slate-600">
      <Icon className="h-3 w-3" aria-hidden />
      {label}
      <span className="text-slate-400">{symbol}</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={text}
        placeholder="0"
        aria-label={label}
        onChange={(e) => onTextChange(e.target.value)}
        onBlur={onBlur}
        className="w-20 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs tabular-nums text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
      />
    </label>
  );
}
