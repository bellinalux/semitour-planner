"use client";

import { Gauge } from "lucide-react";
import { useContext } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import { CourseEngineContext } from "@/hooks/useCourseEngine";
import type { PmChoice } from "@/lib/itinerary";
import { itineraryQuality } from "@/lib/itineraryQuality";
import type { DayPlan, TripInput } from "@/types";

/** 점수 색 — 상태(좋음·주의·나쁨)라서 글자와 함께 쓴다 */
const tone = (ratio: number) => (ratio >= 0.85 ? "bg-emerald-600" : ratio >= 0.6 ? "bg-amber-500" : "bg-rose-500");
const word = (ratio: number) => (ratio >= 0.85 ? "좋음" : ratio >= 0.6 ? "보통" : "부족");

/**
 * 일정표 품질 점수 — 근거·동선·일정 강도·고객 니즈·원가 확인·시간 확인을 100점으로 합치고, 무엇을 하면 오르는지 바로 간다.
 */
export function QualityScoreCard({ input, days, pmChoice }: { input: TripInput; days: DayPlan[]; pmChoice: PmChoice }) {
  const engine = useContext(CourseEngineContext);
  const scores = engine ? Object.values(engine.scores).map((s) => s.score) : [];
  const q = itineraryQuality(input, days, pmChoice, scores);
  const go = (anchor?: string) => {
    if (!anchor) return;
    document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <SectionCard title={`일정표 품질 ${q.total}점`} description="근거·동선·일정 강도·고객 니즈·원가 확인·시간 확인 (100점)" icon={Gauge} collapsible defaultOpen={false} summary={`${q.total}점 · ${word(q.total / 100)}`} anchorId="quality">
      <ul aria-label="품질 점수" className="space-y-2 text-xs">
        {q.parts.map((p) => {
          const ratio = p.score / p.max;
          return (
            <li key={p.key} className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="w-16 shrink-0 font-medium text-slate-700">{p.label}</span>
                <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                  <span className={`absolute inset-y-0 left-0 rounded-full ${tone(ratio)}`} style={{ width: `${Math.max(2, ratio * 100)}%` }} />
                </span>
                <span className="w-20 shrink-0 text-right tabular-nums text-slate-700">
                  {Math.round(p.score)}/{p.max} · {word(ratio)}
                </span>
              </div>
              <p className="pl-[4.5rem] text-pretty text-[11px] text-slate-500">
                {p.note}
                {p.fix && (
                  <>
                    {" — "}
                    <button type="button" onClick={() => go(p.anchor)} className="text-indigo-700 underline underline-offset-2 hover:text-indigo-900">
                      {p.fix}
                    </button>
                  </>
                )}
              </p>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
