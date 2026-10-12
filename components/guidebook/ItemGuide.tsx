"use client";

import { Loader2, Mic } from "lucide-react";
import { useContext, useState } from "react";
import { explainMinutes, findScript, stayBreakdown } from "@/lib/guideBook";
import { GuideScriptsContext } from "./GuideScriptsContext";
import { ScriptView } from "./ScriptView";

/**
 * 일정 항목의 가이드 원고 — "해설 n분" 단추를 누르면 원고(짧게·기본·자세히)와 체류 구성(대기·설명·관람·집결)을 펼치고,
 * 체류 시간을 그 구성에 맞출 수 있다. 원고가 없으면 (자세히 보기에서) AI 초안을 만든다.
 * 항목 줄의 flex-wrap 안에 놓는다 (펼친 원고는 줄 전체 너비).
 */
export function ItemGuide({ itemName, city, stayMinutes, onStay, allowCreate }: { itemName: string; city?: string; stayMinutes: number; onStay: (minutes: number) => void; allowCreate: boolean }) {
  const guide = useContext(GuideScriptsContext);
  const [open, setOpen] = useState(false);
  if (!guide) return null;
  const script = findScript(guide.scripts, itemName);

  if (!script) {
    if (!allowCreate || !city) return null;
    const busy = guide.drafting === itemName;
    return (
      <button
        type="button"
        disabled={guide.drafting !== ""}
        onClick={() => void guide.draft(city, itemName)}
        title="AI가 웹에서 역사·볼거리·현장 진행·주의 사항을 찾아 가이드 설명 원고 초안을 만듭니다 (가이드 해설집에 저장)"
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:border-indigo-400 hover:text-indigo-700 disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Mic className="size-3" aria-hidden />}
        {busy ? "원고 만드는 중…" : "해설 원고 만들기"}
      </button>
    );
  }

  const b = stayBreakdown(script, guide.travelers);
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="가이드 설명 원고 보기 (가이드 해설집)"
        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ${script.status === "reviewed" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-violet-50 text-violet-800 ring-violet-200"}`}
      >
        <Mic className="size-3" aria-hidden />
        해설 {explainMinutes(script)}분{script.status === "reviewed" ? "" : " · 초안"}
      </button>
      {open && (
        <div role="region" aria-label={`${itemName} 가이드 원고`} className="mt-1 w-full basis-full rounded-md border border-violet-200 bg-white p-3">
          {b.total !== stayMinutes && (
            <p className="mb-2 flex flex-wrap items-center gap-2 rounded bg-violet-50 px-2 py-1 text-[11px] text-violet-900">
              원고 기준 체류 {b.total}분 (지금 {stayMinutes}분)
              <button type="button" onClick={() => onStay(b.total)} className="rounded border border-violet-300 bg-white px-2 py-0.5 font-semibold hover:bg-violet-100">
                체류를 {b.total}분으로 맞추기
              </button>
            </p>
          )}
          <ScriptView script={script} travelers={guide.travelers} compact />
        </div>
      )}
    </>
  );
}
