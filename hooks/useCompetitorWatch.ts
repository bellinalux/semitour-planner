"use client";

import { useEffect, useRef } from "react";
import type { CompetitorRefreshView } from "@/hooks/useCompetitorRefresh";
import type { TripInput } from "@/types";

const KEY = "semitour-planner:competitorChecked";
/** 이만큼 지나면 다시 확인 (일) */
export const WATCH_DAYS = 7;

function lastChecked(dest: string): number {
  try {
    const map = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string>;
    const t = map[dest] ? new Date(map[dest]).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  } catch {
    return 0;
  }
}

function markChecked(dest: string) {
  try {
    const map = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string>;
    localStorage.setItem(KEY, JSON.stringify({ ...map, [dest]: new Date().toISOString() }));
  } catch {
    /* 저장 못 하면 다음에 또 확인 */
  }
}

/**
 * 경쟁 상품 가격 정기 확인 — 검색으로 넣은 경쟁 상품이 있는 견적을 열었을 때, 그 여행지를 마지막으로 확인한 지 7일이 지났으면
 * 백그라운드에서 다시 조회한다. 가격이 바뀌면 요약·추천의 '경쟁 상품 가격 변동'으로 알린다.
 * (서버가 혼자 도는 예약 작업이 아니라, 화면을 열 때 확인한다)
 */
export function useCompetitorWatch(input: TripInput, refresh: CompetitorRefreshView, enabled: boolean) {
  const dest = input.destination.trim();
  // 검색으로 넣은 상품 중 가장 최근에 찾은 때 — 일주일이 안 지났으면 다시 확인하지 않는다
  const newest = Math.max(0, ...input.competitors.map((c) => (c.source ? Date.parse(c.source.foundAt) || 0 : 0)));
  const searched = newest > 0;
  const started = useRef("");
  useEffect(() => {
    if (!enabled || !dest || !searched || refresh.running || started.current === dest) return;
    const limit = WATCH_DAYS * 86_400_000;
    if (Date.now() - newest < limit || Date.now() - lastChecked(dest) < limit) return;
    started.current = dest;
    markChecked(dest);
    refresh.run();
  }, [enabled, dest, searched, newest, refresh]);
}
