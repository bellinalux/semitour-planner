"use client";

import { Loader2, Wand2 } from "lucide-react";
import { useState } from "react";
import { useRequest } from "@/hooks/useRequest";
import { toInputPatch, type RequestParseRequest, type RequestParseResult } from "@/lib/schemas/requestParse";
import type { SectionProps } from "./types";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 한 줄로 쓴 요청("다낭 3박5일 6명 11월 10일 출발 풀패키지 마진 20%")을 AI가 읽어 입력칸을 채운다 */
export function OneLineRequest({ input, onChange }: SectionProps) {
  const [text, setText] = useState("");
  const [filled, setFilled] = useState<string[] | null>(null);
  const { state, run } = useRequest<RequestParseRequest, { result: RequestParseResult }>("/api/parse-request");

  const apply = async () => {
    setFilled(null);
    const response = await run({ text: text.trim(), today: todayIso() });
    if (!response) return;
    const { patch, filled: names } = toInputPatch(response.result, input);
    if (names.length > 0) onChange(patch);
    setFilled(names);
  };

  return (
    <div className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
      <label htmlFor="oneLineRequest" className="flex items-center gap-1.5 text-xs font-semibold text-indigo-900">
        <Wand2 className="h-3.5 w-3.5" aria-hidden />
        한 줄로 입력
      </label>
      <div className="flex gap-2">
        <input
          id="oneLineRequest"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (text.trim().length >= 2 && state.status !== "loading") void apply();
            }
          }}
          placeholder="예) 다낭 3박5일 6명 11월 10일 출발 풀패키지 마진 20%"
          className="min-w-0 flex-1 rounded-md border border-indigo-200 bg-white px-2.5 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
        />
        <button
          type="button"
          onClick={() => void apply()}
          disabled={text.trim().length < 2 || state.status === "loading"}
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {state.status === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          채우기
        </button>
      </div>
      {state.status === "error" && <p className="text-[11px] text-red-600">{state.error}</p>}
      {filled && (
        <p role="status" className="text-[11px] leading-4 text-indigo-800">
          {filled.length > 0
            ? `${filled.join(", ")}을(를) 채웠습니다. 아래 칸에서 확인하세요.${filled.includes("일수") && !filled.includes("숙박") ? " 숙박 수는 항공편을 고르면 출국·귀국 시각으로 다시 맞춰집니다." : ""}`
            : "읽어낼 수 있는 값이 없었습니다. 여행지·기간·인원을 넣어 다시 써 주세요."}
        </p>
      )}
    </div>
  );
}
