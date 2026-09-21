"use client";

import { useNumberText } from "@/hooks/useNumberText";

interface Props {
  label: string;
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
}

/** 표 안에서 쓰는 작은 숫자 입력 (라벨이 위에, 통화 기호나 단위가 입력창 안에 붙는다) */
export function CompactNumber({ label, value, onChange, prefix, suffix, min = 0, max }: Props) {
  const { text, onTextChange, onBlur } = useNumberText(value, onChange, { min, max });

  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-slate-500">{label}</span>
      <span className="relative block">
        {prefix && (
          <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-[11px] text-slate-400">{prefix}</span>
        )}
        <input
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step="any"
          value={text}
          placeholder="0"
          aria-label={label}
          onChange={(e) => onTextChange(e.target.value)}
          onBlur={onBlur}
          className={`block w-full rounded-md border border-slate-300 bg-white py-1.5 text-right text-xs tabular-nums text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 ${
            prefix ? "pl-6" : "pl-2"
          } ${suffix ? "pr-6" : "pr-2"}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[11px] text-slate-400">{suffix}</span>
        )}
      </span>
    </label>
  );
}
