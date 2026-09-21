"use client";

import { useNumberText } from "@/hooks/useNumberText";
import { Field, inputClass } from "./Field";

interface Props {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  hint?: string;
  min?: number;
  max?: number;
  step?: number | "any";
  placeholder?: string;
}

export function NumberField({
  id,
  label,
  value,
  onChange,
  prefix,
  suffix,
  hint,
  min = 0,
  max,
  step = "any",
  placeholder = "0",
}: Props) {
  const { text, onTextChange, onBlur } = useNumberText(value, onChange, { min, max });

  return (
    <Field htmlFor={id} label={label} hint={hint}>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs text-slate-400">
            {prefix}
          </span>
        )}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={text}
          placeholder={placeholder}
          onChange={(e) => onTextChange(e.target.value)}
          onBlur={onBlur}
          className={`${inputClass} tabular-nums ${prefix ? "pl-9" : ""} ${suffix ? "pr-9" : ""}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">
            {suffix}
          </span>
        )}
      </div>
    </Field>
  );
}
