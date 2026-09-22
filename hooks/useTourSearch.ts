"use client";

import { useCallback, useRef, useState } from "react";
import { postJson } from "@/lib/api";
import type { AsyncState, CurrencyCode, SearchSource, TourCandidate, TourCategory } from "@/types";

interface SearchParams {
  destination: string;
  categories: TourCategory[];
  currency: CurrencyCode;
  /** 입력하면 이 업체가 파는 투어만 찾는다 */
  operatorName?: string;
}

interface SearchResult {
  tours: TourCandidate[];
  sources: SearchSource[];
  /** 웹 검색이 실제로 실행되었는지. false면 AI 기억 기반이라 근거가 약하다 */
  searched: boolean;
}

/** "더 찾기"로 새로 온 투어가 0개였을 때(오류가 아니라 "더 없음") 화면에 보여줄 신호 */
type MoreState = AsyncState | { status: "empty" };

/** 웹 검색 기반 지역 투어 후보 조회 상태와 결과. "더 찾기"로 이어서 찾으면 기존 목록에 이어 붙는다. */
export function useTourSearch() {
  const [state, setState] = useState<AsyncState>({ status: "idle" });
  const [moreState, setMoreState] = useState<MoreState>({ status: "idle" });
  const [result, setResult] = useState<SearchResult | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const lastParamsRef = useRef<SearchParams | null>(null);

  const run = useCallback(async (params: SearchParams) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    lastParamsRef.current = params;

    setState({ status: "loading" });
    setMoreState({ status: "idle" });
    try {
      const data = await postJson<SearchResult>("/api/find-tours", params, controller.signal);
      setResult(data);
      setState({ status: "success" });
    } catch (err) {
      if (controller.signal.aborted) return;
      setResult(null);
      setState({ status: "error", error: err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다." });
    }
  }, []);

  /** 같은 조건으로, 지금까지 찾은 투어와 겹치지 않는 투어를 이어서 찾아 기존 목록에 덧붙인다 */
  const loadMore = useCallback(async () => {
    const params = lastParamsRef.current;
    if (!params) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setMoreState({ status: "loading" });
    try {
      const excludeNames = (result?.tours ?? []).map((t) => t.name);
      const data = await postJson<SearchResult>("/api/find-tours", { ...params, excludeNames }, controller.signal);
      setResult((prev) => {
        if (!prev) return data;
        const seen = new Set(prev.tours.map((t) => t.name.toLowerCase()));
        const added = data.tours.filter((t) => !seen.has(t.name.toLowerCase()));
        const seenUrls = new Set(prev.sources.map((s) => s.url));
        return {
          tours: [...prev.tours, ...added],
          sources: [...prev.sources, ...data.sources.filter((s) => !seenUrls.has(s.url))],
          searched: prev.searched && data.searched,
        };
      });
      const gotNew = data.tours.length > 0;
      setMoreState(gotNew ? { status: "success" } : { status: "empty" });
    } catch (err) {
      if (controller.signal.aborted) return;
      setMoreState({ status: "error", error: err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다." });
    }
  }, [result]);

  return { state, result, run, moreState, loadMore };
}
