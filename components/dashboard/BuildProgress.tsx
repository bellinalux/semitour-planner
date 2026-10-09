"use client";

import { Check, CircleAlert, Wand2 } from "lucide-react";
import { AutoBuildPanel } from "@/components/form/AutoBuildPanel";
import { AutoQuotePanel } from "@/components/form/AutoQuotePanel";
import type { SettingsSection } from "@/components/form/settingsFocus";
import { SectionCard } from "@/components/ui/SectionCard";
import type { AutoBuild } from "@/hooks/useAutoBuild";
import type { AutoQuote } from "@/hooks/useAutoQuote";
import { priceIsGiven } from "@/lib/channels";
import { setupChecklist } from "@/lib/setupChecklist";
import type { TourCandidate, TripInput } from "@/types";

interface Props {
  input: TripInput;
  build: AutoBuild;
  auto: AutoQuote;
  onAddTourOption: (tour: TourCandidate) => void;
  onInsertTour: (tour: TourCandidate) => void;
  /** 비어 있는 원가 칩을 누르면 입력 화면의 해당 폴더를 연다 */
  onFocus: (section: SettingsSection) => void;
}

/**
 * 결과 화면 맨 위의 "자동 구성 진행" — 코스·숙소·차량·견적·경쟁 상품·추천 투어를 채운 과정과 결과(숙소 후보·추천 투어),
 * 그리고 아직 비어 있는 원가를 보여 준다. 자동 구성(또는 단계 안내의 자동 견적)을 한 번이라도 돌린 뒤에만 보인다.
 */
export function progressStarted(build: Pick<AutoBuild, "running" | "steps">, auto: Pick<AutoQuote, "running" | "filledCount">): boolean {
  return build.running || build.steps.some((s) => s.status !== "pending") || auto.running || auto.filledCount !== null;
}

export function BuildProgress({ input, build, auto, onAddTourOption, onInsertTour, onFocus }: Props) {
  if (!progressStarted(build, auto)) return null;
  const buildStarted = build.running || build.steps.some((s) => s.status !== "pending");
  const items = setupChecklist(input);
  const done = build.steps.filter((s) => s.status === "done").length;
  return (
    <SectionCard
      title={buildStarted ? "자동 구성 진행" : "자동 견적 진행"}
      description="코스·숙소·차량·가이드·입장료·시세·경쟁 상품·추천 투어를 채운 과정과 결과입니다"
      icon={Wand2}
      collapsible
      anchorId="build-progress"
      summary={buildStarted ? (build.running ? "진행 중..." : `${done}/${build.steps.length}단계 완료`) : auto.running ? "진행 중..." : "빈 원가 채우기 끝"}
    >
      <div className="space-y-3">
        {buildStarted ? (
          <AutoBuildPanel
            build={build}
            auto={auto}
            currency={input.currency}
            budgetMode={priceIsGiven(input.pricingMode)}
            onAddOption={onAddTourOption}
            onInsertTour={onInsertTour}
          />
        ) : (
          <AutoQuotePanel auto={auto} />
        )}
        <div className="border-t border-slate-100 pt-3">
          <p className="text-[11px] font-semibold text-slate-600">원가 확인 — 눌러서 입력 화면에서 고칩니다 (값을 바꾸면 견적이 바로 다시 계산됩니다)</p>
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="필수 설정 확인">
            {items.map((item) => (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={() => onFocus(item.section)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                    item.done
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                  }`}
                >
                  {item.done ? <Check className="size-3" aria-hidden /> : <CircleAlert className="size-3" aria-hidden />}
                  {item.label} {item.done ? "입력됨" : "입력 필요"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SectionCard>
  );
}
