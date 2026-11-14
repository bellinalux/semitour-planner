/**
 * 긴 글 빠른 붙여넣기 — 브라우저 기본 붙여넣기는 글을 한 줄씩 입력하듯 끼워 넣어
 * 1만 자쯤이면 화면이 0.5초~수 초 멈춘다(맞춤법 검사·큰 화면이면 더). 긴 글은 붙여넣기를 직접 받아 값을 한 번에 넣는다.
 *  - 글자 수 제한(maxLength)과 커서 위치(선택 영역 바꾸기)는 그대로 지킨다.
 *  - 이렇게 넣은 붙여넣기는 Ctrl+Z로 되돌려지지 않는다 (칸을 비우고 다시 붙여넣으면 된다).
 *  - 짧은 글(기본 1,000자 미만)은 브라우저에 맡긴다 (되돌리기가 되도록).
 */
import type { ClipboardEvent } from "react";

export const FAST_PASTE_MIN = 1000;

/** 붙여넣은 뒤의 값과 커서 위치 — 순수 계산 (시험용으로 따로 둔다) */
export function pastedValue(value: string, start: number, end: number, pasted: string, maxLength?: number): { value: string; caret: number } {
  const text = pasted.replace(/\r\n?/g, "\n");
  const before = value.slice(0, start);
  const after = value.slice(end);
  const room = maxLength === undefined ? text.length : Math.max(0, maxLength - before.length - after.length);
  const inserted = text.slice(0, room);
  return { value: before + inserted + after, caret: before.length + inserted.length };
}

/**
 * textarea의 onPaste에 붙인다: `onPaste={fastPaste(onChange, { maxLength })}`
 * onChange에는 붙여넣은 뒤의 전체 값이 들어간다 (onChange 쪽의 자르기·나누기는 그대로 적용된다).
 */
export function fastPaste(onChange: (value: string) => void, opts: { maxLength?: number; min?: number } = {}) {
  return (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData?.getData("text/plain") ?? "";
    if (pasted.length < (opts.min ?? FAST_PASTE_MIN)) return;
    e.preventDefault();
    const el = e.currentTarget;
    const next = pastedValue(el.value, el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length, pasted, opts.maxLength);
    onChange(next.value);
    // React가 새 값을 그린 뒤 커서를 붙여넣은 글 끝으로
    requestAnimationFrame(() => {
      try {
        el.setSelectionRange(next.caret, next.caret);
      } catch {
        // 화면에서 사라진 칸
      }
    });
  };
}
