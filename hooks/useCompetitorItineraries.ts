"use client";

import { createContext, useEffect, useRef, useState } from "react";
import { fetchCompetitorItinerary } from "@/lib/competitorSearch";
import type { TripInput } from "@/types";

export interface CompetitorItinerariesView {
  /** 지금 일정을 읽는 경쟁 상품 id */
  running: string[];
  message: string | null;
  /** 일정을 아직 안 읽은 경쟁 상품 수 */
  pending: number;
  /** 일정을 아직 안 읽은 경쟁 상품의 날짜별 일정을 판매 페이지에서 읽는다 (두 개씩 동시에). 끝나면 읽은 수 */
  run: () => Promise<number>;
}

/** 경쟁 상품 일정 가져오기 — 상품 비교 보기에서 날짜별 코스를 견주려고 판매 페이지의 일정표를 읽어 경쟁 상품에 붙인다 */
export function useCompetitorItineraries(input: TripInput, update: (patch: Partial<TripInput>) => void): CompetitorItinerariesView {
  const [running, setRunning] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const latest = useRef(input);
  useEffect(() => {
    latest.current = input;
  }, [input]);
  const pending = input.competitors.filter((c) => !c.itinerary).length;

  const run = async (): Promise<number> => {
    if (running.length > 0) return 0;
    const targets = latest.current.competitors.filter((c) => !c.itinerary);
    if (targets.length === 0) return 0;
    setMessage(null);
    let found = 0;
    let failed = 0;
    const queue = targets.slice();
    const worker = async () => {
      for (let c = queue.shift(); c; c = queue.shift()) {
        const target = c;
        setRunning((r) => [...r, target.id]);
        try {
          const itinerary = await fetchCompetitorItinerary(target, latest.current);
          if (itinerary.found) found += 1;
          // 그사이 바뀐 경쟁사 목록에 이 상품 일정만 붙인다
          const next = latest.current.competitors.map((x) => (x.id === target.id ? { ...x, itinerary } : x));
          latest.current = { ...latest.current, competitors: next };
          update({ competitors: next });
        } catch {
          failed += 1;
        } finally {
          setRunning((r) => r.filter((id) => id !== target.id));
        }
      }
    };
    await Promise.all([worker(), worker()]);
    setMessage(
      `경쟁 상품 ${targets.length}개 중 ${found}개의 날짜별 일정을 읽었습니다${targets.length - found - failed > 0 ? ` (${targets.length - found - failed}개는 판매 페이지에서 일정표를 찾지 못해 주요 방문지로 비교)` : ""}${failed > 0 ? ` · ${failed}개는 오류` : ""}.`,
    );
    return found;
  };

  return { running, message, pending, run };
}

/** 상품 비교 보기와 한 번에 검증이 같은 진행 상태를 쓴다 */
export const CompetitorItinerariesContext = createContext<CompetitorItinerariesView | null>(null);
