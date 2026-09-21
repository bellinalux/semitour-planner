"use client";

import { CalendarDays, Check, Hotel, Info, Pencil } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import type { AsyncState, CourseMeta, CurrencyCode, DayPlan, PmFreeOption } from "@/types";
import { DayCard } from "./itinerary/DayCard";
import type { ItemPatch } from "./itinerary/TimelineItem";

interface Props {
  state: AsyncState;
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

export function ItineraryPanel({
  state,
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
      action={editToggle}
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
            입장료·식대·소요 시간은 AI 추정치입니다. 금액은 직접 수정할 수 있고, 수정하면 견적이 바로 다시 계산됩니다.
          </p>
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
        </div>
      )}
    </SectionCard>
  );
}
