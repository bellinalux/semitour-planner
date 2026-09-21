"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { DEFAULT_INPUT } from "@/lib/defaults";
import type { TripInput } from "@/types";

const STORAGE_KEY = "semitour-planner:input:v1";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeRaw(value: string | null) {
  try {
    if (value === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // 저장소를 쓸 수 없는 환경(시크릿 모드 등)에서는 메모리 상태 없이 동작만 유지
  }
  listeners.forEach((l) => l());
}

function parse(raw: string | null): TripInput {
  if (!raw) return DEFAULT_INPUT;
  try {
    const saved = JSON.parse(raw) as Partial<TripInput>;
    const merged = { ...DEFAULT_INPUT, ...saved };
    // 박수가 없던 이전 저장값은 "일수 − 1"로 채운다
    if (saved.nights === undefined) merged.nights = Math.max(0, merged.days - 1);
    return merged;
  } catch {
    return DEFAULT_INPUT;
  }
}

/**
 * 입력 폼 상태. localStorage에 자동 저장되며, 서버 렌더에서는 기본값을 사용해
 * 하이드레이션 불일치 없이 저장된 값으로 교체된다.
 */
export function usePlannerInput() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const input = useMemo(() => parse(raw), [raw]);

  const update = useCallback((patch: Partial<TripInput>) => {
    writeRaw(JSON.stringify({ ...parse(readRaw()), ...patch }));
  }, []);

  const reset = useCallback(() => writeRaw(null), []);

  return { input, update, reset };
}
