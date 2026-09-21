import { RotateCcw, Sparkles } from "lucide-react";
import type { TripInput } from "@/types";
import { CompetitorSection } from "./CompetitorSection";
import { CostSection } from "./CostSection";
import { PackageSection } from "./PackageSection";
import { PricingSection } from "./PricingSection";
import { TripBasicsSection } from "./TripBasicsSection";

interface Props {
  input: TripInput;
  onChange: (patch: Partial<TripInput>) => void;
  onReset: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
}

export function TripInputForm({ input, onChange, onReset, onGenerate, isGenerating }: Props) {
  const isPaste = input.mode === "paste";
  const canGenerate = isPaste
    ? input.courseText.trim().length >= 20
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
        <TripBasicsSection input={input} onChange={onChange} />
        <PackageSection input={input} onChange={onChange} />
        <CostSection input={input} onChange={onChange} />
        <PricingSection input={input} onChange={onChange} />
        <CompetitorSection input={input} onChange={onChange} />
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
