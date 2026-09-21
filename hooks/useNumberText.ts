"use client";

import { useState } from "react";

const toText = (n: number) => (n === 0 ? "" : String(n));
const toNumber = (text: string) => {
  const n = Number(text);
  return text === "" || Number.isNaN(n) ? 0 : n;
};

interface Options {
  min?: number;
  max?: number;
}

/**
 * 숫자 입력의 문자열 상태를 관리한다.
 * 입력 중인 "0." 같은 중간 값을 보존하기 위해 로컬 텍스트를 두고,
 * 외부에서 값이 바뀐 경우(초기화, 저장값 복원)에만 텍스트를 다시 맞춘다.
 */
export function useNumberText(value: number, onChange: (value: number) => void, { min = 0, max }: Options = {}) {
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

  return { text, onTextChange: commit, onBlur: clampOnBlur };
}
