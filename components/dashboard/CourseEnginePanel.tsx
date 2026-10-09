"use client";

/**
 * 🧭 코스 엔진 점검 — 날마다 장소 정보(영업시간·마지막 입장·예약)를 채우고, 실제 조건으로 하루를 흘려 본 뒤
 * 품질 점수(시간·동선·밀도·체력·식사)와 고칠 방법을 보여 준다. [적용]은 그날 일정에 바로 반영(되돌리려면 다시 생성하거나 직접 수정).
 */
import { Compass, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { fmt } from "@/lib/courseEngine";
import { applyAlternative, applyDayResult, buildDayRequest, reorderByEngine } from "@/lib/engineDay";
import type { Alternative } from "@/lib/server/engineAlternatives";
import type { PmChoice } from "@/lib/itinerary";
import type { PlanResponse } from "@/lib/server/courseEngineServer";
import type { CurrencyCode, DayPlan, TravelType, TripScope } from "@/types";

const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
const GRADE_COLOR: Record<string, string> = { A: "bg-emerald-600", B: "bg-sky-600", C: "bg-amber-500", D: "bg-rose-600" };

interface Props {
  days: DayPlan[];
  pmChoice: PmChoice;
  destination: string;
  departureDate?: string;
  travelType: TravelType;
  currency: CurrencyCode;
  tripScope: TripScope;
  onReplaceDays: (days: DayPlan[]) => void;
}

type AltState = { status: "loading" } | { status: "error"; message: string } | { status: "done"; list: Alternative[]; searched: boolean };

type DayState = { status: "loading" } | { status: "error"; message: string } | { status: "done"; res: PlanResponse };

export function CourseEnginePanel({ days, pmChoice, destination, departureDate, travelType, currency, tripScope, onReplaceDays }: Props) {
  const [byDay, setByDay] = useState<Record<number, DayState>>({});
  const [alts, setAlts] = useState<Record<number, AltState>>({});

  /** 점검에서 나온 문제를 고친 대안 일정을 AI로 여러 개 받아, 엔진 점수와 함께 보여 준다 */
  const suggest = async (dayNo: number, res: PlanResponse) => {
    const day = days.find((d) => d.day === dayNo);
    const plan = day ? buildDayRequest(day, pmChoice, { destination, departureDate, travelType }) : null;
    if (!plan) return;
    const issues = res.quality.items.flatMap((it) => it.issues);
    setAlts((s) => ({ ...s, [dayNo]: { status: "loading" } }));
    try {
      const r = await fetch("/api/engine/alternatives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, issues, destination, currency, tripScope, currentScore: res.quality.score }),
      });
      const j = await r.json();
      setAlts((s) => ({
        ...s,
        [dayNo]: r.ok ? { status: "done", list: j.alternatives as Alternative[], searched: !!j.searched } : { status: "error", message: j?.error?.message ?? "추천 변경안을 만들지 못했습니다." },
      }));
    } catch {
      setAlts((s) => ({ ...s, [dayNo]: { status: "error", message: "서버에 연결하지 못했습니다." } }));
    }
  };

  const applyAlt = (dayNo: number, alt: Alternative) => {
    onReplaceDays(applyAlternative(days, dayNo, alt, pmChoice));
    setAlts((s) => { const c = { ...s }; delete c[dayNo]; return c; });
    setByDay((s) => { const c = { ...s }; delete c[dayNo]; return c; });
  };
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
            // 추천 순서를 실제로 적용했을 때 관광지 순서가 바뀌는지 (항공·식사·숙소·저녁 일정은 제자리에 두므로, 그것만 옮기라는 추천이면 바뀔 게 없다)
            const dayPlan = days.find((d) => d.day === dayNo);
            const engineFix = q.fixes.find(f => f.type === "reorder");
            const changesOrder =
              !!engineFix && !!dayPlan && dayPlan.kind === "linear" && reorderByEngine(dayPlan.items, res.best.order).some((it, i) => it.id !== dayPlan.items[i]?.id);
            const reorderFix = changesOrder ? engineFix : undefined;
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
                    <span className="block text-slate-400">항공·식사·숙소·자유시간·저녁 일정은 제자리에 두고 관광지 순서만 바꿉니다.</span>
                  </p>
                )}
                {engineFix && !reorderFix && (
                  <p className="mt-2 text-pretty text-slate-500">
                    엔진은 식사·항공·저녁 일정의 시간을 옮기라고 제안했지만, 이런 항목은 정해진 시간대라 그대로 둡니다 — 바꿀 관광지 순서는 없습니다.
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {reorderFix && <button type="button" className="rounded border border-indigo-300 bg-indigo-600 px-2 py-1 font-semibold text-white" onClick={() => apply(dayNo, res, { useBest: true })}>{reorderFix.label}</button>}
                  <button type="button" className="rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50" onClick={() => apply(dayNo, res, { useBest: false })}>지금 순서에 이동 시간·영업시간 주의만 채우기</button>
                  {startFix?.start && <button type="button" className="rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50" onClick={() => apply(dayNo, res, { useBest: !!reorderFix, meetingTime: startFix.start })}>{startFix.label}</button>}
                  <button
                    type="button"
                    disabled={alts[dayNo]?.status === "loading"}
                    onClick={() => void suggest(dayNo, res)}
                    className="inline-flex items-center gap-1 rounded border border-violet-300 bg-violet-50 px-2 py-1 font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-60"
                  >
                    {alts[dayNo]?.status === "loading" ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Sparkles className="h-3 w-3" aria-hidden />}
                    {alts[dayNo]?.status === "loading" ? "추천 변경안 만드는 중… (1~2분)" : "추천 변경안 받기 (여러 안 비교)"}
                  </button>
                  {dropFixes.map(dp => (
                    <button key={dp.id} type="button" className="rounded border border-rose-200 px-2 py-1 text-rose-700 hover:bg-rose-50" onClick={() => { if (confirm(`${dp.name}을(를) 이 날 일정에서 뺄까요?\n이유: ${dp.reason}`)) apply(dayNo, res, { useBest: !!reorderFix, drop: [dp.id] }); }}>
                      {dp.name} 빼기 ({dp.reason})
                    </button>
                  ))}
                </div>
                <AlternativeList state={alts[dayNo]} currentScore={q.score} onApply={(alt) => applyAlt(dayNo, alt)} />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** 추천 변경안 목록 — 엔진 점수 높은 순. 바뀐 점(추가·제외·순서)과 시간표를 보고 하나를 골라 적용한다 */
function AlternativeList({ state, currentScore, onApply }: { state?: AltState; currentScore: number; onApply: (alt: Alternative) => void }) {
  if (!state || state.status === "loading") return null;
  if (state.status === "error") return <p className="mt-2 text-rose-700">{state.message}</p>;
  if (state.list.length === 0) return <p className="mt-2 text-slate-500">근거 있는 대안을 찾지 못했습니다. 다시 시도하거나 직접 수정해 주세요.</p>;
  return (
    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
      <p className="font-semibold text-slate-800">추천 변경안 {state.list.length}개 (지금 {currentScore}점)</p>
      {!state.searched && <p className="text-amber-700">웹 검색 근거 없이 만든 안입니다. 새 장소는 실제로 있는지 확인하세요.</p>}
      {state.list.map((alt, i) => {
        const q = alt.result.quality;
        const diff = q.score - currentScore;
        const issues = q.items.flatMap((it) => it.issues).slice(0, 3);
        return (
          <div key={i} className="rounded-md border border-violet-200 bg-violet-50/40 p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <b className="text-slate-900">{i + 1}. {alt.title}</b>
              <span className={`rounded px-1.5 py-0.5 font-bold text-white ${GRADE_COLOR[q.grade]}`}>{q.score}점 {q.grade}</span>
              <span className={diff > 0 ? "font-semibold text-emerald-700" : diff < 0 ? "text-rose-600" : "text-slate-500"}>
                {diff > 0 ? `+${diff}점` : diff < 0 ? `${diff}점` : "점수 같음"}
              </span>
            </div>
            <p className="mt-1 text-slate-600">{alt.reason}</p>
            {(alt.added.length > 0 || alt.removed.length > 0 || alt.changed.length > 0) && (
              <p className="mt-1">
                {alt.added.length > 0 && <span className="text-emerald-700">추가: {alt.added.join(", ")} </span>}
                {alt.removed.length > 0 && <span className="text-rose-600">제외: {alt.removed.join(", ")} </span>}
                {alt.changed.length > 0 && <span className="text-sky-700">시간 조정: {alt.changed.join(", ")}</span>}
              </p>
            )}
            <p className="mt-1 text-slate-500">{alt.result.current.timeline.map((st) => `${fmt(st.start)} ${st.name}`).join(" → ")}</p>
            {issues.length > 0 && <p className="mt-1 text-amber-700">남는 문제: {issues.join(" · ")}</p>}
            <button
              type="button"
              onClick={() => onApply(alt)}
              className="mt-2 rounded border border-violet-400 bg-violet-600 px-2 py-1 font-semibold text-white hover:bg-violet-700"
            >
              이 안으로 변경
            </button>
          </div>
        );
      })}
      <p className="text-[11px] text-slate-400">새로 넣은 장소의 입장료·식대는 AI 추정입니다. 변경 뒤 일정표와 견적에서 확인하세요.</p>
    </div>
  );
}
