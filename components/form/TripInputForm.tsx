import { RotateCcw, Sparkles } from "lucide-react";
import type { CourseFile } from "@/lib/courseFile";
import type { TripInput } from "@/types";
import { QuickSettingsSection } from "./QuickSettingsSection";
import { TripBasicsSection } from "./TripBasicsSection";

interface Props {
  input: TripInput;
  onChange: (patch: Partial<TripInput>) => void;
  onReset: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
  courseFile: CourseFile | null;
  onCourseFileChange: (file: CourseFile | null) => void;
}

/** 레이아웃1: 코스를 만들 때 꼭 필요한 입력만 둔다. 원가·가격·채널·경쟁사·문서 설정은 코스를 만든 뒤 레이아웃3(설정)에서 한다. */
export function TripInputForm({ input, onChange, onReset, onGenerate, isGenerating, courseFile, onCourseFileChange }: Props) {
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
        <TripBasicsSection input={input} onChange={onChange} courseFile={courseFile} onCourseFileChange={onCourseFileChange} />
        <QuickSettingsSection input={input} onChange={onChange} />
        <p className="rounded-lg bg-white px-3 py-2.5 text-[11px] leading-4 text-slate-500 ring-1 ring-slate-200">
          차량·가이드비, 숙박·항공 요금, 마진, 판매 채널, 경쟁사, 고객 문서 정보는 코스를 만든 뒤 <span className="font-medium text-slate-700">설정</span>에서 입력합니다.
        </p>
      </div>

      <div className="sticky bottom-0 flex items-center gap-2 border-t border-slate-200 bg-white/95 p-4 backdrop-blur">
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
          disabled={!canGenerate || isGenerating}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          {isGenerating ? (isPaste ? "분석 중..." : "생성 중...") : isPaste ? "코스 분석·견적 생성" : "일정·견적 생성"}
        </button>
      </div>
    </form>
  );
}
