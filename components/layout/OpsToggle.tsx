"use client";

import { Briefcase } from "lucide-react";
import { useShowOps } from "@/hooks/useShowOps";

/** 더보기의 [운영 기능 보기] — 예약 관리·출발 준비·출발 전 안내문을 보이거나 숨긴다 */
export function OpsToggle() {
  const [on, set] = useShowOps();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => set(!on)}
      title="예약 관리, 출발 준비·수배·명단·정산·가이드 링크, 출발 전 안내문 (출발 뒤 운영 기능)"
      className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    >
      <Briefcase className="h-4 w-4" aria-hidden />
      <span>운영 기능 {on ? "숨기기" : "보기"}</span>
    </button>
  );
}
