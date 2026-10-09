"use client";

import { useEffect, useRef, useState } from "react";
import type { DayPlan } from "@/types";

export interface UndoHistoryView {
  /** 가장 최근 변경 이름 (없으면 null) */
  last: string | null;
  count: number;
  undo: () => void;
  /** 일정을 바꾸는 함수에 이름표를 붙여, 바꾸기 전 일정을 기록에 쌓는다 */
  labeled: (label: string) => (days: DayPlan[]) => void;
}

const LIMIT = 20;

/**
 * 되돌리기 하나로 — 시간 검증·코스 점검 적용·구역 묶기·식당 바꾸기·가격 낮추기처럼 일정을 통째로 바꾸는 작업을 한 기록에 쌓고,
 * 화면의 "되돌리기"나 Ctrl+Z로 가장 최근 것부터 되돌린다 (입력칸에서 글자를 고치는 중이면 Ctrl+Z는 그 칸의 되돌리기).
 */
export function useUndoHistory(days: DayPlan[], replaceDays: (days: DayPlan[]) => void): UndoHistoryView {
  const [stack, setStack] = useState<{ label: string; days: DayPlan[] }[]>([]);
  const latest = useRef(days);
  useEffect(() => {
    latest.current = days;
  }, [days]);

  const undo = () => {
    const top = stack[stack.length - 1];
    if (!top) return;
    setStack((s) => s.slice(0, -1));
    replaceDays(top.days);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z" || e.shiftKey) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable)) return;
      if (stack.length === 0) return;
      e.preventDefault();
      undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // undo는 매 렌더 새로 만들어지지만 stack이 바뀔 때만 다시 걸면 된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stack]);

  return {
    last: stack[stack.length - 1]?.label ?? null,
    count: stack.length,
    undo,
    labeled: (label) => (next) => {
      const before = latest.current;
      setStack((s) => [...s.slice(-(LIMIT - 1)), { label, days: before }]);
      replaceDays(next);
    },
  };
}
