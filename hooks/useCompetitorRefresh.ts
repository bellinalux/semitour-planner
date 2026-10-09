"use client";

import { useState } from "react";
import { postJson } from "@/lib/api";
import { refreshCompetitors } from "@/lib/competitors";
import type { CompetitorCandidate, TripInput } from "@/types";

export interface CompetitorRefreshView {
  running: boolean;
  /** 결과 한 줄 (성공·실패) */
  message: string | null;
  failed: boolean;
  run: () => void;
}

/** 투어 비교표의 "경쟁 상품 다시 조회" — 검색으로 넣었던 경쟁 상품의 방문지·호텔 등급·가격을 새로 고친다 */
export function useCompetitorRefresh(input: TripInput, update: (patch: Partial<TripInput>) => void): CompetitorRefreshView {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const run = async () => {
    if (running) return;
    setRunning(true);
    setMessage(null);
    setFailed(false);
    try {
      const r = await postJson<{ products: CompetitorCandidate[]; searchedAt: string }>("/api/find-competitors", {
        destination: input.destination.trim(),
        nights: input.nights,
        days: input.days,
        currency: input.currency,
        packageType: input.packageType,
        originCity: input.originCity.trim(),
      });
      const result = refreshCompetitors(input.competitors, r.products, r.searchedAt);
      if (result.updated.length > 0) update({ competitors: result.competitors });
      setMessage(
        result.updated.length === 0
          ? "같은 상품을 다시 찾지 못했습니다. 설정의 경쟁 상품 찾기에서 새로 넣어 주세요."
          : `${result.updated.length}개를 새로 고쳤습니다${result.missing.length > 0 ? ` (못 찾은 상품: ${result.missing.join(", ")})` : ""}`,
      );
      setFailed(result.updated.length === 0);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "다시 조회하지 못했습니다");
      setFailed(true);
    } finally {
      setRunning(false);
    }
  };

  return { running, message, failed, run: () => void run() };
}
