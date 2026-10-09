"use client";

import { Check, CircleAlert, Hotel, Loader2, Minus, Plus, Wand2 } from "lucide-react";
import { useState } from "react";
import type { AutoBuild, BuildStepStatus } from "@/hooks/useAutoBuild";
import type { AutoQuote } from "@/hooks/useAutoQuote";
import { formatMoney } from "@/lib/currency";
import { midpoint } from "@/lib/travelEstimate";
import type { CurrencyCode, TourCandidate } from "@/types";

const STATUS_ICON: Record<BuildStepStatus, React.ReactNode> = {
  pending: <span className="h-3.5 w-3.5 rounded-full border border-slate-300" aria-hidden />,
  running: <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" aria-hidden />,
  done: <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />,
  skipped: <Minus className="h-3.5 w-3.5 text-slate-400" aria-hidden />,
  error: <CircleAlert className="h-3.5 w-3.5 text-amber-600" aria-hidden />,
};

interface Props {
  build: AutoBuild;
  /** 자동 견적(빈 값 채우기) — 자동 구성 안의 한 단계이자, 따로 다시 돌릴 수도 있다 */
  auto: AutoQuote;
  currency: CurrencyCode;
  /** 판매가·도매가에서 시작한 견적이면 예산 안에서 고른다는 안내를 보인다 */
  budgetMode: boolean;
  onAddOption: (tour: TourCandidate) => void;
  onInsertTour: (tour: TourCandidate) => void;
}

/** 자동 견적 세부 단계 (지난 견적 값·환율·차량·가이드·숙박·항공·입장료·경쟁 상품) */
function QuoteSteps({ auto, nested }: { auto: AutoQuote; nested: boolean }) {
  return (
    <ul className={`space-y-0.5 ${nested ? "mt-1 ml-5 border-l border-slate-200 pl-2" : ""}`}>
      {auto.steps.map((step) => (
        <li key={step.key} className="flex items-start gap-2 text-[11px] leading-4">
          <span className="mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center">{STATUS_ICON[step.status]}</span>
          <span className="shrink-0 text-slate-600">{step.label}</span>
          {step.message && <span className={step.status === "error" ? "text-amber-700" : "text-slate-500"}>{step.message}</span>}
          {step.ms !== undefined && step.ms >= 1000 && <span className="ml-auto shrink-0 tabular-nums text-slate-400">{Math.round(step.ms / 1000)}초</span>}
        </li>
      ))}
    </ul>
  );
}

/** "자동 구성" 버튼 — 코스·숙소·차량·가이드·입장료·시세·경쟁 상품·추천 투어를 한 번에 */
export function AutoBuildPanel({ build, auto, currency, budgetMode, onAddOption, onInsertTour }: Props) {
  const money = (v: number) => formatMoney(v, currency);
  const started = build.running || build.steps.some((s) => s.status !== "pending");
  const quoteStarted = auto.running || auto.filledCount !== null;
  const busy = build.running || auto.running;
  const [added, setAdded] = useState<Record<string, string>>({});

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void build.run()}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
      >
        {build.running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Wand2 className="h-4 w-4" aria-hidden />}
        {build.running ? "자동 구성 중... (1~3분)" : started ? "자동 구성 다시 실행" : "자동 구성 — 코스·숙소·차량·투어까지 한 번에"}
      </button>
      <p className="text-[11px] leading-4 text-slate-500">
        코스가 없으면 만들고, 숙소 후보를 찾아 {budgetMode ? "원가 예산 안에서 " : ""}고르고, 차량(인원별 차종)·가이드·입장료·시세·경쟁 상품을 채운 뒤 추천 투어를 보여 줍니다. 직접 정한 값은
        바꾸지 않고, 채운 값은 모두 &quot;추정&quot;으로 표시됩니다.{" "}
        <button type="button" onClick={() => void auto.run()} disabled={busy} className="font-semibold text-indigo-700 underline underline-offset-2 disabled:text-slate-400">
          빈 값만 다시 채우기
        </button>
      </p>

      {(started || quoteStarted) && (
        <ul className="space-y-1 rounded-lg bg-slate-50 p-2.5" aria-live="polite">
          {(started ? build.steps : []).map((step) => (
            <li key={step.key}>
              <div className="flex items-start gap-2 text-[11px] leading-4">
                <span className="mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center">{STATUS_ICON[step.status]}</span>
                <span className="shrink-0 font-medium text-slate-700">{step.label}</span>
                {step.message && step.key !== "quote" && <span className={step.status === "error" ? "text-amber-700" : "text-slate-500"}>{step.message}</span>}
              </div>
              {step.key === "quote" && quoteStarted && <QuoteSteps auto={auto} nested />}
            </li>
          ))}
          {!started && quoteStarted && <QuoteSteps auto={auto} nested={false} />}
          {auto.filledCount !== null && !auto.running && (
            <li className="pt-1 text-[11px] font-semibold text-indigo-800">
              {auto.filledCount > 0 ? `추정값 ${auto.filledCount}건을 채웠습니다. 판매 전에 확인하세요.` : "새로 채운 원가는 없습니다."}
            </li>
          )}
        </ul>
      )}

      {build.hotelChoices.some((c) => c.candidates.length > 1) && (
        <details className="rounded-lg border border-slate-200 bg-white p-2.5 text-[11px]">
          <summary className="cursor-pointer font-medium text-slate-700">
            <Hotel className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            숙소 다른 후보로 바꾸기
          </summary>
          <div className="mt-2 space-y-2">
            {build.hotelChoices.map((choice) => (
              <div key={choice.city}>
                <p className="font-semibold text-slate-700">{choice.city}</p>
                <ul className="mt-1 space-y-1">
                  {choice.candidates.map((h) => {
                    const chosen = choice.picked?.hotel.name === h.name;
                    return (
                      <li key={h.name} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-slate-600">
                          {h.name} <span className="text-slate-400">{h.grade}</span> · 1박 {money(midpoint(h.nightlyLow, h.nightlyHigh))}
                          {h.priceBasis === "estimated" && <span className="text-amber-600"> (추정)</span>}
                        </span>
                        {chosen ? (
                          <span className="shrink-0 font-semibold text-emerald-700">선택됨</span>
                        ) : (
                          <button type="button" onClick={() => build.chooseHotel(choice.city, h)} className="shrink-0 rounded border border-slate-300 px-1.5 py-0.5 hover:bg-slate-50">
                            이 숙소로
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </details>
      )}

      {build.tours.length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-indigo-100 bg-indigo-50/40 p-2.5 text-[11px]">
          <p className="font-semibold text-indigo-900">추천 투어 — 판매가에 넣을지, 선택 옵션으로 둘지 고르세요</p>
          <ul className="space-y-1.5">
            {build.tours.map((t) => (
              <li key={t.name} className="rounded-md bg-white px-2 py-1.5 ring-1 ring-indigo-100">
                <div className="flex flex-wrap items-start justify-between gap-1.5">
                  <span className="min-w-0">
                    <span className="font-semibold text-slate-800">{t.name}</span>
                    <span className="block text-slate-500">
                      1인 {money(midpoint(t.priceLow, t.priceHigh))}
                      {t.market ? ` · ★${t.market.rating.toFixed(1)} (${t.market.reviews})` : ""}
                      {t.koreanGuide ? " · 한국어" : ""}
                    </span>
                  </span>
                  {added[t.name] ? (
                    <span className="font-semibold text-emerald-700">{added[t.name]}</span>
                  ) : (
                    <span className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          onInsertTour(t);
                          setAdded((a) => ({ ...a, [t.name]: "일정에 넣음" }));
                        }}
                        className="inline-flex items-center gap-0.5 rounded border border-indigo-300 bg-indigo-50 px-1.5 py-0.5 font-semibold text-indigo-700 hover:bg-indigo-100"
                      >
                        <Plus className="h-3 w-3" aria-hidden />
                        판매가에 포함
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onAddOption(t);
                          setAdded((a) => ({ ...a, [t.name]: "선택 옵션 추가됨" }));
                        }}
                        className="rounded border border-slate-300 bg-white px-1.5 py-0.5 hover:bg-slate-50"
                      >
                        선택 옵션
                      </button>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
