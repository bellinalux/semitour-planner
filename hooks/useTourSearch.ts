"use client";

import { useCallback, useRef, useState } from "react";
import { postJson } from "@/lib/api";
import type { AsyncState, CurrencyCode, SearchSource, TourCandidate, TourCategory } from "@/types";

interface SearchParams {
  destination: string;
  categories: TourCategory[];
  currency: CurrencyCode;
}

interface SearchResult {
  tours: TourCandidate[];
  sources: SearchSource[];
  /** 웹 검색이 실제로 실행되었는지. false면 AI 기억 기반이라 근거가 약하다 */
  searched: boolean;
}

/** 웹 검색 기반 지역 투어 후보 조회 상태와 결과 */
export function useTourSearch() {
  const [state, setState] = useState<AsyncState>({ status: "idle" });
  const [result, setResult] = useState<SearchResult | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const run = useCallback(async (params: SearchParams) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setState({ status: "loading" });
    try {
      const data = await postJson<SearchResult>("/api/find-tours", params, controller.signal);
      setResult(data);
      setState({ status: "success" });
    } catch (err) {
      if (controller.signal.aborted) return;
      setState({ status: "error", error: err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다." });
    }
  }, []);

  return { state, result, run };
}
