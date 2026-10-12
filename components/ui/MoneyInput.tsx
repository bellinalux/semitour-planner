"use client";

import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { useNumberText } from "@/hooks/useNumberText";

interface Props {
  label: string;
  icon: LucideIcon;
  symbol: string;
  value: number;
  onChange: (value: number) => void;
}

/** 쉼표 붙인 금액 (입력 중이 아닐 때 보이는 값) */
function withCommas(text: string): string {
  if (text === "") return "";
  const [int, dec] = text.split(".");
  const n = Number(int);
  if (Number.isNaN(n)) return text;
  return dec !== undefined ? `${n.toLocaleString("ko-KR")}.${dec}` : n.toLocaleString("ko-KR");
}

/** 타임라인 안에서 쓰는 작은 금액 입력 (라벨 + 통화 기호 + 숫자). 입력하지 않을 때는 천 단위 쉼표로 보인다 */
export function MoneyInput({ label, icon: Icon, symbol, value, onChange }: Props) {
  const { text, onTextChange, onBlur } = useNumberText(value, onChange);
  const [focused, setFocused] = useState(false);

  return (
    <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 py-0.5 pl-2 pr-1 text-[11px] font-medium text-slate-600">
      <Icon className="h-3 w-3" aria-hidden />
      {label}
      <span className="text-slate-400">{symbol}</span>
      <input
        type="text"
        inputMode="decimal"
        value={focused ? text : withCommas(text)}
        placeholder="0"
        aria-label={label}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          const raw = e.target.value.replace(/[,\s]/g, "");
          if (raw === "" || /^\d*\.?\d*$/.test(raw)) onTextChange(raw);
        }}
        onBlur={() => {
          setFocused(false);
          onBlur();
        }}
        className="w-20 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs tabular-nums text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
      />
    </label>
  );
}
