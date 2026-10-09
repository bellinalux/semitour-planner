"use client";

import { createContext, useEffect, useState } from "react";
import { dayTimeRequestDay } from "@/lib/dayTimeFit";
import type { PmChoice } from "@/lib/itinerary";
import type { DayPlan } from "@/types";

export type VerifyStepKey = "quote" | "time" | "engine" | "competitors" | "itineraries";
export type VerifyStepStatus = "pending" | "running" | "done" | "skipped" | "error";

export interface VerifyStep {
  key: VerifyStepKey;
  label: string;
  status: VerifyStepStatus;
  message: string;
}

export interface VerifyPipelineView {
  steps: VerifyStep[];
  /** 진행 중인지 */
  running: boolean;
  /** 처음부터 한 번에 검증한다 */
  start: () => void;
  /** 다 끝난 진행 표시를 닫는다 */
  dismiss: () => void;
}

const STEPS: Pick<VerifyStep, "key" | "label">[] = [
  { key: "quote", label: "시세 조회 (숙박·차량·가이드·팁·보험·항공)" },
  { key: "time", label: "일정 시간 검증 (구역 단위 웹 확인)" },
  { key: "engine", label: "코스 점검 (영업시간·동선·식사·체력 점수)" },
  { key: "competitors", label: "타업체 상품 찾기" },
  { key: "itineraries", label: "타업체 일정·선택관광 가져오기" },
];
const ORDER = STEPS.map((s) => s.key);

interface Args {
  days: DayPlan[];
  pmChoice: PmChoice;
  competitorCount: number;
  autoQuote: { run: () => Promise<void> };
  dayTime: { runAsync: (dayNos: number[]) => Promise<void> };
  engine: { run: () => Promise<void> };
  itineraries: { run: () => Promise<number> };
}

/**
 * 한 번에 검증 — 업체 견적서를 올리면(또는 버튼으로) 시세 조회 → 시간 검증 → 코스 점검 → 타업체 찾기 → 타업체 일정 가져오기를
 * 차례로 돌리고 단계별 진행을 보여 준다. 단계마다 앞 단계 결과(새 입력·새 일정)가 화면에 들어온 다음에 시작한다.
 */
export function useVerifyPipeline({ days, pmChoice, competitorCount, autoQuote, dayTime, engine, itineraries }: Args): VerifyPipelineView {
  const [steps, setSteps] = useState<VerifyStep[]>([]);
  const [stage, setStage] = useState<VerifyStepKey | null>(null);

  const set = (key: VerifyStepKey, status: VerifyStepStatus, message = "") =>
    setSteps((s) => s.map((x) => (x.key === key ? { ...x, status, message } : x)));
  const next = (key: VerifyStepKey) => setStage(ORDER[ORDER.indexOf(key) + 1] ?? null);

  useEffect(() => {
    if (!stage) return;
    const key = stage;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 단계를 시작했다는 표시
    set(key, "running");
    const done = (status: VerifyStepStatus, message = "") => {
      set(key, status, message);
      next(key);
    };
    const run = async () => {
      try {
        if (key === "quote") {
          await autoQuote.run();
          done("done", "비어 있는 시세를 채웠습니다");
        } else if (key === "time") {
          const dayNos = days.filter((d) => dayTimeRequestDay(d, pmChoice) !== null).map((d) => d.day);
          if (dayNos.length === 0) return done("skipped", "방문지가 2곳 이상인 날이 없습니다");
          await dayTime.runAsync(dayNos);
          done("done", `DAY ${dayNos.join(", ")} 확인`);
        } else if (key === "engine") {
          await engine.run();
          done("done", "날짜별 점수는 일정 카드와 코스 점검에서 확인");
        } else if (key === "competitors") {
          done(competitorCount > 0 ? "done" : "skipped", competitorCount > 0 ? `${competitorCount}개 비교 중` : "가격이 확인된 타업체 상품을 찾지 못했습니다");
        } else {
          if (competitorCount === 0) return done("skipped", "비교할 타업체 상품이 없습니다");
          const found = await itineraries.run();
          done("done", `${found}개 상품의 날짜별 일정을 읽었습니다`);
        }
      } catch (err) {
        done("error", err instanceof Error ? err.message : "확인하지 못했습니다");
      }
    };
    void run();
    // 단계가 바뀔 때만 — 그 시점 화면의 최신 입력·일정으로 돈다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  return {
    steps,
    running: stage !== null,
    start: () => {
      if (stage) return;
      setSteps(STEPS.map((s) => ({ ...s, status: "pending", message: "" })));
      setStage("quote");
    },
    dismiss: () => {
      if (!stage) setSteps([]);
    },
  };
}

/** 요약·추천과 업체 견적 검증에서 같은 진행 상태를 쓴다 */
export const VerifyPipelineContext = createContext<VerifyPipelineView | null>(null);
