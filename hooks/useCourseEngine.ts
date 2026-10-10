"use client";

import { createContext, useEffect, useRef, useState } from "react";
import { postJson } from "@/lib/api";
import { calcDayLoad } from "@/lib/dayLoad";
import { dayItems } from "@/lib/itinerary";
import { fitCourse, nearestOrder } from "@/lib/courseFit";
import { planRegions, withCoords } from "@/lib/regionPlan";
import { diffDays, type DayDiff } from "@/lib/reorder";
import { findZigzag, groupByArea, type Zigzag } from "@/lib/routeOrder";
import { applyDayMove, insertBreak, refitDay, suggestDayMoves, type DayMove } from "@/lib/dayBalance";
import { applyAlternative, applyDayResult, buildDayRequest } from "@/lib/engineDay";
import type { PmChoice } from "@/lib/itinerary";
import type { Alternative } from "@/lib/server/engineAlternatives";
import type { PlanResponse } from "@/lib/server/courseEngineServer";
import type { CurrencyCode, DayPlan, TravelType, TripScope } from "@/types";

export type EngineDayState = { status: "loading" } | { status: "error"; message: string } | { status: "done"; res: PlanResponse };
export type EngineAltState = { status: "loading" } | { status: "error"; message: string } | { status: "done"; list: Alternative[]; searched: boolean };

/** 날짜별 마지막 점수 (결과 상자를 닫아도 남는다 — 일정 카드 배지·요약·추천에 쓴다) */
export interface EngineScore {
  score: number;
  grade: "A" | "B" | "C" | "D";
  /** 가장 큰 감점 이유 한 줄 */
  top: string;
  /** 엔진 추천 순서로 바꾸면 점수 */
  best: number;
}

/** "100점 만들기"에서 고를 수 있는 고칠 것 */
export interface FixChoice {
  reorder: boolean;
  /** 출발(미팅) 시각 바꾸기 "HH:MM" */
  start?: string | null;
  /** 뺄 항목 (예: 그 요일 휴무인 곳) */
  drop?: string[];
  move: DayMove | null;
  addBreak: boolean;
}

export interface CourseEngineView {
  byDay: Record<number, EngineDayState>;
  alts: Record<number, EngineAltState>;
  scores: Record<number, EngineScore>;
  running: boolean;
  /** 날짜들을 점검한다 (생략하면 모든 날) */
  run: (dayNos?: number[]) => Promise<void>;
  apply: (dayNo: number, res: PlanResponse, o: { useBest: boolean; drop?: string[]; meetingTime?: string }) => void;
  suggest: (dayNo: number, res: PlanResponse) => Promise<void>;
  applyAlt: (dayNo: number, alt: Alternative) => void;
  /** 날짜 사이 옮기기 제안 */
  moves: DayMove[];
  /** 고른 고칠 것을 한 번에 적용 (되돌리기 가능, 적용 뒤 자동으로 다시 채점) */
  fix: (dayNo: number, choice: FixChoice) => void;
  canUndo: boolean;
  undo: () => void;
  /** 떠났던 구역으로 되돌아오는 날 (지그재그 동선) */
  zigzags: Record<number, Zigzag[]>;
  /** 지그재그를 "구역 순서대로 묶기"로 고칠 수 있는 날 (아니면 식당 위치 등 때문이라 엔진 순서 바꾸기로) */
  zigzagFixable: Record<number, boolean>;
  /** 그날 장소를 구역 순서대로 묶는다 (되돌리기 가능) */
  groupAreas: (dayNo: number) => void;
  /** 고친 뒤 다시 채점했더니 점수가 내려간 날 — 되돌리기를 권한다 */
  regressed: { day: number; before: number; after: number }[];
  /** 코스를 만들면 시간 검증 + 엔진 점검까지 이어서 할지 (브라우저에 기억) */
  autoCheck: boolean;
  setAutoCheck: (on: boolean) => void;
  /** 코스 생성이 끝나면 걸어 둔다 — 새 일정이 화면에 들어온 뒤 한 번 실행 */
  armAfterGenerate: () => void;
  /**
   * 코스 재정렬 미리보기 — (전체면) 여러 날 지역 묶기 → 날마다 엔진 추천 순서 → 식사 시간 맞추기.
   * 바꾼 일정과 날마다 전·후 비교를 돌려준다 (아직 적용하지 않음).
   */
  reorder: (dayNos?: number[]) => Promise<{ days: DayPlan[]; diffs: DayDiff[] }>;
  /** 재정렬 결과 적용 (되돌리기 기록에 '코스 재정렬'로) */
  applyReorder: (days: DayPlan[]) => void;
}

interface Args {
  days: DayPlan[];
  pmChoice: PmChoice;
  destination: string;
  departureDate?: string;
  travelType: TravelType;
  currency: CurrencyCode;
  tripScope: TripScope;
  replaceDays: (days: DayPlan[]) => void;
  /** 찾은 장소 좌표를 일정에 넣는다 (되돌리기 기록에 쌓지 않는 저장) — 코스 지도·지역 묶기에 쓴다 */
  saveCoords?: (days: DayPlan[]) => void;
  /** 코스 재정렬 적용 (되돌리기 기록 이름 '코스 재정렬') */
  reorderReplace?: (days: DayPlan[]) => void;
  /** 자동 점검 전에 할 일(긴 날 시간 검증)과, 그 일이 끝날 때까지 기다릴지 */
  beforeAuto?: { run: (dayNos: number[]) => void; busy: boolean };
}

const AUTO_KEY = "semitour.autoEngineCheck";

/** 날짜 일정이 바뀌었는지 볼 서명 — 항목·체류·이동·시작 시각 */
const signatureOf = (d: DayPlan) =>
  JSON.stringify([d.meetingTime ?? "", ...[...d.items, ...d.amGuided, ...d.pmFreeOptions.flatMap((o) => o.items)].map((i) => [i.id, i.stayMinutes, i.travelMinutesToNext])]);

function scoreOf(res: PlanResponse): EngineScore {
  const q = res.quality;
  const worst = [...q.items].sort((a, b) => b.max - b.score - (a.max - a.score))[0];
  return { score: q.score, grade: q.grade, top: worst && worst.score < worst.max ? `${worst.label}: ${worst.issues[0] ?? ""}` : "", best: res.bestQuality.score };
}

/**
 * 코스 엔진 점검 상태 — 날짜별 점검 결과·점수·추천 변경안, 결과 적용, "100점 만들기", 되돌리기.
 * 한 번 점검한 날은 일정을 고치면 잠시 뒤 자동으로 다시 채점한다(장소 정보는 서버에 저장돼 있어 다시 찾지 않는다).
 */
export function useCourseEngine({ days, pmChoice, destination, departureDate, travelType, currency, tripScope, replaceDays, saveCoords, reorderReplace, beforeAuto }: Args): CourseEngineView {
  const [byDay, setByDay] = useState<Record<number, EngineDayState>>({});
  const [alts, setAlts] = useState<Record<number, EngineAltState>>({});
  const [scores, setScores] = useState<Record<number, EngineScore>>({});
  const [running, setRunning] = useState(false);
  const [snapshot, setSnapshot] = useState<DayPlan[] | null>(null);
  /** 마지막으로 고치기 전 점수 (날짜별) */
  const [scoreBefore, setScoreBefore] = useState<Record<number, number>>({});
  const latest = useRef(days);
  useEffect(() => {
    latest.current = days;
  }, [days]);

  const requestFor = (d: DayPlan) => buildDayRequest(d, pmChoice, { destination, departureDate, travelType });

  /** 한 날 점검 — 결과를 화면 상태에 넣고 돌려준다 (실패하면 null) */
  const planFor = async (d: DayPlan): Promise<PlanResponse | null> => {
    const req = requestFor(d);
    if (!req) return null;
    setByDay((s) => ({ ...s, [d.day]: { status: "loading" } }));
    try {
      const r = await fetch("/api/engine/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
      const j = await r.json();
      if (r.ok) {
        const res = j as PlanResponse;
        setByDay((s) => ({ ...s, [d.day]: { status: "done", res } }));
        return res;
      }
      setByDay((s) => ({ ...s, [d.day]: { status: "error", message: j?.error?.message ?? "코스 엔진 오류" } }));
    } catch {
      setByDay((s) => ({ ...s, [d.day]: { status: "error", message: "서버에 연결하지 못했습니다." } }));
    }
    return null;
  };

  const run = async (dayNos?: number[]) => {
    setRunning(true);
    try {
      for (const d of latest.current) {
        if (dayNos && !dayNos.includes(d.day)) continue;
        const req = requestFor(d);
        if (!req) continue;
        setByDay((s) => ({ ...s, [d.day]: { status: "loading" } }));
        try {
          const r = await fetch("/api/engine/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
          const j = await r.json();
          if (r.ok) {
            const res = j as PlanResponse;
            setByDay((s) => ({ ...s, [d.day]: { status: "done", res } }));
            setScores((s) => {
              // 발전 지표: 그날 처음 채점한 점수만 (고친 뒤 다시 채점한 것은 빼고)
              if (!s[d.day]) void postJson("/api/knowledge", { score: res.quality.score }).catch(() => undefined);
              return { ...s, [d.day]: scoreOf(res) };
            });
            if (saveCoords) {
              const next = withCoords(latest.current, res.places);
              if (next !== latest.current) {
                latest.current = next;
                saveCoords(next);
              }
            }
          } else setByDay((s) => ({ ...s, [d.day]: { status: "error", message: j?.error?.message ?? "코스 엔진 오류" } }));
        } catch {
          setByDay((s) => ({ ...s, [d.day]: { status: "error", message: "서버에 연결하지 못했습니다." } }));
        }
      }
    } finally {
      setRunning(false);
    }
  };

  // 한 번 채점한 날은 일정이 바뀌면 1.5초 뒤 자동으로 다시 채점한다
  const signatures = useRef<Record<number, string>>({});
  const pending = useRef<number | null>(null);
  useEffect(() => {
    const changed = days.filter((d) => scores[d.day] && signatures.current[d.day] !== undefined && signatures.current[d.day] !== signatureOf(d)).map((d) => d.day);
    for (const d of days) signatures.current[d.day] = signatureOf(d);
    if (changed.length === 0 || running) return;
    if (pending.current) window.clearTimeout(pending.current);
    pending.current = window.setTimeout(() => void run(changed), 1500);
    return () => {
      if (pending.current) window.clearTimeout(pending.current);
    };
    // run은 매 렌더 새로 만들어지지만, 일정(days)이 바뀔 때만 다시 채점하면 된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const keepSnapshot = (dayNos: number[] = []) => {
    setSnapshot(latest.current);
    setScoreBefore(Object.fromEntries(dayNos.filter((n) => scores[n]).map((n) => [n, scores[n].score])));
  };

  const apply: CourseEngineView["apply"] = (dayNo, res, o) => {
    keepSnapshot([dayNo]);
    replaceDays(applyDayResult(latest.current, dayNo, res, o));
    setByDay((s) => {
      const c = { ...s };
      delete c[dayNo];
      return c;
    });
  };

  const suggest: CourseEngineView["suggest"] = async (dayNo, res) => {
    const day = latest.current.find((d) => d.day === dayNo);
    const plan = day ? requestFor(day) : null;
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

  const applyAlt: CourseEngineView["applyAlt"] = (dayNo, alt) => {
    keepSnapshot([dayNo]);
    replaceDays(applyAlternative(latest.current, dayNo, alt, pmChoice));
    setAlts((s) => {
      const c = { ...s };
      delete c[dayNo];
      return c;
    });
    setByDay((s) => {
      const c = { ...s };
      delete c[dayNo];
      return c;
    });
  };

  const fix: CourseEngineView["fix"] = (dayNo, choice) => {
    let next = latest.current;
    const st = byDay[dayNo];
    const drop = choice.drop ?? [];
    if (choice.reorder && st?.status === "done")
      next = applyDayResult(next, dayNo, st.res, { useBest: true, ...(drop.length > 0 ? { drop } : {}), ...(choice.start ? { meetingTime: choice.start } : {}) });
    else if (choice.start || drop.length > 0)
      next = next.map((d) =>
        d.day === dayNo
          ? refitDay({ ...d, ...(choice.start ? { meetingTime: choice.start } : {}), items: d.items.filter((i) => !drop.includes(i.id)) })
          : d,
      );
    if (choice.move) next = applyDayMove(next, choice.move);
    if (choice.addBreak) next = next.map((d) => (d.day === dayNo ? insertBreak(d) : d));
    if (next === latest.current) return;
    keepSnapshot([dayNo, ...(choice.move ? [choice.move.toDay] : [])]);
    replaceDays(next);
    setByDay((s) => {
      const c = { ...s };
      delete c[dayNo];
      return c;
    });
    // 옮겨 받은 날도 채점해 둔다 (처음이면 자동 재채점 대상이 아니므로 직접)
    if (choice.move && !scores[choice.move.toDay]) window.setTimeout(() => void run([choice.move!.toDay]), 1600);
  };

  const groupAreas: CourseEngineView["groupAreas"] = (dayNo) => {
    const next = latest.current.map((d) => (d.day === dayNo ? groupByArea(d) : d));
    if (next.every((d, i) => d === latest.current[i])) return;
    keepSnapshot([dayNo]);
    replaceDays(next);
  };
  const zigzags: Record<number, Zigzag[]> = Object.fromEntries(days.map((d) => [d.day, findZigzag(d, pmChoice)]).filter(([, z]) => (z as Zigzag[]).length > 0));
  const zigzagFixable: Record<number, boolean> = Object.fromEntries(
    days.filter((d) => zigzags[d.day]).map((d) => [d.day, findZigzag(groupByArea(d), pmChoice).length < zigzags[d.day].length]),
  );

  const undo = () => {
    if (!snapshot) return;
    replaceDays(snapshot);
    setSnapshot(null);
    setScoreBefore({});
  };
  const regressed = Object.entries(scoreBefore)
    .map(([k, before]) => ({ day: Number(k), before, after: scores[Number(k)]?.score ?? before }))
    .filter((r) => snapshot !== null && byDay[r.day]?.status === "done" && r.after < r.before);

  // 코스를 만들면 자동 점검 — 너무 긴 날(아직 구역 확인 전)은 먼저 시간 검증, 끝나면 모든 날 엔진 점검
  const [autoCheck, setAutoCheckState] = useState(false);
  useEffect(() => {
    try {
      // 브라우저 저장소 값이라 화면을 그린 뒤에 읽는다
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAutoCheckState(localStorage.getItem(AUTO_KEY) !== "0");
    } catch {
      // 무시
    }
  }, []);
  const setAutoCheck = (on: boolean) => {
    setAutoCheckState(on);
    try {
      localStorage.setItem(AUTO_KEY, on ? "1" : "0");
    } catch {
      // 무시
    }
  };
  const armed = useRef(false);
  const [waitingRun, setWaitingRun] = useState(false);
  useEffect(() => {
    if (!armed.current || days.length === 0) return;
    armed.current = false;
    const long = days
      .filter((d) => calcDayLoad(d, pmChoice).level === "overloaded" && !dayItems(d, pmChoice).some((i) => i.timeCheck?.basis === "area"))
      .map((d) => d.day);
    if (long.length > 0) beforeAuto?.run(long);
    setWaitingRun(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);
  const busy = !!beforeAuto?.busy;
  useEffect(() => {
    if (!waitingRun || busy || running) return;
    // 시간 검증 결과가 화면에 반영된 뒤 점검하도록 조금 기다린다
    const t = window.setTimeout(() => {
      setWaitingRun(false);
      void run();
    }, 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingRun, busy, running]);

  const reorder: CourseEngineView["reorder"] = async (dayNos) => {
    setRunning(true);
    const before = latest.current;
    const targets = (dayNos ?? before.map((d) => d.day)).filter((n) => before.some((d) => d.day === n));
    const notes: Record<number, string[]> = {};
    const scoreInfo: Record<number, { before: number; after: number }> = {};
    const note = (day: number, text: string) => (notes[day] = [...(notes[day] ?? []), text]);
    let work = before;
    try {
      // ① 전체 재정렬이면 같은 지역을 여러 날 나눠 가는 곳을 한 날로
      if (!dayNos && work.length > 1) {
        const rp = planRegions(work, pmChoice);
        if (rp.moves.length > 0) {
          work = rp.days;
          for (const m of rp.moves) {
            note(m.fromDay, `${m.names.join(", ")} → DAY ${m.toDay} (같은 지역 묶기)`);
            note(m.toDay, `${m.names.join(", ")} ← DAY ${m.fromDay} (같은 지역 묶기)`);
          }
        }
      }
      // ② 날마다 엔진 추천 순서 (영업시간·식사 시간대·이동·일몰/밤) — 점수가 오를 때만
      for (const n of targets) {
        const d = work.find((x) => x.day === n);
        if (!d) continue;
        const res = d.kind === "linear" ? await planFor(d) : null;
        if (!res) {
          // 엔진을 못 쓰거나 오전·오후 나뉜 날 — 좌표로 가까운 순서 (식사·항공·숙소는 제자리)
          const local =
            d.kind === "linear"
              ? { ...d, items: nearestOrder(d.items) }
              : { ...d, amGuided: nearestOrder(d.amGuided), pmFreeOptions: d.pmFreeOptions.map((o) => ({ ...o, items: nearestOrder(o.items) })) };
          const ids = (x: DayPlan) => [...x.items, ...x.amGuided, ...x.pmFreeOptions.flatMap((o) => o.items)].map((i) => i.id).join("|");
          if (ids(local) !== ids(d)) {
            work = work.map((x) => (x.day === n ? local : x));
            note(n, "가까운 곳부터 (좌표 기준)");
          }
          continue;
        }
        setScores((s) => ({ ...s, [n]: scoreOf(res) }));
        // 점검이 찾은 좌표도 함께 (코스 지도·지역 묶기)
        work = withCoords(work, res.places);
        if (res.best.order.join("|") !== res.current.order.join("|") && res.bestQuality.score > res.quality.score) {
          work = applyDayResult(work, n, res, { useBest: true });
          scoreInfo[n] = { before: res.quality.score, after: res.bestQuality.score };
          note(n, `추천 순서 (점검 ${res.quality.score} → ${res.bestQuality.score}점)`);
        } else scoreInfo[n] = { before: res.quality.score, after: res.quality.score };
      }
      // ③ 식사 시간 맞추기 (같은 식사 합치기·늦은 식사 당기기)
      const fit = fitCourse(work.filter((d) => targets.includes(d.day)), { walk: false, slot: true });
      const fitted = new Map(fit.days.map((d) => [d.day, d]));
      work = work.map((d) => fitted.get(d.day) ?? d);
      for (const c of fit.changes) note(c.day, c.note);
    } finally {
      setRunning(false);
    }
    return { days: work, diffs: diffDays(before, work, pmChoice, { scores: scoreInfo, notes }) };
  };

  const applyReorder: CourseEngineView["applyReorder"] = (next) => {
    keepSnapshot(next.map((d) => d.day));
    (reorderReplace ?? replaceDays)(next);
  };

  return {
    reorder,
    applyReorder,
    byDay,
    alts,
    scores,
    running,
    run,
    apply,
    suggest,
    applyAlt,
    moves: suggestDayMoves(days, pmChoice),
    fix,
    canUndo: snapshot !== null,
    undo,
    regressed,
    zigzags,
    zigzagFixable,
    groupAreas,
    autoCheck,
    setAutoCheck,
    armAfterGenerate: () => {
      armed.current = true;
    },
  };
}

/** 일정 카드·요약·추천·점검 상자가 같은 점검 상태를 쓰도록 나눠 준다 */
export const CourseEngineContext = createContext<CourseEngineView | null>(null);
