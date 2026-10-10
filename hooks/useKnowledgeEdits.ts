"use client";

import { useEffect, useRef } from "react";
import { postJson } from "@/lib/api";

/**
 * 직원 수정을 지식 창고에 배운다 — AI가 넣은 곳을 지우면 "뺀 곳", 투어 검색·카탈로그에서 직접 넣으면 "넣은 곳".
 * 5초 모아서 한 번에 보낸다 (실패해도 일정 편집에는 영향 없음).
 */
export function useKnowledgeEdits(city: string) {
  const pending = useRef<{ removed: string[]; added: string[] }>({ removed: [], added: [] });
  const timer = useRef<number | null>(null);
  const cityRef = useRef(city);
  useEffect(() => {
    cityRef.current = city;
  }, [city]);

  const flush = () => {
    timer.current = null;
    const { removed, added } = pending.current;
    pending.current = { removed: [], added: [] };
    if (!cityRef.current || removed.length + added.length === 0) return;
    void postJson("/api/knowledge/learn", { kind: "edits", city: cityRef.current, removed: removed.slice(0, 20), added: added.slice(0, 20) }).catch(() => undefined);
  };
  const queue = (kind: "removed" | "added", name: string) => {
    const n = name.trim().slice(0, 80);
    if (!n) return;
    pending.current[kind].push(n);
    if (timer.current === null) timer.current = window.setTimeout(flush, 5000);
  };
  useEffect(() => () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      flush();
    }
    // 화면을 떠날 때 남은 것을 보낸다
  }, []);
  return { removed: (name: string) => queue("removed", name), added: (name: string) => queue("added", name) };
}
