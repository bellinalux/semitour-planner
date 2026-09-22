"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { CurrencyCode } from "@/types";

interface Props {
  currency: CurrencyCode;
  onRate: (krwPerUnit: number) => void;
}

/** 오늘의 원화 환율(1 외화 = ? 원)을 가져와 환율 칸에 채운다. 실패하면 직접 입력하면 된다. */
export function FxRateButton({ currency, onRate }: Props) {
  const [state, setState] = useState<{ status: "idle" | "loading" | "done" | "error"; text: string }>({ status: "idle", text: "" });

  const fetchRate = async () => {
    setState({ status: "loading", text: "" });
    try {
      const res = await fetch(`/api/fx?code=${currency}`);
      const data = (await res.json().catch(() => null)) as { krwPerUnit?: number; updatedAt?: string; error?: { message?: string } } | null;
      if (!res.ok || !data?.krwPerUnit) {
        setState({ status: "error", text: data?.error?.message ?? "환율을 가져오지 못했습니다. 직접 입력해 주세요." });
        return;
      }
      const rate = Math.round(data.krwPerUnit * 100) / 100;
      onRate(rate);
      setState({ status: "done", text: `1 ${currency} = ₩${rate.toLocaleString("ko-KR")}${data.updatedAt ? ` (${data.updatedAt} 기준)` : ""}` });
    } catch {
      setState({ status: "error", text: "환율 서버에 연결하지 못했습니다. 직접 입력해 주세요." });
    }
  };

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => void fetchRate()}
        disabled={state.status === "loading"}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {state.status === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
        오늘 환율 가져오기
      </button>
      {state.text && (
        <p role={state.status === "error" ? "alert" : "status"} className={`text-[11px] leading-4 ${state.status === "error" ? "text-red-600" : "text-slate-500"}`}>
          {state.text}
          {state.status === "done" && (
            <>
              {" · "}
              <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer" className="underline">
                Rates By Exchange Rate API
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
}
