"use client";

import { useState } from "react";
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

const toText = (n: number) => (n === 0 ? "" : String(n));
const toNumber = (text: string) => {
  const n = Number(text);
  return text === "" || Number.isNaN(n) ? 0 : n;
};

/**
 * 입력 중인 문자열("0.", "1e" 등)을 보존하기 위해 로컬 텍스트 상태를 두고,
 * 외부에서 값이 바뀐 경우(초기화, 저장값 복원)에만 텍스트를 다시 맞춘다.
 */
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
  const [text, setText] = useState(toText(value));
  const [prevValue, setPrevValue] = useState(value);

  if (value !== prevValue) {
    setPrevValue(value);
    if (value !== toNumber(text)) setText(toText(value));
  }

  const commit = (raw: string) => {
    setText(raw);
    const n = toNumber(raw);
    setPrevValue(n);
    onChange(n);
  };

  const clampOnBlur = () => {
    let n = toNumber(text);
    if (n < min) n = min;
    if (max !== undefined && n > max) n = max;
    if (n !== toNumber(text)) commit(toText(n));
  };

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
          onChange={(e) => commit(e.target.value)}
          onBlur={clampOnBlur}
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
