"use client";

import { Loader2, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { CourseFile } from "@/lib/courseFile";
import type { FlightOption, TripInput } from "@/types";
import { AdvancedFolder } from "./AdvancedFolder";
import { CostFolder } from "./CostFolder";
import { DocumentSection } from "./DocumentSection";
import { OneLineRequest } from "./OneLineRequest";
import { PriceSection } from "./PriceSection";
import { SalesSetupSection } from "./SalesSetupSection";
import type { SettingsFocus } from "./settingsFocus";
import { TripBasicsSection } from "./TripBasicsSection";

interface Props {
  input: TripInput;
  onChange: (patch: Partial<TripInput>) => void;
  onReset: () => void;
  onGenerate: () => void;
  /** 자동 구성 (코스·숙소·차량·견적·투어 한 번에) */
  onAutoBuild: () => void;
  autoBuilding: boolean;
  /** 자동 구성 진행 한 줄 (지금 하는 단계 또는 결과). 진행 목록은 결과 화면 맨 위에 있다 */
  autoStatus?: string;
  onShowProgress?: () => void;
  isGenerating: boolean;
  courseFile: CourseFile | null;
  onCourseFileChange: (file: CourseFile | null) => void;
  /** 항공편을 고르면 일정·항공료·일수·숙박 수를 맞춘다 */
  onApplyFlight: (flight: FlightOption) => void;
  /** 일정에서 센 도시별 숙박 수 (도시별 숙박 요금 입력용) */
  stays: { city: string; nights: number }[];
  /** 다른 화면(견적 경고·진행 상황)에서 이 폴더·항목으로 이동시킬 때 */
  focus: SettingsFocus | null;
}

/**
 * 입력 화면 — 번호 붙은 폴더 6개. 처음 쓰는 사람은 1~3만 채우고 아래 '자동 구성'을 누르면 된다.
 * 1. 여행 기본 · 2. 상품 구성 · 3. 가격 방식 (펼침) / 4. 원가 직접 입력 · 5. 고객·문서 · 6. 고급 (접힘, 선택)
 * 같은 값은 한 폴더에서만 입력한다 (다른 곳에서는 보여 주기만 한다).
 */
export function TripInputForm({
  input,
  onChange,
  onReset,
  onGenerate,
  isGenerating,
  courseFile,
  onCourseFileChange,
  onApplyFlight,
  onAutoBuild,
  autoBuilding,
  autoStatus,
  onShowProgress,
  stays,
  focus,
}: Props) {
  const isPaste = input.mode === "paste";
  const canGenerate = isPaste
    ? input.courseText.trim().length >= 20 || courseFile !== null
    : input.destination.trim().length > 0 && input.days >= (input.includesFlights ? 3 : 1) && input.travelers >= 1;
  const signal = (s: SettingsFocus["section"]) => (focus?.section === s ? focus.n : undefined);
  // 초기화는 입력값을 모두 지워 되돌릴 수 없으므로 한 번 더 확인한다
  const [confirmReset, setConfirmReset] = useState(false);

  // 다른 화면에서 항목으로 이동시키면, 폴더가 펼쳐진 뒤 그 항목으로 스크롤한다
  useEffect(() => {
    if (!focus) return;
    const id = window.setTimeout(() => document.getElementById(`settings-${focus.section}`)?.scrollIntoView({ block: "start", behavior: "smooth" }), 80);
    return () => window.clearTimeout(id);
  }, [focus]);

  return (
    <form
      className="flex min-h-full flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (canGenerate && !isGenerating) onGenerate();
      }}
    >
      <div className="flex-1 space-y-3 p-4">
        {!isPaste && <OneLineRequest input={input} onChange={onChange} />}
        <TripBasicsSection input={input} onChange={onChange} courseFile={courseFile} onCourseFileChange={onCourseFileChange} />
        <SalesSetupSection input={input} onChange={onChange} onApplyFlight={onApplyFlight} />
        <PriceSection input={input} onChange={onChange} openSignal={signal("pricing")} />
        <p className="px-1 text-pretty text-[11px] leading-4 text-slate-500">
          여기까지 채우고 아래 <span className="font-semibold text-slate-700">자동 구성</span>을 누르면 코스 → 숙소 → 차량·가이드·입장료·시세 → 경쟁 상품 → 추천
          투어까지 한 번에 채웁니다. 아래 폴더는 필요할 때만 여세요.
        </p>
        <CostFolder input={input} onChange={onChange} stays={stays} focus={focus} />
        <DocumentSection input={input} onChange={onChange} openSignal={signal("documents")} />
        <AdvancedFolder input={input} onChange={onChange} focus={focus} />
      </div>

      <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        {confirmReset && (
          <div
            role="alertdialog"
            aria-label="초기화 확인"
            className="mb-3 space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-[11px] leading-4 text-amber-900"
          >
            <p className="text-pretty font-semibold">입력한 내용을 모두 처음 상태(회사 기본값)로 되돌립니다. 되돌릴 수 없습니다.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmReset(false);
                  onReset();
                }}
                className="rounded-md bg-amber-600 px-2.5 py-1 font-semibold text-white hover:bg-amber-700"
              >
                초기화
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmReset(false)}
                className="rounded-md border border-amber-300 bg-white px-2.5 py-1 font-semibold text-amber-900 hover:bg-amber-100"
              >
                취소
              </button>
            </div>
          </div>
        )}
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
            onClick={() => setConfirmReset(true)}
            aria-expanded={confirmReset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <RotateCcw className="size-4" aria-hidden />
            초기화
          </button>
          <button
            type="submit"
            disabled={!canGenerate || isGenerating || autoBuilding}
            title="코스만 만듭니다. 원가는 '4. 원가 직접 입력'에 넣거나 자동 구성으로 채웁니다"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
          >
            <Sparkles className="size-4" aria-hidden />
            {isGenerating && !autoBuilding ? (isPaste ? "분석 중..." : "생성 중...") : isPaste ? "코스 분석" : "코스만"}
          </button>
          <button
            type="button"
            onClick={onAutoBuild}
            title="코스 → 숙소 → 차량·가이드·입장료·시세 → 경쟁 상품 → 추천 투어를 한 번에 채웁니다"
            disabled={!canGenerate || isGenerating || autoBuilding}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {autoBuilding ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wand2 className="size-4" aria-hidden />}
            {autoBuilding ? "자동 구성 중..." : "자동 구성"}
          </button>
        </div>
      </div>
    </form>
  );
}
