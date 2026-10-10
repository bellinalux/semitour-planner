"use client";

import { useEffect, useState } from "react";
import { postJson } from "@/lib/api";
import type { SeasonRequest, SeasonResponse } from "@/lib/schemas/season";

/**
 * 출발 시기 확인 — 여행지·출발일·일수가 정해지고 일정이 있으면 자동으로 한 번 확인한다(서버가 14일 동안 같은 결과를 다시 쓴다).
 * 출발일을 바꾸면 다시 확인한다.
 */
export function useSeasonCheck(req: SeasonRequest | null): { result: SeasonResponse | null; running: boolean } {
  const key = req ? `${req.destination}|${req.departureDate}|${req.days}` : "";
  const [state, setState] = useState<{ key: string; result: SeasonResponse | null; running: boolean }>({ key: "", result: null, running: false });

  useEffect(() => {
    if (!req || !key) return;
    const controller = new AbortController();
    // 입력 중에 여러 번 부르지 않도록 잠깐 기다린다
    const timer = window.setTimeout(() => {
      setState({ key, result: null, running: true });
      postJson<SeasonResponse>("/api/season-check", req, controller.signal)
        .then((result) => setState({ key, result, running: false }))
        .catch(() => {
          if (!controller.signal.aborted) setState({ key, result: null, running: false });
        });
    }, 1500);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 요청 내용(key)이 바뀔 때만
  }, [key]);

  const current = state.key === key;
  return { result: current ? state.result : null, running: current && state.running };
}
