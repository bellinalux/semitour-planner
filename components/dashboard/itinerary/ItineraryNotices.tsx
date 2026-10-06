"use client";

import { Clock3, Hotel, Loader2, MapPin, PlaneLanding, RefreshCw } from "lucide-react";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { Skeleton } from "@/components/ui/Skeleton";
import type { AccessibilityApplySummary } from "@/lib/accessibilityCheck";
import { calcAllDayLoads } from "@/lib/dayLoad";
import { TRAVEL_TYPES } from "@/lib/defaults";
import type { FeeApplySummary } from "@/lib/fees";
import type { OptionSuggestApplySummary } from "@/lib/optionSuggestions";
import type { AsyncState, CourseMeta, DayPlan, PmFreeOption, SearchSource, TravelType } from "@/types";

/** 일정 패널 위·아래에 붙는 안내 배너들 (웹 확인 결과, 출처, 지역 헤더 등) */

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

/** 코스별 선택 옵션 추천 (버튼, 진행 상태, 결과 요약) */
export interface OptionSuggestView {
  state: AsyncState;
  /** 조사할 코스 수 */
  targetCount: number;
  summary: OptionSuggestApplySummary | null;
  sources: { title: string; url: string }[];
  /** 조사가 검색 근거 없이 이루어졌는지 */
  searched: boolean;
  onRun: () => void;
}

/** 이용 편의시설(확인 못함) 재검색 (버튼, 진행 상태, 결과 요약) */
export interface AccessibilityCheckView {
  state: AsyncState;
  /** "확인 못함"으로 남아 재검색할 코스 수 */
  targetCount: number;
  summary: AccessibilityApplySummary | null;
  sources: { title: string; url: string }[];
  searched: boolean;
  onRun: () => void;
}

function SourceList({ sources, tone }: { sources: { title: string; url: string }[]; tone: string }) {
  if (sources.length === 0) return null;
  return (
    <details>
      <summary className={`cursor-pointer font-medium ${tone}`}>참고한 출처 ({sources.length})</summary>
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
  );
}

export function ItinerarySkeleton() {
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

export function MetaBanner({ meta }: { meta: CourseMeta }) {
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

/** 세미투어가 아닌 유형으로 생성했을 때, 반영한 유형과 웹 조사 출처를 보여준다 */
export function TravelTypeBanner({ travelType, researchInfo }: { travelType: TravelType; researchInfo: { sources: SearchSource[]; researched: boolean } }) {
  if (travelType === "semi") return null;
  const label = TRAVEL_TYPES.find((t) => t.id === travelType)?.label ?? travelType;
  return (
    <div className="space-y-1 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2.5 text-[11px] leading-4 text-indigo-900">
      <p className="font-semibold">
        &quot;{label}&quot; 특성을 반영해 만든 일정입니다
        {travelType === "accessible" && !researchInfo.researched && (
          <span className="ml-1 font-normal text-amber-700">— 이용 편의시설 확인에 필요한 웹 검색 근거를 확보하지 못해, 각 항목의 확인 정도가 &quot;확인 못함&quot;으로 표시됩니다. 실제 방문 전 다시 확인하세요.</span>
        )}
      </p>
      {researchInfo.sources.length > 0 && (
        <details>
          <summary className="cursor-pointer font-medium text-indigo-700">참고한 출처 ({researchInfo.sources.length})</summary>
          <ul className="mt-1 space-y-0.5">
            {researchInfo.sources.map((src) => (
              <li key={src.url}>
                <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                  {src.title}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function TransferNote({ icon: Icon, label, note }: { icon: typeof PlaneLanding; label: string; note: string }) {
  if (!note.trim()) return null;
  return (
    <p className="flex items-start gap-1.5 rounded-md border border-sky-100 bg-sky-50/60 px-3 py-2 text-[11px] leading-4 text-sky-900">
      <Icon className="mt-px h-3.5 w-3.5 shrink-0 text-sky-500" aria-hidden />
      <span>
        <span className="font-semibold">{label}: </span>
        {note.trim()}
      </span>
    </p>
  );
}

export function FeeCheckNotice({ view }: { view: FeeCheckView }) {
  const { state, summary, sources, searched, fxUpdatedAt } = view;
  if (state.status === "error") {
    return <ErrorBanner title="입장료를 확인하지 못했습니다" message={state.error ?? "잠시 후 다시 시도해 주세요."} onRetry={view.onRun} />;
  }
  if (state.status !== "success" || !summary) return null;
  return (
    <div className="space-y-1.5 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-[11px] leading-4 text-slate-700">
      <p className="font-semibold text-emerald-800">
        웹 확인 결과: 반영 {summary.applied}개 · 무료 {summary.free}개 · 입력값과 다름 {summary.differs}개 · 확인 못함 {summary.unverified}개
        {summary.stayUpdated > 0 ? ` · 체류 시간 반영 ${summary.stayUpdated}개` : ""}
        {summary.reclassifiedAsMeal > 0 ? ` · 식당으로 재분류 ${summary.reclassifiedAsMeal}개` : ""}
      </p>
      {!searched && <p className="text-amber-700">웹 검색 근거를 확보하지 못해 금액·체류 시간을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>}
      {summary.reclassifiedAsMeal > 0 && (
        <p>다른 유형으로 분류돼 있던 항목이 실제로는 식당·카페로 확인돼 식사로 바로잡았습니다. 일정에서 식사 시간대가 자연스러운지 다시 확인하세요.</p>
      )}
      {summary.differs > 0 && <p>&quot;입력값과 다름&quot; 항목은 직접 입력한 금액을 그대로 두었습니다. 항목의 &quot;확인가 적용&quot; 버튼으로 바꿀 수 있어요.</p>}
      {summary.unverified > 0 && <p>확인하지 못한 항목은 AI 추정 금액 그대로입니다. 판매 전에 예약처나 공식 사이트에서 직접 확인하세요.</p>}
      <SourceList sources={sources} tone="text-slate-600" />
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

export function OptionSuggestNotice({ view }: { view: OptionSuggestView }) {
  const { state, summary, sources, searched } = view;
  if (state.status === "error") {
    return <ErrorBanner title="선택 옵션을 찾지 못했습니다" message={state.error ?? "잠시 후 다시 시도해 주세요."} onRetry={view.onRun} />;
  }
  if (state.status !== "success" || !summary) return null;
  return (
    <div className="space-y-1.5 rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 text-[11px] leading-4 text-slate-700">
      <p className="font-semibold text-indigo-800">
        웹 조사 결과: 옵션을 찾은 코스 {summary.coursesWithOptions}개 · 확인된 옵션 {summary.confirmedOptions}개 · 어울리는 옵션 없음 {summary.noMatch}개
      </p>
      {!searched && <p className="text-amber-700">웹 검색 근거를 확보하지 못해 옵션을 찾지 못했습니다. 잠시 후 다시 시도해 주세요.</p>}
      <p>코스마다 나온 &quot;선택 옵션으로 추가&quot; 버튼을 누르면 견적의 선택 옵션에 들어가고, 매출 시뮬레이션에도 바로 반영됩니다.</p>
      <SourceList sources={sources} tone="text-indigo-700" />
      <p className="text-slate-400">요금은 검색 시점의 참고 정보입니다. 판매 전에 예약처에서 날짜별 요금과 예약 가능 여부를 확인하세요.</p>
    </div>
  );
}

export function AccessibilityCheckNotice({ view }: { view: AccessibilityCheckView }) {
  const { state, summary, sources, searched } = view;
  if (state.status === "error") {
    return <ErrorBanner title="이용 편의시설을 확인하지 못했습니다" message={state.error ?? "잠시 후 다시 시도해 주세요."} onRetry={view.onRun} />;
  }
  if (state.status !== "success" || !summary) return null;
  return (
    <div className="space-y-1.5 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-[11px] leading-4 text-slate-700">
      <p className="font-semibold text-emerald-800">
        재검색 결과: 새로 확인됨 {summary.confirmed}개 · 여전히 확인 못함 {summary.stillUnknown}개
      </p>
      {!searched && <p className="text-amber-700">웹 검색 근거를 확보하지 못해 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>}
      {summary.stillUnknown > 0 && (
        <p>여전히 확인 못한 코스는 인쇄되는 여행일정표에는 표시되지 않습니다(화면에서만 &quot;확인 못함&quot;으로 보입니다). 방문 전 직접 확인하거나 필요하면 다시 재검색하세요.</p>
      )}
      <SourceList sources={sources} tone="text-emerald-700" />
    </div>
  );
}

/** 이동·체류 시간을 더해 하루에 소화하기 빠듯하거나 넘치는 날짜를 한눈에 보여준다 (해당 날짜가 없으면 표시하지 않는다) */
export function DayLoadSummary({ days, pmChoice }: { days: DayPlan[]; pmChoice: Record<number, PmFreeOption["id"]> }) {
  const loads = calcAllDayLoads(days, pmChoice);
  const overloaded = loads.filter((l) => l.level === "overloaded");
  const tight = loads.filter((l) => l.level === "tight");
  if (overloaded.length === 0 && tight.length === 0) return null;

  const tone = overloaded.length > 0 ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-800";
  const label = (l: (typeof loads)[number]) => `DAY ${l.day}`;
  return (
    <p className={`flex items-start gap-1.5 rounded-md border px-3 py-2 text-[11px] leading-4 ${tone}`}>
      <Clock3 className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        이동·체류 시간을 더하면{" "}
        {overloaded.length > 0 && <>하루에 소화하기 어려운 날짜: <strong>{overloaded.map(label).join(", ")}</strong>{tight.length > 0 && " · "}</>}
        {tight.length > 0 && <>빠듯한 날짜: <strong>{tight.map(label).join(", ")}</strong></>}. 아래에서 코스를 조정하세요.
      </span>
    </p>
  );
}

/** 연속된 같은 숙박 도시 구간의 헤더. 다지역 여행(2개 이상 도시)일 때만 표시된다. */
export function CityGroupHeader({
  city,
  dayRange,
  canRegenerate,
  regenState,
  onRegenerate,
}: {
  city: string;
  dayRange: string;
  canRegenerate: boolean;
  regenState: AsyncState;
  onRegenerate: () => void;
}) {
  const loading = regenState.status === "loading";
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900 px-3 py-2 text-white">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <MapPin className="h-4 w-4" aria-hidden />
          {city}
          <span className="font-normal text-slate-300">· {dayRange}</span>
        </div>
        {canRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            disabled={loading}
            title={`${city} 구간만 새로 만듭니다. 다른 지역의 일정은 그대로 유지됩니다.`}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/30 bg-white/10 px-2.5 py-1 text-xs font-medium text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
            {loading ? "다시 만드는 중..." : "이 지역만 다시 만들기"}
          </button>
        )}
      </div>
      {regenState.status === "error" && (
        <p className="rounded-md bg-red-50 px-2.5 py-2 text-[11px] text-red-700">{regenState.error ?? "다시 만들기에 실패했습니다."}</p>
      )}
    </div>
  );
}
