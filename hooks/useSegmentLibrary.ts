"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { MAX_SEGMENTS, parseSegment, type CourseSegment } from "@/lib/segmentLibrary";
import { notifyTeamChange, SEGMENT_TOMB_KEY, SEGMENTS_SYNC_EVENT } from "@/lib/teamSync";

const STORAGE_KEY = "semitour-planner:segments:v1";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  // 팀 동기화가 서버 값을 브라우저에 쓴 경우
  window.addEventListener(SEGMENTS_SYNC_EVENT, listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
    window.removeEventListener(SEGMENTS_SYNC_EVENT, listener);
  };
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function parseList(raw: string | null): CourseSegment[] {
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.map(parseSegment).filter((s): s is CourseSegment => s !== null);
  } catch {
    return [];
  }
}

function writeList(segments: CourseSegment[]): string | null {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(segments));
  } catch {
    return "브라우저 저장 공간이 부족하거나 사용할 수 없습니다. 안 쓰는 라이브러리 항목을 지워 보세요.";
  }
  listeners.forEach((l) => l());
  // 팀 공용으로 서버에 올린다 (서버를 못 쓰면 이 브라우저에만)
  notifyTeamChange("segments");
  return null;
}

/** 지운 조각을 기록 — 다른 직원 브라우저에서도 지워지게 */
function markDeleted(id: string) {
  try {
    const cur = JSON.parse(localStorage.getItem(SEGMENT_TOMB_KEY) ?? "{}") as Record<string, string>;
    localStorage.setItem(SEGMENT_TOMB_KEY, JSON.stringify({ ...cur, [id]: new Date().toISOString() }));
  } catch {
    /* 무시 */
  }
}

/** 즐겨찾기로 저장한 코스 조각(오전/오후/하루/장소) 목록. 브라우저에 저장하고, 서버를 쓸 수 있으면 팀이 함께 쓴다(useTeamSync). */
export function useSegmentLibrary() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const segments = useMemo(() => parseList(raw).sort((a, b) => b.savedAt.localeCompare(a.savedAt)), [raw]);

  const save = useCallback((segment: Omit<CourseSegment, "savedAt">): string | null => {
    const current = parseList(readRaw());
    if (current.length >= MAX_SEGMENTS) return `라이브러리는 최대 ${MAX_SEGMENTS}개까지 저장할 수 있습니다. 안 쓰는 항목을 지워 주세요.`;
    const saved: CourseSegment = { ...segment, savedAt: new Date().toISOString() };
    return writeList([saved, ...current]);
  }, []);

  const remove = useCallback((id: string) => {
    markDeleted(id);
    writeList(parseList(readRaw()).filter((s) => s.id !== id));
  }, []);

  return { segments, save, remove };
}
