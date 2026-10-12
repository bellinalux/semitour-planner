"use client";

import { useContext } from "react";
import { calcDayLoad } from "@/lib/dayLoad";
import { dayHardIssues } from "@/lib/feasibility";
import { dateOfDay } from "@/lib/timezone";
import type { DayPlan, PmFreeOption } from "@/types";
import { PackageRulesContext } from "../PackageRulesPanel";

type Tone = "ok" | "tight" | "bad";

const TONE: Record<Tone, { chip: string; dot: string; label: string }> = {
  ok: { chip: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50", dot: "bg-emerald-500", label: "정상" },
  tight: { chip: "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100", dot: "bg-amber-500", label: "빠듯" },
  bad: { chip: "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100", dot: "bg-rose-500", label: "넘침·불가능" },
};

/**
 * 날짜 바로가기 — 일정표 위에 붙어 있는 DAY 1~n 단추. 날마다 상태 색(정상·빠듯·넘침/불가능 시간)을 보이고,
 * 누르면 그날 카드로 이동한다.
 */
export function DayJumpBar({ days, pmChoice, departureDate }: { days: DayPlan[]; pmChoice: Record<number, PmFreeOption["id"]>; departureDate?: string }) {
  const rules = useContext(PackageRulesContext);
  if (days.length < 2) return null;
  return (
    <nav aria-label="날짜 바로가기" className="sticky top-0 z-10 -mx-4 border-b border-slate-200 bg-white px-4 py-2">
      <ul className="flex gap-1.5 overflow-x-auto">
        {days.map((d, i) => {
          const choice = { [d.day]: pmChoice[d.day] ?? "A" };
          const load = calcDayLoad(d, choice);
          const hard = dayHardIssues(d, choice, rules?.dayEnd).length > 0;
          const tone: Tone = hard || load.level === "overloaded" ? "bad" : load.level === "tight" ? "tight" : "ok";
          const date = dateOfDay(departureDate, i);
          return (
            <li key={d.day} className="shrink-0">
              <button
                type="button"
                onClick={() => document.getElementById(`day-${d.day}`)?.scrollIntoView({ block: "start", behavior: "smooth" })}
                title={`${d.theme} — ${TONE[tone].label}`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${TONE[tone].chip}`}
              >
                <span className={`size-1.5 rounded-full ${TONE[tone].dot}`} aria-hidden />
                DAY {d.day}
                {date && <span className="font-normal text-slate-500">{`${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`}</span>}
                <span className="sr-only">{TONE[tone].label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
