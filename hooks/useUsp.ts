"use client";

import { useCallback, useRef, useState } from "react";
import { postJson } from "@/lib/api";
import type { UspRequest } from "@/lib/schemas/usp";
import type { AsyncState, UspItem } from "@/types";

/** 세일즈 포인트(USP) 생성 요청 상태와 결과를 관리한다. */
export function useUsp() {
  const [state, setState] = useState<AsyncState>({ status: "idle" });
  const [usps, setUsps] = useState<UspItem[]>([]);
  /** 결과를 만들 때 쓴 요청의 지문. 이후 입력/일정/견적이 바뀌었는지 비교하는 데 쓴다. */
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const generate = useCallback(async (request: UspRequest) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setState({ status: "loading" });
    try {
      const { usps: result } = await postJson<{ usps: UspItem[] }>("/api/generate-usp", request, controller.signal);
      setUsps(result);
      setGeneratedKey(JSON.stringify(request));
      setState({ status: "success" });
    } catch (err) {
      if (controller.signal.aborted) return;
      setState({
        status: "error",
        error: err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.",
      });
    }
  }, []);

  /** 진행 중인 요청을 취소하고 결과를 비운다 (새 일정을 생성하기 직전에 호출) */
  const reset = useCallback(() => {
    controllerRef.current?.abort();
    setState({ status: "idle" });
    setUsps([]);
    setGeneratedKey(null);
  }, []);

  /** 저장된 세일즈 포인트를 그대로 되살린다 */
  const restore = useCallback((saved: UspItem[], key: string | null) => {
    controllerRef.current?.abort();
    setUsps(saved);
    setGeneratedKey(saved.length > 0 ? key : null);
    setState(saved.length > 0 ? { status: "success" } : { status: "idle" });
  }, []);

  return { state, usps, generatedKey, generate, reset, restore };
}
