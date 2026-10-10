"use client";

import { ReorderButton } from "./itinerary/ReorderButton";
import { Accessibility, CalendarDays, Check, Info, Loader2, Pencil, PlaneLanding, PlaneTakeoff, SearchCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SectionCard } from "@/components/ui/SectionCard";
import { groupDaysByCity } from "@/lib/itinerary";
import type { SegmentKind } from "@/lib/segmentLibrary";
import type {
  AsyncState,
  CourseMeta,
  CurrencyCode,
  DayPlan,
  ItineraryItem,
  OptionSuggestion,
  PmFreeOption,
  SearchSource,
  SelectedHotel,
  TourSlot,
  TravelType,
  TripScope,
} from "@/types";
import { DayCard } from "./itinerary/DayCard";
import { CourseEnginePanel } from "./CourseEnginePanel";
import { FxContext } from "./itinerary/FxContext";
import {
  AccessibilityCheckNotice,
  CityGroupHeader,
  DayLoadSummary,
  FeeCheckNotice,
  ItinerarySkeleton,
  MetaBanner,
  OptionSuggestNotice,
  TransferNote,
  TravelTypeBanner,
  type AccessibilityCheckView,
  type FeeCheckView,
  type OptionSuggestView,
} from "./itinerary/ItineraryNotices";
import type { ItemPatch } from "./itinerary/TimelineItem";

export type { AccessibilityCheckView, FeeCheckView, OptionSuggestView };


interface Props {
  /** 코스 엔진 점검 (출발일·출발일 넣기 — 점검 상태는 CourseEngineContext) */
  engine?: { departureDate?: string; onDepartureDate?: (date: string) => void };
  state: AsyncState;
  /** 1 견적통화 = ? 원 (항목별 원화 환산 표기에 쓴다) */
  krwRate: number;
  feeCheck: FeeCheckView;
  optionSuggest: OptionSuggestView;
  accessibilityCheck: AccessibilityCheckView;
  days: DayPlan[];
  meta: CourseMeta | null;
  currency: CurrencyCode;
  travelType: TravelType;
  /** 동선 확인에 쓰는 여행지 (국가·지역) */
  destination: string;
  /** 인원 (동선상 식당을 찾을 때 단체 수용 기준) */
  travelers?: number;
  /** 국내(한국 방문 외국인 대상)/해외 여행. 추천일정 검색 대상 관광객을 정한다 */
  tripScope: TripScope;
  researchInfo: { sources: SearchSource[]; researched: boolean; knowledge?: { city: string; places: number; researched: boolean }[]; fits?: { day: number; note: string }[] };
  pickupNote: string;
  sendingNote: string;
  /** 지역(도시)별로 선택한 숙소. 키는 그 지역 이름(일정의 overnightCity와 같은 문자열) */
  selectedHotels: Record<string, SelectedHotel>;
  pmChoice: Record<number, PmFreeOption["id"]>;
  onSelectPm: (day: number, id: PmFreeOption["id"]) => void;
  onChangeItem: (itemId: string, patch: ItemPatch) => void;
  onChangeDay: (dayNo: number, patch: Partial<DayPlan>) => void;
  onDeleteItem: (itemId: string) => void;
  onAddItem: (day: number) => void;
  onAddSuggestedOption: (suggestion: OptionSuggestion, dayNo: number) => void;
  onMoveItem: (itemId: string, direction: "up" | "down") => void;
  onRelocateItem: (itemId: string, targetDay: number, targetSlot: TourSlot, mode: "move" | "copy") => void;
  onReorderItems: (orderedIds: string[]) => void;
  onInsertItems: (dayNo: number, slot: TourSlot, items: ItineraryItem[]) => void;
  onSaveSegment: (items: ItineraryItem[], kind: SegmentKind, defaultName: string) => void;
  onRetry: () => void;
  /** 지역(도시)만 따로 다시 만들기. AI 모드가 아니면(내 코스 붙여넣기) 표시하지 않는다 */
  canRegenerateRegion: boolean;
  cityRegenState: Record<number, AsyncState>;
  onRegenerateCity: (city: string, dayNumbers: number[]) => void;
}


export function ItineraryPanel({
  state,
  krwRate,
  feeCheck,
  optionSuggest,
  accessibilityCheck,
  days,
  meta,
  currency,
  travelType,
  destination,
  travelers,
  tripScope,
  engine,
  researchInfo,
  pickupNote,
  sendingNote,
  selectedHotels,
  pmChoice,
  onSelectPm,
  onChangeItem,
  onChangeDay,
  onDeleteItem,
  onAddItem,
  onAddSuggestedOption,
  onMoveItem,
  onRelocateItem,
  onReorderItems,
  onInsertItems,
  onSaveSegment,
  onRetry,
  canRegenerateRegion,
  cityRegenState,
  onRegenerateCity,
}: Props) {
  const [editing, setEditing] = useState(false);

  const verifyButton =
    state.status === "success" ? (
      <button
        type="button"
        onClick={feeCheck.onRun}
        disabled={feeCheck.state.status === "loading" || feeCheck.targetCount === 0}
        title="입장료·체험료와 통상적인 체류 시간을 웹에서 검색해 확인하고 반영합니다"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {feeCheck.state.status === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <SearchCheck className="h-3.5 w-3.5" aria-hidden />}
        {feeCheck.state.status === "loading" ? "요금 확인 중..." : "입장료·체류시간 웹 확인"}
      </button>
    ) : undefined;

  const suggestButton =
    state.status === "success" ? (
      <button
        type="button"
        onClick={optionSuggest.onRun}
        disabled={optionSuggest.state.status === "loading" || optionSuggest.targetCount === 0}
        title="바나나보트·수상택시처럼 각 코스에서 팔 만한 선택 옵션을 대형 여행사·예약처 기준으로 웹에서 찾아, 현지 요금과 원화 환산가로 보여줍니다"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-indigo-300 bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-800 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {optionSuggest.state.status === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
        {optionSuggest.state.status === "loading" ? "옵션 찾는 중..." : "코스별 옵션 추천"}
      </button>
    ) : undefined;

  const accessibilityButton =
    state.status === "success" && accessibilityCheck.targetCount > 0 ? (
      <button
        type="button"
        onClick={accessibilityCheck.onRun}
        disabled={accessibilityCheck.state.status === "loading"}
        title="&quot;확인 못함&quot;으로 남은 코스의 휠체어 이용 편의시설을 웹에서 다시 검색합니다"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {accessibilityCheck.state.status === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Accessibility className="h-3.5 w-3.5" aria-hidden />}
        {accessibilityCheck.state.status === "loading" ? "편의시설 재검색 중..." : `이용 편의시설 재검색 (${accessibilityCheck.targetCount})`}
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
      anchorId="itinerary"
      title="일정표"
      description={meta ? "붙여넣은 코스를 구조화한 결과입니다. AI가 잘못 읽은 곳은 편집으로 고치세요" : "오전 가이드 투어 + 오후 반자유 일정"}
      icon={CalendarDays}
      action={
        <div className="flex flex-wrap justify-end gap-2">
          {state.status === "success" && days.length > 0 && <ReorderButton />}
          {verifyButton}
          {suggestButton}
          {accessibilityButton}
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
          <TravelTypeBanner travelType={travelType} researchInfo={researchInfo} />
          {(researchInfo.fits ?? []).length > 0 && (
            <div role="note" aria-label="시간 다듬기" className="rounded-md bg-emerald-50 px-3 py-2 text-[11px] leading-4 text-emerald-900">
              <b>시간을 다듬었습니다</b> (업계 기준: 점심 11:30~13:30, 저녁 18:00~19:30 → 야경·공연)
              <ul className="mt-0.5 space-y-0.5">
                {(researchInfo.fits ?? []).map((f) => (
                  <li key={f.day}>
                    DAY {f.day}: {f.note}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(researchInfo.knowledge ?? []).some((k) => k.places > 0) && (
            <p role="note" aria-label="지식 창고" className="rounded-md bg-indigo-50 px-3 py-2 text-[11px] leading-4 text-indigo-900">
              지식 창고 참고:{" "}
              {(researchInfo.knowledge ?? [])
                .filter((k) => k.places > 0)
                .map((k) => `${k.city} ${k.places}곳${k.researched ? " (이번에 웹에서 새로 조사해 저장)" : ""}`)
                .join(" · ")}
              . 장소 옆 <b>근거</b>는 여행자 후기 인기·다른 여행사 포함·우리 고객 평가·현장 실측입니다.
            </p>
          )}
          <p className="flex items-start gap-1.5 rounded-md bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-500">
            <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            입장료·식대·체류 시간은 AI 추정치입니다. &quot;입장료·체류시간 웹 확인&quot;으로 현지 통화 금액과 통상적인 체류 시간을 확인하고, 각 항목의 &quot;현지 지불(불포함)&quot; 버튼으로 고객이 현지에서 직접 내는 항목을 표시하세요. 금액·시간은 직접 수정할 수 있고, 수정하면 견적과 아래 소요 시간이 바로 다시 계산됩니다.
          </p>
          <DayLoadSummary days={days} pmChoice={pmChoice} />
          {engine && <CourseEnginePanel days={days} departureDate={engine.departureDate} onDepartureDate={engine.onDepartureDate} />}
          <FeeCheckNotice view={feeCheck} />
          <OptionSuggestNotice view={optionSuggest} />
          <AccessibilityCheckNotice view={accessibilityCheck} />
          <TransferNote icon={PlaneLanding} label="공항 픽업" note={pickupNote} />
          <FxContext.Provider value={{ currency, rate: krwRate }}>
            {(() => {
              const dayCard = (plan: DayPlan) => (
                <DayCard
                  key={plan.day}
                  plan={plan}
                  days={days}
                  hotelName={plan.overnightCity ? selectedHotels[plan.overnightCity.trim()]?.name : undefined}
                  destination={destination}
                  travelers={travelers}
                  tripScope={tripScope}
                  currency={currency}
                  selectedPmId={pmChoice[plan.day] ?? "A"}
                  editing={editing}
                  onSelectPm={(id) => onSelectPm(plan.day, id)}
                  onChangeItem={onChangeItem}
                  onChangeDay={onChangeDay}
                  onDeleteItem={onDeleteItem}
                  onAddItem={onAddItem}
                  onAddSuggestedOption={onAddSuggestedOption}
                  onMoveItem={onMoveItem}
                  onRelocateItem={onRelocateItem}
                  onSaveSegment={onSaveSegment}
                  onReorderItems={onReorderItems}
                  onInsertItems={onInsertItems}
                />
              );
              const groups = groupDaysByCity(days);
              const showGroups = groups.filter((g) => g.city).length >= 2;
              if (!showGroups) return <div className="space-y-4">{days.map(dayCard)}</div>;
              return (
                <div className="space-y-5">
                  {groups.map((group, gi) => {
                    if (!group.city) return <div key={gi} className="space-y-4">{group.days.map(dayCard)}</div>;
                    const first = group.days[0].day;
                    const last = group.days[group.days.length - 1].day;
                    const dayRange = first === last ? `DAY ${first}` : `DAY ${first}~${last} · ${group.days.length}일`;
                    return (
                      <div key={gi} className="space-y-3">
                        <CityGroupHeader
                          city={group.city}
                          dayRange={dayRange}
                          canRegenerate={canRegenerateRegion}
                          regenState={cityRegenState[first] ?? { status: "idle" }}
                          onRegenerate={() => onRegenerateCity(group.city, group.days.map((d) => d.day))}
                        />
                        <div className="space-y-4">{group.days.map(dayCard)}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </FxContext.Provider>
          <TransferNote icon={PlaneTakeoff} label="공항 샌딩" note={sendingNote} />
        </div>
      )}
    </SectionCard>
  );
}
