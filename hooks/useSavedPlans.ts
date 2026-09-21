"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { MAX_PLANS, parsePlan, type SavedPlan } from "@/lib/workspace";

const STORAGE_KEY = "semitour-planner:plans:v1";

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

function parseList(raw: string | null): SavedPlan[] {
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.map(parsePlan).filter((p): p is SavedPlan => p !== null);
  } catch {
    return [];
  }
}

export type SaveResult = { ok: true; plan: SavedPlan } | { ok: false; error: string };

function writeList(plans: SavedPlan[]): string | null {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  } catch {
    return "브라우저 저장 공간이 부족하거나 사용할 수 없습니다. 저장된 일정을 파일로 내려받은 뒤 일부를 삭제해 보세요.";
  }
  listeners.forEach((l) => l());
  return null;
}

/** 이름을 붙여 저장한 일정 목록 (이 브라우저의 localStorage). 최신 저장 순으로 정렬한다. */
export function useSavedPlans() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const plans = useMemo(() => parseList(raw).sort((a, b) => b.savedAt.localeCompare(a.savedAt)), [raw]);

  /** 같은 id가 있으면 덮어쓰고, 없으면 새로 추가한다. */
  const save = useCallback((plan: Omit<SavedPlan, "savedAt">): SaveResult => {
    const current = parseList(readRaw());
    const exists = current.some((p) => p.id === plan.id);
    if (!exists && current.length >= MAX_PLANS) {
      return { ok: false, error: `저장은 최대 ${MAX_PLANS}개까지 가능합니다. 안 쓰는 일정을 삭제해 주세요.` };
    }
    const saved: SavedPlan = { ...plan, savedAt: new Date().toISOString() };
    const error = writeList([saved, ...current.filter((p) => p.id !== plan.id)]);
    return error ? { ok: false, error } : { ok: true, plan: saved };
  }, []);

  const remove = useCallback((id: string) => {
    writeList(parseList(readRaw()).filter((p) => p.id !== id));
  }, []);

  return { plans, save, remove };
}
