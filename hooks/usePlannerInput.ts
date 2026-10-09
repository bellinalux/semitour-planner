"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { DEFAULT_INPUT } from "@/lib/defaults";
import { normalizeInput } from "@/lib/inputStorage";
import { loadPricingDefaults } from "@/lib/pricingDefaults";
import type { TripInput } from "@/types";
import { repickSupplierPrice } from "@/lib/supplierQuote";

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
    return normalizeInput(JSON.parse(raw));
  } catch {
    return DEFAULT_INPUT;
  }
}

/** 저장해 둔 회사 기본값을 얹은 새 입력 (없으면 null) */
function freshInputRaw(): string | null {
  const defaults = loadPricingDefaults();
  return defaults ? JSON.stringify(normalizeInput({ ...DEFAULT_INPUT, ...defaults })) : null;
}

/**
 * 입력 폼 상태. localStorage에 자동 저장되며, 서버 렌더에서는 기본값을 사용해
 * 하이드레이션 불일치 없이 저장된 값으로 교체된다.
 */
export function usePlannerInput() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const input = useMemo(() => parse(raw), [raw]);

  const update = useCallback((patch: Partial<TripInput>) => {
    const merged = { ...parse(readRaw()), ...patch };
    // 업체 요일별 요금표가 있으면 출발일·박수·인원이 바뀔 때 공급가를 다시 고른다 (사람이 고친 공급가는 그대로)
    const repick = "departureDate" in patch || "nights" in patch || "travelers" in patch ? repickSupplierPrice(merged) : null;
    writeRaw(JSON.stringify(repick ? { ...merged, ...repick } : merged));
  }, []);

  // 처음 쓰는 브라우저(저장된 입력 없음)에도 회사 기본값을 넣는다. 하이드레이션 뒤에 적용해 서버 렌더와 어긋나지 않게 한다.
  useEffect(() => {
    if (readRaw() === null) {
      const fresh = freshInputRaw();
      if (fresh) writeRaw(fresh);
    }
  }, []);

  /** 초기화하면 회사 기본값을 얹은 새 입력으로 시작한다 */
  const reset = useCallback(() => writeRaw(freshInputRaw()), []);

  /** 저장된 일정을 불러올 때처럼 입력 전체를 교체한다 */
  const replace = useCallback((next: TripInput) => writeRaw(JSON.stringify(next)), []);

  return { input, update, reset, replace };
}
