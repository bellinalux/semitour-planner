"use client";

import { CalendarDays, Check, Hotel, Info, Loader2, Pencil, SearchCheck } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import type { FeeApplySummary } from "@/lib/fees";
import type { AsyncState, CourseMeta, CurrencyCode, DayPlan, PmFreeOption } from "@/types";
import { DayCard } from "./itinerary/DayCard";
import { FxContext } from "./itinerary/FxContext";
import type { ItemPatch } from "./itinerary/TimelineItem";

/** 입장료·체험료 웹 확인 (버튼, 진행 상태, 결과 요약) */
export interface FeeCheckView {
  state: AsyncState;
  /** 확인할 항목 수 */
  targetCount: number;
  summary: FeeApplySummary | null;
  sources: { title: string; url: string }[];
  /** 확인이 검색 근거 없이 이루어졌는지 */
  searched: boolean;
  fxUpdatedAt: string;
  onRun: () => void;
}

interface Props {
  state: AsyncState;
  /** 1 견적통화 = ? 원 (항목별 원화 환산 표기에 쓴다) */
  krwRate: number;
  feeCheck: FeeCheckView;
  days: DayPlan[];
  meta: CourseMeta | null;
  currency: CurrencyCode;
  pmChoice: Record<number, PmFreeOption["id"]>;
  onSelectPm: (day: number, id: PmFreeOption["id"]) => void;
  onChangeItem: (itemId: string, patch: ItemPatch) => void;
  onDeleteItem: (itemId: string) => void;
  onAddItem: (day: number) => void;
  onRetry: () => void;
}

function ItinerarySkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="일정 생성 중">
      {[0, 1].map((day) => (
        <div key={day} className="space-y-3">
          <Skeleton className="h-5 w-40" />
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex gap-3">
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ))}
      <p className="text-center text-xs text-slate-500">일정을 만들고 있습니다. 최대 1분 정도 걸릴 수 있어요.</p>
    </div>
  );
}

function MetaBanner({ meta }: { meta: CourseMeta }) {
  const chips = [
    meta.cities.length > 0 ? meta.cities.join(" → ") : "",
    meta.hotelGrade,
    meta.noShopping ? "노쇼핑" : "",
    meta.noOption ? "노옵션" : "",
  ].filter(Boolean);

  return (
    <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2.5">
      {meta.packageName && <p className="text-xs font-semibold text-indigo-900">{meta.packageName}</p>}
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <Hotel className="h-3.5 w-3.5 text-indigo-500" aria-hidden />
        {chips.map((chip) => (
          <span key={chip} className="rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-indigo-700 ring-1 ring-indigo-100">
            {chip}
          </span>
        ))}
      </div>
    </div>
  );
}

function FeeCheckNotice({ view }: { view: FeeCheckView }) {
  const { state, summary, sources, searched, fxUpdatedAt } = view;
  if (state.status === "error") {
    return <ErrorBanner title="입장료를 확인하지 못했습니다" message={state.error ?? "잠시 후 다시 시도해 주세요."} onRetry={view.onRun} />;
  }
  if (state.status !== "success" || !summary) return null;
  return (
    <div className="space-y-1.5 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-[11px] leading-4 text-slate-700">
      <p className="font-semibold text-emerald-800">
        웹 확인 결과: 반영 {summary.applied}개 · 무료 {summary.free}개 · 입력값과 다름 {summary.differs}개 · 확인 못함 {summary.unverified}개
      </p>
      {!searched && <p className="text-amber-700">웹 검색 근거를 확보하지 못해 금액을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>}
      {summary.differs > 0 && <p>&quot;입력값과 다름&quot; 항목은 직접 입력한 금액을 그대로 두었습니다. 항목의 &quot;확인가 적용&quot; 버튼으로 바꿀 수 있어요.</p>}
      {summary.unverified > 0 && <p>확인하지 못한 항목은 AI 추정 금액 그대로입니다. 판매 전에 예약처나 공식 사이트에서 직접 확인하세요.</p>}
      {sources.length > 0 && (
        <details>
          <summary className="cursor-pointer font-medium text-slate-600">참고한 출처 ({sources.length})</summary>
          <ul className="mt-1 space-y-0.5">
            {sources.map((src) => (
              <li key={src.url}>
                <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                  {src.title}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-slate-400">
        요금은 확인 시점의 참고 정보이며 시즌·요일·환율에 따라 달라질 수 있습니다. 원화 환산에는{" "}
        <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer" className="underline">
          Rates By Exchange Rate API
        </a>
        {fxUpdatedAt ? ` (${fxUpdatedAt} 기준)` : ""}를 사용했습니다.
      </p>
    </div>
  );
}

export function ItineraryPanel({
  state,
  krwRate,
  feeCheck,
  days,
  meta,
  currency,
  pmChoice,
  onSelectPm,
  onChangeItem,
  onDeleteItem,
  onAddItem,
  onRetry,
}: Props) {
  const [editing, setEditing] = useState(false);

  const verifyButton =
    state.status === "success" ? (
      <button
        type="button"
        onClick={feeCheck.onRun}
        disabled={feeCheck.state.status === "loading" || feeCheck.targetCount === 0}
        title="입장료·체험료를 웹에서 검색해 현지 통화 금액으로 확인하고, 원화로 환산해 반영합니다"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {feeCheck.state.status === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <SearchCheck className="h-3.5 w-3.5" aria-hidden />}
        {feeCheck.state.status === "loading" ? "요금 확인 중..." : "입장료 웹 확인"}
      </button>
    ) : undefined;

  const editToggle =
    state.status === "success" ? (
      <button
        type="button"
        aria-pressed={editing}
        onClick={() => setEditing((v) => !v)}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
          editing
            ? "border-indigo-600 bg-indigo-600 text-white"
            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        {editing ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Pencil className="h-3.5 w-3.5" aria-hidden />}
        {editing ? "편집 완료" : "일정 편집"}
      </button>
    ) : undefined;

  return (
    <SectionCard
      title="일정표"
      description={meta ? "붙여넣은 코스를 구조화한 결과입니다. AI가 잘못 읽은 곳은 편집으로 고치세요" : "오전 가이드 투어 + 오후 반자유 일정"}
      icon={CalendarDays}
      action={
        <div className="flex flex-wrap justify-end gap-2">
          {verifyButton}
          {editToggle}
        </div>
      }
    >
      {state.status === "loading" && <ItinerarySkeleton />}

      {state.status === "error" && (
        <ErrorBanner
          title="일정을 생성하지 못했습니다"
          message={state.error ?? "잠시 후 다시 시도해 주세요."}
          onRetry={onRetry}
        />
      )}

      {state.status === "idle" && (
        <EmptyState
          icon={CalendarDays}
          title="아직 생성된 일정이 없습니다"
          description="왼쪽에서 여행지와 기간을 입력하거나 업체 코스를 붙여넣고 버튼을 누르세요."
        />
      )}

      {state.status === "success" && (
        <div className="space-y-4">
          {meta && <MetaBanner meta={meta} />}
          <p className="flex items-start gap-1.5 rounded-md bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-500">
            <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            입장료·식대·소요 시간은 AI 추정치입니다. &quot;입장료 웹 확인&quot;으로 현지 통화 금액을 확인하고, 각 항목의 &quot;현지 지불(불포함)&quot; 버튼으로 고객이 현지에서 직접 내는 항목을 표시하세요. 금액은 직접 수정할 수 있고, 수정하면 견적이 바로 다시 계산됩니다.
          </p>
          <FeeCheckNotice view={feeCheck} />
          <FxContext.Provider value={{ currency, rate: krwRate }}>
          {days.map((plan) => (
            <DayCard
              key={plan.day}
              plan={plan}
              currency={currency}
              selectedPmId={pmChoice[plan.day] ?? "A"}
              editing={editing}
              onSelectPm={(id) => onSelectPm(plan.day, id)}
              onChangeItem={onChangeItem}
              onDeleteItem={onDeleteItem}
              onAddItem={onAddItem}
            />
          ))}
          </FxContext.Provider>
        </div>
      )}
    </SectionCard>
  );
}
