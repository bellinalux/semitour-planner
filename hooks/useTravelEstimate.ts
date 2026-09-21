"use client";

import { useCallback, useRef, useState } from "react";
import { postJson } from "@/lib/api";
import type { AsyncState, CurrencyCode, TravelEstimate } from "@/types";

interface EstimateParams {
  origin: string;
  destination: string;
  currency: CurrencyCode;
  nights: number;
}

/** 항공/숙박 시세 AI 추정 요청 상태와 결과 */
export function useTravelEstimate() {
  const [state, setState] = useState<AsyncState>({ status: "idle" });
  const [estimate, setEstimate] = useState<TravelEstimate | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  /** 성공하면 추정 결과를 반환한다. 실패하거나 새 요청으로 대체되면 null. */
  const run = useCallback(async (params: EstimateParams): Promise<TravelEstimate | null> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setState({ status: "loading" });
    try {
      const { estimate: result } = await postJson<{ estimate: TravelEstimate }>("/api/estimate-travel", params, controller.signal);
      setEstimate(result);
      setState({ status: "success" });
      return result;
    } catch (err) {
      if (controller.signal.aborted) return null;
      setState({ status: "error", error: err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다." });
      return null;
    }
  }, []);

  return { state, estimate, run };
}
