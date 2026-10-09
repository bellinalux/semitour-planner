"use client";

import { createContext, useState } from "react";
import { postJson } from "@/lib/api";
import { dayMeetingTime } from "@/lib/dayLoad";
import { dayTimeRequestDay, fitDayTimes } from "@/lib/dayTimeFit";
import type { PmChoice } from "@/lib/itinerary";
import { refitMealWindows } from "@/lib/mealTiming";
import type { DayTimeResponse } from "@/lib/schemas/dayTime";
import type { DayPlan, TripInput } from "@/types";

export interface DayTimeCheckView {
  /** 지금 확인 중인 날 */
  running: number[] | null;
  message: string | null;
  error: string | null;
  canUndo: boolean;
  run: (dayNos: number[]) => void;
  undo: () => void;
}

/**
 * 일정 시간 검증 — 고른 날의 방문 순서를 통째로 웹에서 확인해(구역 단위) 체류·이동 시간을 맞춘다. 되돌리기 가능.
 * 시간이 바뀌면 식사 맞춤 자유시간도 다시 계산한다(귀국편이 있는 마지막 날은 출발 시각이 어긋나지 않게 그대로 둔다).
 */
export function useDayTimeCheck({
  input,
  days,
  pmChoice,
  replaceDays,
}: {
  input: TripInput;
  days: DayPlan[];
  pmChoice: PmChoice;
  replaceDays: (days: DayPlan[]) => void;
}): DayTimeCheckView {
  const [running, setRunning] = useState<number[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<DayPlan[] | null>(null);

  const run = async (dayNos: number[]) => {
    if (running) return;
    const reqDays = days
      .filter((d) => dayNos.includes(d.day))
      .map((d) => dayTimeRequestDay(d, pmChoice))
      .filter((d): d is NonNullable<typeof d> => d !== null);
    setError(null);
    if (reqDays.length === 0) {
      setMessage("방문 장소가 2곳 이상인 날만 확인할 수 있습니다.");
      return;
    }
    setRunning(reqDays.map((d) => d.day));
    setMessage(null);
    try {
      const r = await postJson<DayTimeResponse>("/api/verify-day-time", { destination: input.destination.trim(), days: reqDays });
      const byDay = new Map(r.days.map((d) => [d.day, d]));
      const lastIndex = days.length - 1;
      const next = days.map((d, i) => {
        const res = byDay.get(d.day);
        if (!res || res.areas.length === 0) return d;
        const fitted = fitDayTimes(d, res.areas, r.checkedAt);
        const keepFlightTiming = i === lastIndex && fitted.items.some((x) => x.type === "flight");
        return fitted.kind === "linear" && !keepFlightTiming ? { ...fitted, items: refitMealWindows(fitted.items, dayMeetingTime(fitted)) } : fitted;
      });
      const changed = r.days.filter((d) => d.areas.length > 0).map((d) => d.day);
      if (changed.length === 0) {
        setMessage("웹에서 근거 있는 소요 시간을 찾지 못해 바꾸지 않았습니다. 잠시 후 다시 시도하거나 직접 고쳐 주세요.");
        return;
      }
      setSnapshot(days);
      replaceDays(next);
      const missed = reqDays.map((d) => d.day).filter((n) => !changed.includes(n));
      setMessage(
        `DAY ${changed.join(", ")} 체류·이동 시간을 구역 기준으로 맞췄습니다${missed.length > 0 ? ` (DAY ${missed.join(", ")}는 근거를 찾지 못해 그대로)` : ""}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "일정 시간을 확인하지 못했습니다.");
    } finally {
      setRunning(null);
    }
  };

  const undo = () => {
    if (!snapshot) return;
    replaceDays(snapshot);
    setSnapshot(null);
    setMessage("시간 검증 전으로 되돌렸습니다.");
  };

  return { running, message, error, canUndo: snapshot !== null, run: (dayNos) => void run(dayNos), undo };
}

/** 일정 카드에서 "시간 검증" 버튼을 쓰도록 나눠 준다 (여러 단계 아래 컴포넌트까지 props로 넘기지 않으려고) */
export const DayTimeCheckContext = createContext<DayTimeCheckView | null>(null);
