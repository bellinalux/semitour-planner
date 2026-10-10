"use client";

import { BatteryMedium } from "lucide-react";
import { useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import { PACES } from "@/lib/defaults";
import type { PmChoice } from "@/lib/itinerary";
import { heavyReasons, paceIssues, REST_LABEL } from "@/lib/pace";
import { needsCheck } from "@/lib/needsCheck";
import type { DayPlan, TripInput, TripPace } from "@/types";

interface Props {
  days: DayPlan[];
  pmChoice: PmChoice;
  pace: TripPace;
  needs: Pick<TripInput, "mustHave" | "avoid" | "companions">;
  /** 고친 일정 적용 (되돌리기 기록에 쌓인다) */
  onApply: (days: DayPlan[]) => void;
}

/**
 * 일정 강도 · 쉬는 날 — 힘든 날(긴 하루·장거리·이른 출발·늦게 끝남)을 표시하고,
 * 다음 날을 늦은 출발·오후 자유로, 긴 여행에는 전일 자유를 넣는 제안을 적용한다 (업계 관행).
 */
export function PacePanel({ days, pmChoice, pace, needs, onApply }: Props) {
  const [message, setMessage] = useState("");
  const issues = paceIssues(days, pmChoice, pace);
  const need = needsCheck(needs, days, pmChoice);
  const needWarn = need.filter((n) => n.tone !== "ok").length;
  const heavy = days.map((d) => ({ day: d.day, reasons: heavyReasons(d, pmChoice), rest: d.rest }));
  return (
    <SectionCard
      title="일정 강도 · 고객 니즈"
      description="힘든 날 다음은 가볍게 (늦은 출발·오후 자유·전일 자유), 꼭 넣을 것·피할 것·동반자에 맞는지"
      icon={BatteryMedium}
      collapsible
      defaultOpen={issues.length > 0 || needWarn > 0}
      summary={`${PACES.find((p) => p.id === pace)?.label ?? "보통"}${issues.length + needWarn > 0 ? ` · 점검 ${issues.length + needWarn}건` : " · 문제 없음"}`}
      anchorId="pace"
    >
      <div className="space-y-3 text-xs">
        <ol aria-label="날짜별 강도" className="flex flex-wrap gap-1.5">
          {heavy.map((h) => (
            <li
              key={h.day}
              className={`rounded-md px-2 py-1 ring-1 ${h.rest ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : h.reasons.length > 0 ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-white text-slate-600 ring-slate-200"}`}
            >
              <b>DAY {h.day}</b> {h.rest ? REST_LABEL[h.rest] : h.reasons.length > 0 ? `힘든 날 · ${h.reasons.join(" · ")}` : "보통"}
            </li>
          ))}
        </ol>
        {issues.length === 0 ? (
          <p className="text-slate-500">힘든 날 다음 날도 무리가 없습니다.</p>
        ) : (
          <ul aria-label="강도 점검" className="space-y-2">
            {issues.map((iss) => (
              <li key={`${iss.day}-${iss.text}`} className="space-y-1.5 rounded-md border border-amber-200 bg-amber-50/50 p-2.5">
                <p className="text-pretty text-amber-900">{iss.text}</p>
                <div className="flex flex-wrap gap-1.5">
                  {iss.fixes.map((f) => (
                    <button
                      key={`${f.kind}-${f.day}`}
                      type="button"
                      disabled={!f.days}
                      title={f.blocked}
                      onClick={() => {
                        if (!f.days) return;
                        onApply(f.days);
                        setMessage(`${f.label}을(를) 적용했습니다. 되돌리기는 화면 위 [되돌리기] 또는 Ctrl+Z.`);
                      }}
                      className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                {iss.fixes.filter((f) => f.blocked).map((f) => (
                  <p key={`b-${f.kind}`} className="text-[11px] text-slate-500">
                    {f.label}: {f.blocked}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        )}
        {need.length > 0 && (
          <section aria-label="고객 니즈 점검" className="space-y-1 rounded-md border border-slate-200 p-2.5">
            <p className="font-semibold text-slate-800">고객 니즈 점검</p>
            <ul className="space-y-0.5">
              {need.map((n) => (
                <li key={n.text} className={n.tone === "warn" ? "text-amber-800" : n.tone === "info" ? "text-slate-600" : "text-emerald-700"}>
                  {n.tone === "ok" ? "✓" : n.tone === "warn" ? "!" : "·"} {n.text}
                </li>
              ))}
            </ul>
          </section>
        )}
        {message && (
          <p role="status" className="text-emerald-700">
            {message}
          </p>
        )}
        <p className="text-[11px] text-slate-400">힘든 날 = 관광 9시간 이상 · 한 번에 2시간 넘는 이동 · 07:30 전 출발 · 21:00 넘어 끝남. 쉬게 한 날은 빈 시간 채우기·날짜 옮기기가 다시 채우지 않습니다.</p>
      </div>
    </SectionCard>
  );
}
