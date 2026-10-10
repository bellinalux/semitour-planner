"use client";

import { AlertTriangle, CheckCircle2, ClipboardCopy, Info, Lightbulb } from "lucide-react";
import { useState } from "react";
import { BuildProgress } from "@/components/dashboard/BuildProgress";
import type { SettingsSection } from "@/components/form/settingsFocus";
import type { AutoBuild } from "@/hooks/useAutoBuild";
import type { AutoQuote } from "@/hooks/useAutoQuote";
import type { BudgetFitView } from "@/hooks/useBudgetFit";
import type { CompetitorAutoFindView } from "@/hooks/useCompetitorAutoFind";
import type { VerifyPipelineView, VerifyStepStatus } from "@/hooks/useVerifyPipeline";
import type { CourseEngineView } from "@/hooks/useCourseEngine";
import type { DayTimeCheckView } from "@/hooks/useDayTimeCheck";
import type { Insight, InsightAction, KeyNumbers } from "@/lib/insights";
import type { CostKey, TourCandidate, TripInput } from "@/types";

interface Props {
  input: TripInput;
  numbers: KeyNumbers | null;
  insights: Insight[];
  budgetFit: BudgetFitView | null;
  build: AutoBuild;
  auto: AutoQuote;
  money: (v: number) => string;
  onFocus: (section: SettingsSection) => void;
  /** 결과 화면의 이 id로 이동 (좁은 화면이면 결과 탭으로 바꾼 뒤) */
  onScrollTo: (id: string) => void;
  onAddTourOption: (tour: TourCandidate) => void;
  onInsertTour: (tour: TourCandidate) => void;
  /** 확인된 항공편 시각으로 일정표의 항공 시각을 다시 맞춘다 */
  onFixFlight: () => void;
  /** 하루 일정 시간 검증 (구역 단위) */
  dayTime: DayTimeCheckView;
  /** 코스 엔진 점검 (날짜 사이 옮기기·되돌리기) */
  engine: CourseEngineView;
  /** 타업체 상품 자동 찾기 */
  competitorFind: CompetitorAutoFindView;
  /** 한 번에 검증 (시세 → 시간 검증 → 코스 점검 → 타업체 찾기 → 타업체 일정) */
  pipeline: VerifyPipelineView;
  /** 추정 원가를 "확인함"으로 */
  onConfirmCosts: (keys: CostKey[]) => void;
  /** 지금 환율로 외화 업체 공급가를 다시 계산 */
  onApplyFx?: () => void;
}

const STEP_MARK: Record<VerifyStepStatus, { mark: string; tone: string }> = {
  pending: { mark: "○", tone: "text-slate-400" },
  running: { mark: "…", tone: "text-indigo-700 font-semibold" },
  done: { mark: "✓", tone: "text-emerald-700" },
  skipped: { mark: "–", tone: "text-slate-500" },
  error: { mark: "!", tone: "text-red-600" },
};

/** 한 번에 검증 진행 — 단계별 상태와 결과 한 줄 */
function PipelineCard({ pipeline, canStart }: { pipeline: VerifyPipelineView; canStart: boolean }) {
  if (pipeline.steps.length === 0) {
    if (!canStart) return null;
    return (
      <button
        type="button"
        onClick={pipeline.start}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-left text-[11px] text-indigo-900 hover:bg-indigo-100"
      >
        <span>
          <b className="block text-xs">한 번에 검증</b>
          시세 조회 → 시간 검증 → 코스 점검 → 타업체 찾기 → 타업체 일정까지 차례로
        </span>
        <span className="shrink-0 rounded-md bg-indigo-600 px-2 py-1 font-semibold text-white">시작</span>
      </button>
    );
  }
  const finished = !pipeline.running;
  return (
    <section aria-label="한 번에 검증" className="rounded-xl border border-indigo-200 bg-white p-3 text-[11px] leading-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-indigo-950">{finished ? "한 번에 검증 완료" : "한 번에 검증 중… (몇 분 걸립니다, 다른 작업을 해도 됩니다)"}</p>
        {finished && (
          <button type="button" onClick={pipeline.dismiss} className="font-semibold text-slate-500 underline underline-offset-2">
            닫기
          </button>
        )}
      </div>
      <ol className="mt-1.5 space-y-1">
        {pipeline.steps.map((s) => (
          <li key={s.key} className="flex gap-1.5">
            <span className={`w-3 shrink-0 text-center ${STEP_MARK[s.status].tone}`} aria-hidden>
              {STEP_MARK[s.status].mark}
            </span>
            <span className={`min-w-0 flex-1 text-pretty ${STEP_MARK[s.status].tone}`}>
              {s.label}
              {s.message && <span className="block font-normal text-slate-500">{s.message}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** 한 번에 보여 줄 추천 수 — 처음 쓰는 사람이 부담스럽지 않게 */
const SHOW = 5;

const TONE = {
  warn: { icon: AlertTriangle, box: "border-amber-200 bg-amber-50", text: "text-amber-900", button: "bg-amber-600 hover:bg-amber-700 text-white" },
  info: { icon: Info, box: "border-slate-200 bg-white", text: "text-slate-800", button: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50" },
  good: {
    icon: CheckCircle2,
    box: "border-emerald-200 bg-emerald-50",
    text: "text-emerald-900",
    button: "border border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100",
  },
} as const;

function NumbersCard({ numbers, money }: { numbers: KeyNumbers; money: (v: number) => string }) {
  return (
    <section aria-label="핵심 숫자" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-medium text-slate-500">{numbers.priceLabel} (1인, 2인 1실)</p>
      <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">{money(numbers.pricePerPerson)}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <dt className="text-slate-500">1인 원가</dt>
          <dd className="font-semibold tabular-nums text-slate-800">{money(numbers.costPerPerson)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">1인 회사 수익</dt>
          <dd className={`font-semibold tabular-nums ${numbers.profitPerPerson < 0 ? "text-red-600" : "text-slate-800"}`}>{money(numbers.profitPerPerson)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">수익률</dt>
          <dd className={`font-semibold tabular-nums ${numbers.marginRate < 0 ? "text-red-600" : "text-slate-800"}`}>{numbers.marginRate.toFixed(1)}%</dd>
        </div>
      </dl>
      {numbers.status.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-[11px] leading-4">
          {numbers.status.map((s) => (
            <li
              key={s.text}
              className={`text-pretty ${s.tone === "warn" ? "font-medium text-amber-800" : s.tone === "good" ? "text-emerald-700" : "text-slate-600"}`}
            >
              {s.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * 레이아웃3 — 요약·추천. 지금 견적의 핵심 숫자(판매가·원가·수익)를 위에 두고, 고치면 좋은 것을 중요한 순서로 보여 주며
 * 버튼으로 바로 적용한다(예산 맞추기·올리기·입력 폴더 열기·질문 복사). 자동 구성 진행도 여기서 본다.
 */
export function InsightPanel({ input, numbers, insights, budgetFit, build, auto, money, onFocus, onScrollTo, onAddTourOption, onInsertTour, onFixFlight, dayTime, engine, competitorFind, pipeline, onConfirmCosts, onApplyFx }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const visible = showAll ? insights : insights.slice(0, SHOW);

  const run = async (insight: Insight, action: InsightAction) => {
    switch (action.kind) {
      case "focus":
        onFocus(action.section);
        break;
      case "scroll":
        onScrollTo(action.target);
        break;
      case "fix-flight":
        onFixFlight();
        break;
      case "fix-day-time":
        dayTime.run(action.days);
        break;
      case "apply-fx":
        onApplyFx?.();
        break;
      case "confirm-costs":
        onConfirmCosts(action.keys);
        break;
      case "find-competitors":
        competitorFind.run(input);
        break;
      case "group-areas":
        engine.groupAreas(action.day);
        break;
      case "engine-move":
        engine.fix(action.move.fromDay, { reorder: false, move: action.move, addBreak: false });
        break;
      case "budget-apply":
        budgetFit?.apply();
        break;
      case "budget-undo":
        budgetFit?.undo();
        break;
      case "upgrade":
        budgetFit?.upgrade(action.upgrade);
        break;
      case "copy":
        try {
          await navigator.clipboard.writeText(action.text);
          setCopied(insight.id);
        } catch {
          setCopied(null);
        }
        break;
    }
  };

  return (
    <div className="space-y-3">
      <PipelineCard pipeline={pipeline} canStart={numbers !== null} />
      {numbers ? (
        <NumbersCard numbers={numbers} money={money} />
      ) : (
        <section aria-label="핵심 숫자" className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-[11px] leading-4 text-slate-500">
          <p className="text-sm font-semibold text-slate-700">아직 견적이 없습니다</p>
          <p className="mt-1 text-pretty">왼쪽 1~3번을 채우고 아래 &lsquo;자동 구성&rsquo;을 누르면 여기에 판매가·원가·수익과 추천이 나옵니다.</p>
        </section>
      )}

      <section aria-label="추천" className="space-y-2">
        <h2 className="flex items-center gap-1.5 text-balance text-xs font-semibold text-slate-700">
          <Lightbulb className="size-3.5 text-indigo-600" aria-hidden />
          추천 · 할 일 {insights.length > 0 && <span className="tabular-nums text-slate-400">{insights.length}</span>}
        </h2>
        {(dayTime.running || dayTime.message || dayTime.error) && (
          <p
            role={dayTime.error ? "alert" : "status"}
            className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-[11px] leading-4 ${dayTime.error ? "border-red-200 bg-red-50 text-red-700" : "border-indigo-200 bg-indigo-50 text-indigo-900"}`}
          >
            <span className="min-w-0 flex-1 text-pretty">
              {dayTime.running ? `DAY ${dayTime.running.join(", ")} 일정 시간을 웹에서 확인하는 중... (1분 안팎)` : (dayTime.error ?? dayTime.message)}
            </span>
            {dayTime.canUndo && !dayTime.running && (
              <button type="button" onClick={dayTime.undo} className="shrink-0 font-semibold underline underline-offset-2">
                되돌리기
              </button>
            )}
          </p>
        )}
        {(competitorFind.running || competitorFind.message) && (
          <p role="status" className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] leading-4 text-indigo-900 text-pretty">
            {competitorFind.running ? "타업체 상품을 찾아 비교하는 중... (30초~1분)" : competitorFind.message}
          </p>
        )}
        {(engine.canUndo || engine.running) && (
          <p role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] leading-4 text-indigo-900">
            <span className="min-w-0 flex-1 text-pretty">{engine.running ? "코스 엔진이 일정을 채점하는 중... (하루 10~40초)" : "엔진 추천을 일정에 적용했습니다."}</span>
            {engine.canUndo && (
              <button type="button" onClick={engine.undo} className="shrink-0 font-semibold underline underline-offset-2">
                되돌리기
              </button>
            )}
          </p>
        )}
        {insights.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
            {numbers ? "지금은 고칠 것이 없습니다." : "견적이 만들어지면 고칠 것을 알려 드립니다."}
          </p>
        ) : (
          <ul className="space-y-2">
            {visible.map((insight, index) => {
              const tone = TONE[insight.tone];
              const Icon = tone.icon;
              // 맨 위 하나는 "지금 할 일" — 초보자가 어디서 시작할지 바로 보이게
              const first = index === 0;
              return (
                <li key={insight.id} className={`rounded-lg border p-3 text-[11px] leading-4 ${tone.box} ${first ? "ring-2 ring-indigo-300" : ""}`}>
                  {first && <span className="mb-1 inline-block rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">지금 할 일</span>}
                  <p className={`flex items-start gap-1.5 font-semibold ${tone.text}`}>
                    <Icon className="mt-px size-3.5 shrink-0" aria-hidden />
                    <span className="text-pretty">{insight.title}</span>
                  </p>
                  {insight.detail && <p className="mt-1 line-clamp-3 text-pretty text-slate-600">{insight.detail}</p>}
                  {insight.action && (
                    <button
                      type="button"
                      onClick={() => void run(insight, insight.action!)}
                      disabled={insight.action.kind === "fix-day-time" && dayTime.running !== null}
                      className={`mt-2 inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-semibold ${tone.button}`}
                    >
                      {insight.action.kind === "copy" && <ClipboardCopy className="size-3.5" aria-hidden />}
                      {insight.action.kind === "copy" && copied === insight.id ? "복사했습니다" : insight.action.label}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {insights.length > SHOW && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="text-[11px] font-semibold text-indigo-700 underline underline-offset-2">
            {showAll ? "접기" : `${insights.length - SHOW}개 더 보기`}
          </button>
        )}
      </section>

      <BuildProgress input={input} build={build} auto={auto} onAddTourOption={onAddTourOption} onInsertTour={onInsertTour} onFocus={onFocus} />
    </div>
  );
}
