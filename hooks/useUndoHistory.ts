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
  /** 관문에 걸려 적용하지 않은 변경 (새 불가능 시간이 생기는 자동 변경) */
  blocked: { label: string; reasons: string[] } | null;
  /** 그래도 적용 / 닫기 */
  applyBlocked: () => void;
  dismissBlocked: () => void;
}

const LIMIT = 20;

/**
 * 되돌리기 하나로 — 시간 검증·코스 점검 적용·구역 묶기·식당 바꾸기·가격 낮추기처럼 일정을 통째로 바꾸는 작업을 한 기록에 쌓고,
 * 화면의 "되돌리기"나 Ctrl+Z로 가장 최근 것부터 되돌린다 (입력칸에서 글자를 고치는 중이면 Ctrl+Z는 그 칸의 되돌리기).
 */
export function useUndoHistory(days: DayPlan[], replaceDays: (days: DayPlan[]) => void, guard?: (before: DayPlan[], after: DayPlan[]) => string[]): UndoHistoryView {
  const [stack, setStack] = useState<{ label: string; days: DayPlan[] }[]>([]);
  const [blocked, setBlocked] = useState<{ label: string; reasons: string[]; before: DayPlan[]; next: DayPlan[] } | null>(null);
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

  const commit = (label: string, before: DayPlan[], next: DayPlan[]) => {
    setStack((s) => [...s.slice(-(LIMIT - 1)), { label, days: before }]);
    replaceDays(next);
  };

  return {
    last: stack[stack.length - 1]?.label ?? null,
    count: stack.length,
    undo,
    // 관문: 자동 변경이 새 불가능 시간(새벽 도착일 관광·운영 시간 밖·체크인 뒤 등)을 만들면 적용하지 않고 이유를 보여 준다
    labeled: (label) => (next) => {
      const before = latest.current;
      const reasons = guard?.(before, next) ?? [];
      if (reasons.length > 0) {
        setBlocked({ label, reasons, before, next });
        return;
      }
      setBlocked(null);
      commit(label, before, next);
    },
    blocked: blocked ? { label: blocked.label, reasons: blocked.reasons } : null,
    applyBlocked: () => {
      if (!blocked) return;
      commit(blocked.label, blocked.before, blocked.next);
      setBlocked(null);
    },
    dismissBlocked: () => setBlocked(null),
  };
}
