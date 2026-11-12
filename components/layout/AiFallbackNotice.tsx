"use client";

import { Bot, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AI_PROVIDER_EVENT } from "@/lib/api";

const LABEL: Record<string, string> = { groq: "Groq", cloudflare: "Cloudflare AI" };

/**
 * Gemini가 한도·크레딧 소진으로 안 될 때 대체 AI(Groq·Cloudflare)가 답했음을 알린다.
 * 대체 AI는 여행지 지식·웹 확인이 약할 수 있어 결과를 한 번 더 보게 한다. 12초 뒤 저절로 닫힌다.
 */
export function AiFallbackNotice() {
  const [notice, setNotice] = useState<{ providers: string[]; reason: string } | null>(null);

  useEffect(() => {
    let timer = 0;
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ providers: string[]; reason: string }>).detail;
      if (!d?.providers?.length) return;
      setNotice(d);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setNotice(null), 12_000);
    };
    window.addEventListener(AI_PROVIDER_EVENT, on);
    return () => {
      window.removeEventListener(AI_PROVIDER_EVENT, on);
      window.clearTimeout(timer);
    };
  }, []);

  if (!notice) return null;
  const names = notice.providers.map((p) => LABEL[p] ?? p).join(", ");
  return (
    <div role="status" className="w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-amber-300 bg-amber-50 p-3 text-[11px] leading-4 text-amber-900 shadow-md">
      <div className="flex items-start gap-2">
        <Bot className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">대체 AI({names})가 답했습니다 — 결과를 한 번 더 확인해 주세요</p>
          {notice.reason && <p className="mt-0.5 break-words text-amber-800">{notice.reason}</p>}
          {notice.providers.includes("cloudflare") && <p className="mt-0.5 text-amber-800">Cloudflare AI는 웹 검색을 하지 않아 요금·운영 정보는 추정입니다.</p>}
        </div>
        <button type="button" onClick={() => setNotice(null)} aria-label="닫기" className="rounded p-0.5 hover:bg-amber-100">
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
