import { CalendarDays, Info } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import type { AsyncState, CurrencyCode, DayPlan, PmFreeOption } from "@/types";
import { DayCard } from "./itinerary/DayCard";
import type { ItemCostPatch } from "./itinerary/TimelineItem";

interface Props {
  state: AsyncState;
  days: DayPlan[];
  currency: CurrencyCode;
  pmChoice: Record<number, PmFreeOption["id"]>;
  onSelectPm: (day: number, id: PmFreeOption["id"]) => void;
  onChangeCost: (itemId: string, patch: ItemCostPatch) => void;
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
      <p className="text-center text-xs text-slate-500">AI가 일정을 설계하고 있습니다. 최대 1분 정도 걸릴 수 있어요.</p>
    </div>
  );
}

export function ItineraryPanel({ state, days, currency, pmChoice, onSelectPm, onChangeCost, onRetry }: Props) {
  return (
    <SectionCard title="일정표" description="오전 가이드 투어 + 오후 반자유 일정" icon={CalendarDays}>
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
          description="왼쪽에서 여행지와 기간을 입력하고 '일정·견적 생성'을 누르세요."
        />
      )}

      {state.status === "success" && (
        <div className="space-y-4">
          <p className="flex items-start gap-1.5 rounded-md bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-500">
            <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            입장료·식대·이동 시간은 AI 추정치입니다. 금액은 직접 수정할 수 있고, 수정하면 견적이 바로 다시 계산됩니다.
          </p>
          {days.map((plan) => (
            <DayCard
              key={plan.day}
              plan={plan}
              currency={currency}
              selectedPmId={pmChoice[plan.day] ?? "A"}
              onSelectPm={(id) => onSelectPm(plan.day, id)}
              onChangeCost={onChangeCost}
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
