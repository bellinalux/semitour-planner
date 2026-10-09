import { Loader2, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import type { CourseFile } from "@/lib/courseFile";
import type { FlightOption, TripInput } from "@/types";
import { OneLineRequest } from "./OneLineRequest";
import { QuickSettingsSection } from "./QuickSettingsSection";
import { SalesSetupSection } from "./SalesSetupSection";
import { TripBasicsSection } from "./TripBasicsSection";

interface Props {
  input: TripInput;
  onChange: (patch: Partial<TripInput>) => void;
  onReset: () => void;
  onGenerate: () => void;
  /** 자동 구성 (코스·숙소·차량·견적·투어 한 번에) */
  onAutoBuild: () => void;
  autoBuilding: boolean;
  /** 자동 구성 진행 한 줄 (지금 하는 단계 또는 결과). 진행 목록은 설정 화면에 있다 */
  autoStatus?: string;
  onShowProgress?: () => void;
  isGenerating: boolean;
  courseFile: CourseFile | null;
  onCourseFileChange: (file: CourseFile | null) => void;
  /** 항공편을 고르면 일정·항공료·일수·숙박 수를 맞춘다 */
  onApplyFlight: (flight: FlightOption) => void;
}

/** 레이아웃1: 코스를 만들 때 꼭 필요한 입력만 둔다. 원가·가격·채널·경쟁사·문서 설정은 코스를 만든 뒤 레이아웃3(설정)에서 한다. */
export function TripInputForm({ input, onChange, onReset, onGenerate, isGenerating, courseFile, onCourseFileChange, onApplyFlight, onAutoBuild, autoBuilding, autoStatus, onShowProgress }: Props) {
  const isPaste = input.mode === "paste";
  const canGenerate = isPaste
    ? input.courseText.trim().length >= 20 || courseFile !== null
    : input.destination.trim().length > 0 &&
      input.days >= (input.includesFlights ? 3 : 1) &&
      input.travelers >= 1;

  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (canGenerate && !isGenerating) onGenerate();
      }}
    >
      <div className="flex-1 space-y-4 p-4">
        {!isPaste && <OneLineRequest input={input} onChange={onChange} />}
        <TripBasicsSection input={input} onChange={onChange} courseFile={courseFile} onCourseFileChange={onCourseFileChange} />
        <SalesSetupSection input={input} onChange={onChange} autoBuild={{ run: onAutoBuild, running: autoBuilding, disabled: !canGenerate || isGenerating }} />
        <QuickSettingsSection input={input} onChange={onChange} onApplyFlight={onApplyFlight} />
        <p className="text-pretty rounded-lg bg-white px-3 py-2.5 text-[11px] leading-4 text-slate-500 ring-1 ring-slate-200">
          아래 <span className="font-medium text-slate-700">자동 구성</span>을 누르면 코스 → 숙소 → 차량·가이드·입장료·시세 → 경쟁 상품 → 추천 투어까지 한 번에 채웁니다. 아는 비용은 설정에서
          먼저 넣어 두면 그 값을 그대로 씁니다.
        </p>
      </div>

      <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        {autoStatus && (
          <p role="status" className="mb-2 flex items-center gap-2 text-pretty text-[11px] leading-4 text-slate-600">
            <span className="min-w-0 flex-1 truncate">{autoStatus}</span>
            {onShowProgress && (
              <button type="button" onClick={onShowProgress} className="shrink-0 font-semibold text-indigo-700 underline underline-offset-2">
                진행 보기
              </button>
            )}
          </p>
        )}
        <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          초기화
        </button>
        <button
          type="submit"
          disabled={!canGenerate || isGenerating || autoBuilding}
          title="코스만 만듭니다. 원가는 설정에서 직접 넣거나 자동 견적으로 채웁니다"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          {isGenerating && !autoBuilding ? (isPaste ? "분석 중..." : "생성 중...") : isPaste ? "코스 분석" : "코스만"}
        </button>
        <button
          type="button"
          onClick={onAutoBuild}
          title="코스 → 숙소 → 차량·가이드·입장료·시세 → 경쟁 상품 → 추천 투어를 한 번에 채웁니다"
          disabled={!canGenerate || isGenerating || autoBuilding}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {autoBuilding ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Wand2 className="h-4 w-4" aria-hidden />}
          {autoBuilding ? "자동 구성 중..." : "자동 구성"}
        </button>
        </div>
      </div>
    </form>
  );
}
