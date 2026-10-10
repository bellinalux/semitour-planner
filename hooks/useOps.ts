"use client";

import { useState } from "react";
import { emptyOps, loadOps, saveOps, type OpsData } from "@/lib/opsStore";

/** 상품(일정 이름)별 출발 준비·명단·정산 — 이름이 바뀌면 그 상품 것을 불러온다 */
export function useOps(planKey: string): { data: OpsData; change: (next: OpsData) => void } {
  const [state, setState] = useState<{ key: string; data: OpsData }>(() => ({ key: planKey, data: typeof window === "undefined" ? emptyOps() : loadOps(planKey) }));
  if (state.key !== planKey) setState({ key: planKey, data: loadOps(planKey) });
  const change = (next: OpsData) => {
    setState({ key: planKey, data: next });
    saveOps(planKey, next);
  };
  return { data: state.key === planKey ? state.data : loadOps(planKey), change };
}
