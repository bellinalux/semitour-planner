"use client";

/**
 * 🧭 코스 엔진 점검 — 날마다 장소 정보(영업시간·마지막 입장·예약)를 채우고, 실제 조건으로 하루를 흘려 본 뒤
 * 품질 점수(시간·동선·밀도·체력·식사)와 고칠 방법을 보여 준다. 적용은 그날 일정에 바로 반영하고, 바로 되돌릴 수 있다.
 * 점검 상태는 CourseEngineContext(일정 카드 점수 배지·요약·추천과 같이 쓴다)에 있다.
 */
import { ArrowRightLeft, Compass, Loader2, Sparkles, Undo2 } from "lucide-react";
import { useContext, useState } from "react";
import { CourseEngineContext, type EngineAltState, type FixChoice } from "@/hooks/useCourseEngine";
import { fmt } from "@/lib/courseEngine";
import { insertBreak, type DayMove } from "@/lib/dayBalance";
import { reorderByEngine } from "@/lib/engineDay";
import type { Alternative } from "@/lib/server/engineAlternatives";
import type { DayPlan } from "@/types";

const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
export const GRADE_COLOR: Record<string, string> = { A: "bg-emerald-600", B: "bg-sky-600", C: "bg-amber-500", D: "bg-rose-600" };

interface Props {
  days: DayPlan[];
  departureDate?: string;
  /** 출발일이 없을 때 여기서 바로 넣는다 (요일별 휴무·공휴일 확인) */
  onDepartureDate?: (date: string) => void;
}

export function CourseEnginePanel({ days, departureDate, onDepartureDate }: Props) {
  const engine = useContext(CourseEngineContext);
  /** "100점 만들기"에서 끈 항목 (날짜별) — 기본은 모두 켬 */
  const [off, setOff] = useState<Record<number, Partial<Record<keyof FixChoice, boolean>>>>({});
  if (!engine) return null;
  const { byDay, alts, running, run, apply, suggest, applyAlt, moves, fix, canUndo, undo, regressed, autoCheck, setAutoCheck } = engine;
  const toggle = (dayNo: number, key: keyof FixChoice) => setOff((s) => ({ ...s, [dayNo]: { ...s[dayNo], [key]: !s[dayNo]?.[key] } }));

  const entries = Object.entries(byDay);
  const pendingMoves = moves.filter((m) => byDay[m.fromDay]?.status !== "done");
  return (
    <section id="course-engine" className="scroll-mt-4 rounded-lg border border-indigo-200 bg-indigo-50/60 p-3" aria-label="코스 엔진 점검">
      <div className="flex flex-wrap items-center gap-2">
        <Compass className="h-4 w-4 text-indigo-600" aria-hidden />
        <b className="text-sm text-indigo-950">코스 엔진 점검</b>
        <span className="flex-1 text-pretty text-[11px] leading-4 text-indigo-900/70">
          영업시간·휴무·마지막 입장·{departureDate ? "출발일 요일·공휴일·일몰" : "일몰"}·이동 시간으로 하루를 흘려 보고 점수와 고칠 방법을 알려 줍니다. 한 번 점검한 날은 고치면 자동으로 다시 채점합니다.
        </span>
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {running && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {entries.length ? "다시 점검" : "점검하기"}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-indigo-950">
        {!departureDate && onDepartureDate && (
          <label className="inline-flex items-center gap-1.5">
            <span className="font-semibold">출발일</span>
            <input
              type="date"
              aria-label="출발일 (요일별 휴무 확인)"
              className="h-7 rounded border border-indigo-200 bg-white px-1.5 text-xs tabular-nums"
              onChange={(e) => e.target.value && onDepartureDate(e.target.value)}
            />
            <span className="text-indigo-900/60">넣으면 요일별 휴무·공휴일까지 확인</span>
          </label>
        )}
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={autoCheck} onChange={(e) => setAutoCheck(e.target.checked)} />
          코스를 만들면 시간 검증·엔진 점검까지 자동으로
        </label>
      </div>
      {canUndo && (
        <div role="status" className="mt-2 flex items-center gap-2 rounded-md border border-indigo-200 bg-white px-2.5 py-1.5 text-[11px] text-indigo-900">
          <span className="flex-1 text-pretty">
            {regressed.length > 0 ? (
              <b className="text-amber-700">
                {regressed.map((r) => `DAY ${r.day} ${r.before}→${r.after}점`).join(", ")} — 고친 뒤 점수가 내려갔습니다. 되돌리기를 권합니다.
              </b>
            ) : (
              "엔진 추천을 일정에 적용했습니다. 바뀐 날은 잠시 뒤 자동으로 다시 채점합니다."
            )}
          </span>
          <button type="button" onClick={undo} className="inline-flex shrink-0 items-center gap-1 font-semibold underline underline-offset-2">
            <Undo2 className="size-3" aria-hidden />
            되돌리기
          </button>
        </div>
      )}
      {pendingMoves.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {pendingMoves.map((m) => (
            <MoveRow key={`${m.fromDay}-${m.toDay}`} move={m} onApply={() => fix(m.fromDay, { reorder: false, move: m, addBreak: false })} />
          ))}
        </ul>
      )}
      {entries.length > 0 && (
        <div className="mt-3 space-y-2">
          {entries.map(([k, st]) => {
            const dayNo = Number(k);
            if (st.status === "loading") return <div key={k} className="rounded-md bg-white p-2 text-xs text-slate-500">DAY {dayNo} 확인 중… (장소 정보 찾기 포함 10~40초)</div>;
            if (st.status === "error") return <div key={k} className="rounded-md bg-white p-2 text-xs text-rose-700">DAY {dayNo}: {st.message}</div>;
            const { res } = st, q = res.quality, bq = res.bestQuality, c = res.context;
            // 추천 순서를 실제로 적용했을 때 관광지 순서가 바뀌는지 (항공·식사·숙소·저녁 일정은 제자리에 두므로, 그것만 옮기라는 추천이면 바뀔 게 없다)
            const dayPlan = days.find((d) => d.day === dayNo);
            const engineFix = q.fixes.find((f) => f.type === "reorder");
            const changesOrder =
              !!engineFix && !!dayPlan && dayPlan.kind === "linear" && reorderByEngine(dayPlan.items, res.best.order).some((it, i) => it.id !== dayPlan.items[i]?.id);
            const reorderFix = changesOrder ? engineFix : undefined;
            const startFix = q.fixes.find((f) => f.type === "shiftStart");
            // 뺄 곳 안내(휴무·마감 등)는 출발일을 알 때만 — 출발일이 없으면 요일을 몰라 판단하지 않고 모든 장소를 그대로 둔다
            const dropFixes = departureDate ? res.best.dropped : [];
            // 그 요일 휴무인 곳은 순서를 바꿔도 못 가므로 100점 만들기에서 함께 뺄 수 있게
            const closed = dropFixes.filter((dp) => /휴무/.test(dp.reason));
            // 100점 만들기 — 고를 수 있는 고칠 것
            const move = moves.find((m) => m.fromDay === dayNo) ?? null;
            // 하루 끝이 이미 늦은 날은 휴식을 넣으면 더 늦어지므로 제안하지 않는다
            const lateEnd = q.items.some((it) => it.issues.some((x) => x.startsWith("하루 끝")));
            const canBreak = !!dayPlan && !lateEnd && insertBreak(dayPlan) !== dayPlan;
            const options: { key: keyof FixChoice; label: string; note?: string }[] = [
              ...(reorderFix ? [{ key: "reorder" as const, label: `관광지 순서를 엔진 추천대로 (${bq.score}점)` }] : []),
              ...(startFix?.start ? [{ key: "start" as const, label: startFix.label }] : []),
              ...(closed.length > 0 ? [{ key: "drop" as const, label: `그날 휴무인 곳 빼기: ${closed.map((dp) => dp.name).join(", ")}`, note: "휴무가 맞는지 업체·공식 사이트로 한 번 더 확인하세요" }] : []),
              ...(move ? [{ key: "move" as const, label: move.label, note: move.note }] : []),
              ...(canBreak ? [{ key: "addBreak" as const, label: "쉬지 않고 4시간 넘는 곳에 30분 휴식 넣기" }] : []),
            ];
            const choice: FixChoice = {
              reorder: !!reorderFix && !off[dayNo]?.reorder,
              start: startFix?.start && !off[dayNo]?.start ? startFix.start : null,
              drop: closed.length > 0 && !off[dayNo]?.drop ? closed.map((dp) => dp.id) : [],
              move: move && !off[dayNo]?.move ? move : null,
              addBreak: canBreak && !off[dayNo]?.addBreak,
            };
            const picked = choice.reorder || !!choice.start || (choice.drop?.length ?? 0) > 0 || !!choice.move || choice.addBreak;
            return (
              <div key={k} className="rounded-md border border-slate-200 bg-white p-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-slate-900">DAY {dayNo}</b>
                  <span className={`rounded px-1.5 py-0.5 font-bold tabular-nums text-white ${GRADE_COLOR[q.grade]}`}>
                    {q.score}점 {q.grade}
                  </span>
                  {reorderFix && <span className="tabular-nums text-slate-500">→ 추천 순서 {bq.score}점 {bq.grade}</span>}
                  <span className="text-slate-400">
                    {c.weekday != null && `${DAY_KO[c.weekday]}요일`}
                    {c.holiday && ` · 공휴일(${c.holiday})`}
                    {c.sunset && ` · 일몰 ${c.sunset}`} · 이동 {c.matrix === "google" ? "구글 지도" : "거리 어림"}
                    {c.matrix !== "google" && c.matrixNote ? ` (${c.matrixNote})` : ""} · 장소 정보 {c.known}곳
                  </span>
                </div>
                <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                  {q.items.map((it) => (
                    <li key={it.key} className="text-slate-600">
                      <b className="text-slate-800">{it.label}</b> <span className="tabular-nums">{it.score}/{it.max}</span>
                      {it.issues.slice(0, 2).map((s, i) => (
                        <span key={i} className="block text-amber-700">
                          · {s}
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
                {options.length > 0 && q.score < 100 && (
                  <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50/60 p-2">
                    <p className="font-semibold text-emerald-900">100점 만들기 — 고를 것을 켜고 한 번에 적용</p>
                    <ul className="mt-1 space-y-1">
                      {options.map((o) => (
                        <li key={o.key}>
                          <label className="flex items-start gap-1.5 text-slate-700">
                            <input type="checkbox" className="mt-0.5" checked={!off[dayNo]?.[o.key]} onChange={() => toggle(dayNo, o.key)} />
                            <span>
                              {o.label}
                              {o.note && <span className="block text-amber-700">{o.note}</span>}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      disabled={!picked}
                      onClick={() => fix(dayNo, choice)}
                      className="mt-1.5 rounded border border-emerald-600 bg-emerald-600 px-2 py-1 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      고른 것 적용하고 다시 채점
                    </button>
                  </div>
                )}
                {reorderFix && (
                  <p className="mt-2 text-slate-500">
                    추천 순서: {res.best.timeline.map((s) => `${fmt(s.start)} ${s.name}`).join(" → ")}
                    <span className="block text-slate-400">항공·식사·숙소·자유시간·저녁 일정은 제자리에 두고 관광지 순서만 바꿉니다.</span>
                  </p>
                )}
                {engineFix && !reorderFix && (
                  <p className="mt-2 text-pretty text-slate-500">
                    엔진은 식사·항공·저녁 일정의 시간을 옮기라고 제안했지만, 이런 항목은 정해진 시간대라 그대로 둡니다 — 바꿀 관광지 순서는 없습니다.
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button type="button" className="rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50" onClick={() => apply(dayNo, res, { useBest: false })}>
                    지금 순서에 이동 시간·영업시간 주의만 채우기
                  </button>
                  <button
                    type="button"
                    disabled={alts[dayNo]?.status === "loading"}
                    onClick={() => void suggest(dayNo, res)}
                    className="inline-flex items-center gap-1 rounded border border-violet-300 bg-violet-50 px-2 py-1 font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-60"
                  >
                    {alts[dayNo]?.status === "loading" ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Sparkles className="h-3 w-3" aria-hidden />}
                    {alts[dayNo]?.status === "loading" ? "추천 변경안 만드는 중… (1~2분)" : "추천 변경안 받기 (여러 안 비교)"}
                  </button>
                  {dropFixes.map((dp) => (
                    <button
                      key={dp.id}
                      type="button"
                      className="rounded border border-rose-200 px-2 py-1 text-rose-700 hover:bg-rose-50"
                      onClick={() => {
                        if (confirm(`${dp.name}을(를) 이 날 일정에서 뺄까요?\n이유: ${dp.reason}`)) apply(dayNo, res, { useBest: !!reorderFix, drop: [dp.id] });
                      }}
                    >
                      {dp.name} 빼기 ({dp.reason})
                    </button>
                  ))}
                </div>
                {!departureDate && res.best.dropped.length > 0 && (
                  <p className="mt-2 text-pretty text-slate-500">
                    출발일이 없어 요일별 휴무를 확인하지 않았습니다 — 모든 장소를 그대로 둡니다. 출발일을 넣으면 그날 휴무·마감인 곳을 빼자고 알려 드립니다.
                  </p>
                )}
                <AlternativeList state={alts[dayNo]} currentScore={q.score} onApply={(alt: Alternative) => applyAlt(dayNo, alt)} />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** 날짜 사이 옮기기 제안 한 줄 (점검 전에도 보인다) */
function MoveRow({ move, onApply }: { move: DayMove; onApply: () => void }) {
  return (
    <li className="flex flex-wrap items-start gap-2 rounded-md border border-amber-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-700">
      <ArrowRightLeft className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden />
      <span className="min-w-0 flex-1 text-pretty">
        DAY {move.fromDay}이 10시간을 넘습니다 — {move.label}
        {move.note && <span className="block text-amber-700">{move.note}</span>}
      </span>
      <button type="button" onClick={onApply} className="shrink-0 rounded border border-amber-400 px-2 py-0.5 font-semibold text-amber-800 hover:bg-amber-50">
        옮기기
      </button>
    </li>
  );
}

/** 추천 변경안 목록 — 엔진 점수 높은 순. 바뀐 점(추가·제외·순서)과 시간표를 보고 하나를 골라 적용한다 */
function AlternativeList({ state, currentScore, onApply }: { state?: EngineAltState; currentScore: number; onApply: (alt: Alternative) => void }) {
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
