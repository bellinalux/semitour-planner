"use client";

/**
 * 🧭 코스 엔진 점검 — 날마다 장소 정보(영업시간·마지막 입장·예약)를 채우고, 실제 조건으로 하루를 흘려 본 뒤
 * 품질 점수(시간·동선·밀도·체력·식사)와 고칠 방법을 보여 준다. [적용]은 그날 일정에 바로 반영(되돌리려면 다시 생성하거나 직접 수정).
 */
import { Compass, Loader2 } from "lucide-react";
import { useState } from "react";
import { fmt } from "@/lib/courseEngine";
import { applyDayResult, buildDayRequest } from "@/lib/engineDay";
import type { PmChoice } from "@/lib/itinerary";
import type { PlanResponse } from "@/lib/server/courseEngineServer";
import type { DayPlan, TravelType } from "@/types";

const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
const GRADE_COLOR: Record<string, string> = { A: "bg-emerald-600", B: "bg-sky-600", C: "bg-amber-500", D: "bg-rose-600" };

interface Props {
  days: DayPlan[];
  pmChoice: PmChoice;
  destination: string;
  departureDate?: string;
  travelType: TravelType;
  onReplaceDays: (days: DayPlan[]) => void;
}

type DayState = { status: "loading" } | { status: "error"; message: string } | { status: "done"; res: PlanResponse };

export function CourseEnginePanel({ days, pmChoice, destination, departureDate, travelType, onReplaceDays }: Props) {
  const [byDay, setByDay] = useState<Record<number, DayState>>({});
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    const next: Record<number, DayState> = {};
    for (const d of days) {
      const req = buildDayRequest(d, pmChoice, { destination, departureDate, travelType });
      if (!req) continue;
      next[d.day] = { status: "loading" };
      setByDay({ ...next });
      try {
        const r = await fetch("/api/engine/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
        const j = await r.json();
        next[d.day] = r.ok ? { status: "done", res: j as PlanResponse } : { status: "error", message: j?.error?.message ?? "코스 엔진 오류" };
      } catch {
        next[d.day] = { status: "error", message: "서버에 연결하지 못했습니다." };
      }
      setByDay({ ...next });
    }
    setRunning(false);
  };

  const apply = (dayNo: number, res: PlanResponse, o: { useBest: boolean; drop?: string[]; meetingTime?: string }) => {
    onReplaceDays(applyDayResult(days, dayNo, res, o));
    setByDay(s => { const c = { ...s }; delete c[dayNo]; return c; });
  };

  const entries = Object.entries(byDay);
  return (
    <section className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3" aria-label="코스 엔진 점검">
      <div className="flex flex-wrap items-center gap-2">
        <Compass className="h-4 w-4 text-indigo-600" aria-hidden />
        <b className="text-sm text-indigo-950">코스 엔진 점검</b>
        <span className="flex-1 text-[11px] leading-4 text-indigo-900/70">
          영업시간·휴무·마지막 입장·{departureDate ? "출발일 요일·공휴일·일몰" : "일몰"}·이동 시간으로 하루를 흘려 보고 점수와 고칠 방법을 알려 줍니다.
          {!departureDate && " (출발일을 넣으면 요일별 휴무까지 확인)"}
        </span>
        <button type="button" onClick={run} disabled={running} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
          {running && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {entries.length ? "다시 점검" : "점검하기"}
        </button>
      </div>
      {entries.length > 0 && (
        <div className="mt-3 space-y-2">
          {entries.map(([k, st]) => {
            const dayNo = Number(k);
            if (st.status === "loading") return <div key={k} className="rounded-md bg-white p-2 text-xs text-slate-500">DAY {dayNo} 확인 중… (장소 정보 찾기 포함 10~40초)</div>;
            if (st.status === "error") return <div key={k} className="rounded-md bg-white p-2 text-xs text-rose-700">DAY {dayNo}: {st.message}</div>;
            const { res } = st, q = res.quality, bq = res.bestQuality, c = res.context;
            const reorderFix = q.fixes.find(f => f.type === "reorder");
            const startFix = q.fixes.find(f => f.type === "shiftStart");
            const dropFixes = res.best.dropped;
            return (
              <div key={k} className="rounded-md border border-slate-200 bg-white p-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-slate-900">DAY {dayNo}</b>
                  <span className={`rounded px-1.5 py-0.5 font-bold text-white ${GRADE_COLOR[q.grade]}`}>{q.score}점 {q.grade}</span>
                  {reorderFix && <span className="text-slate-500">→ 추천 순서 {bq.score}점 {bq.grade}</span>}
                  <span className="text-slate-400">
                    {c.weekday != null && `${DAY_KO[c.weekday]}요일`}{c.holiday && ` · 공휴일(${c.holiday})`}{c.sunset && ` · 일몰 ${c.sunset}`} · 이동 {c.matrix === "google" ? "구글 지도" : "거리 어림"} · 장소 정보 {c.known}곳
                  </span>
                </div>
                <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                  {q.items.map(it => (
                    <li key={it.key} className="text-slate-600">
                      <b className="text-slate-800">{it.label}</b> {it.score}/{it.max}
                      {it.issues.slice(0, 2).map((s, i) => <span key={i} className="block text-amber-700">· {s}</span>)}
                    </li>
                  ))}
                </ul>
                {reorderFix && (
                  <p className="mt-2 text-slate-500">
                    추천 순서: {res.best.timeline.map(s => `${fmt(s.start)} ${s.name}`).join(" → ")}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {reorderFix && <button type="button" className="rounded border border-indigo-300 bg-indigo-600 px-2 py-1 font-semibold text-white" onClick={() => apply(dayNo, res, { useBest: true })}>{reorderFix.label}</button>}
                  <button type="button" className="rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50" onClick={() => apply(dayNo, res, { useBest: false })}>지금 순서에 이동 시간·영업시간 주의만 채우기</button>
                  {startFix?.start && <button type="button" className="rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50" onClick={() => apply(dayNo, res, { useBest: !!reorderFix, meetingTime: startFix.start })}>{startFix.label}</button>}
                  {dropFixes.map(dp => (
                    <button key={dp.id} type="button" className="rounded border border-rose-200 px-2 py-1 text-rose-700 hover:bg-rose-50" onClick={() => { if (confirm(`${dp.name}을(를) 이 날 일정에서 뺄까요?\n이유: ${dp.reason}`)) apply(dayNo, res, { useBest: !!reorderFix, drop: [dp.id] }); }}>
                      {dp.name} 빼기 ({dp.reason})
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
