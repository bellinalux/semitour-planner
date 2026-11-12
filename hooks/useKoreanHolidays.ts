"use client";

import { useEffect, useState } from "react";

/**
 * 한국 공휴일 ("YYYY-MM-DD" 집합) — 취소 규정의 영업일 계산용. 서버(/api/holidays, 30일 보관)에서 해마다 한 번 받는다.
 * 받은 해는 이 화면에서 기억해 인쇄 문서도 같은 값을 쓴다(cachedHolidays).
 */
const cache = new Map<number, string[]>();
const pending = new Map<number, Promise<void>>();

export function cachedHolidays(): Set<string> {
  return new Set([...cache.values()].flat());
}

function load(year: number): Promise<void> {
  if (cache.has(year)) return Promise.resolve();
  const p =
    pending.get(year) ??
    fetch(`/api/holidays?country=${encodeURIComponent("한국")}&year=${year}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ holidays: { date: string }[] }>) : { holidays: [] }))
      .then((d) => {
        cache.set(year, (d.holidays ?? []).map((h) => h.date));
      })
      .catch(() => undefined)
      .finally(() => pending.delete(year));
  pending.set(year, p);
  return p;
}

/** 출발일 해와 그 전해(취소 구간은 출발 몇 달 전) 공휴일 */
export function useKoreanHolidays(departureDate: string): Set<string> {
  const year = /^\d{4}/.test(departureDate) ? Number(departureDate.slice(0, 4)) : new Date().getFullYear();
  const [, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    void Promise.all([load(year - 1), load(year)]).then(() => alive && setVersion((v) => v + 1));
    return () => {
      alive = false;
    };
  }, [year]);
  return cachedHolidays();
}
