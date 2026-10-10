"use client";

import { useEffect, useRef } from "react";
import { citiesOf } from "@/lib/knowledge";
import type { Companion, TravelType, TripScope } from "@/types";

const DAILY_KEY = "semitour-planner:preResearch:day";

async function research(city: string, o: { travelType: TravelType; tripScope: TripScope; companions: Companion[] }): Promise<void> {
  // 서버가 30일 안에 조사한 도시면 저장된 것을 바로 돌려준다 (AI 호출 없음)
  await fetch("/api/knowledge/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ city, travelType: o.travelType, tripScope: o.tripScope, companions: o.companions, force: false }),
  }).catch(() => undefined);
}

/**
 * 지식 창고 미리 조사 — 코스를 만들 때 처음 가는 도시면 웹 조사로 2분쯤 더 걸리는 것을 없앤다.
 *  ① 여행지를 적고 4초 멈추면 그 도시를 미리 조사 (없거나 30일 지났을 때만 실제로 조사)
 *  ② 하루 한 번, 최근 견적의 여행지 5곳 중 오래된 것을 다시 조사 (주기적 갱신)
 * 실패해도 아무 영향 없다 (코스를 만들 때 다시 시도).
 */
export function usePreResearch(o: { destination: string; enabled: boolean; travelType: TravelType; tripScope: TripScope; companions: Companion[]; recent: string[] }) {
  const done = useRef(new Set<string>());
  const opts = useRef(o);
  useEffect(() => {
    opts.current = o;
  });

  // ① 입력 중 미리 조사
  const city = citiesOf(o.destination)[0] ?? "";
  useEffect(() => {
    if (!o.enabled || city.length < 2 || done.current.has(city)) return;
    const t = window.setTimeout(() => {
      done.current.add(city);
      void research(city, opts.current);
    }, 4000);
    return () => window.clearTimeout(t);
  }, [city, o.enabled]);

  // ② 하루 한 번 최근 여행지 갱신
  const recentKey = o.recent.slice(0, 5).join("|");
  useEffect(() => {
    if (!o.enabled || !recentKey) return;
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (localStorage.getItem(DAILY_KEY) === today) return;
    } catch {
      return;
    }
    const t = window.setTimeout(async () => {
      try {
        localStorage.setItem(DAILY_KEY, today);
      } catch {
        /* 무시 */
      }
      const cities = [...new Set(recentKey.split("|").map((d) => citiesOf(d)[0]).filter((c): c is string => !!c))].slice(0, 5);
      for (const c of cities) {
        if (done.current.has(c)) continue;
        done.current.add(c);
        await research(c, opts.current);
      }
    }, 30_000);
    return () => window.clearTimeout(t);
  }, [recentKey, o.enabled]);
}
