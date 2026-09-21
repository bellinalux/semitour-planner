"use client";

import { useCallback, useRef, useState } from "react";
import { postJson } from "@/lib/api";
import type { AsyncState } from "@/types";

/** 서버 API 하나를 호출하는 요청 상태와 결과. 새 요청이 오면 이전 요청은 취소된다. */
export function useRequest<Req, Res>(url: string) {
  const [state, setState] = useState<AsyncState>({ status: "idle" });
  const [data, setData] = useState<Res | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  /** 성공하면 결과를 반환한다. 실패하거나 새 요청으로 대체되면 null. */
  const run = useCallback(
    async (params: Req): Promise<Res | null> => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      setState({ status: "loading" });
      try {
        const result = await postJson<Res>(url, params, controller.signal);
        setData(result);
        setState({ status: "success" });
        return result;
      } catch (err) {
        if (controller.signal.aborted) return null;
        setState({ status: "error", error: err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다." });
        return null;
      }
    },
    [url],
  );

  return { state, data, run };
}
