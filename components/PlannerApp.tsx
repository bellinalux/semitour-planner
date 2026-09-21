"use client";

import { useState } from "react";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { TripInputForm } from "@/components/form/TripInputForm";
import { Header } from "@/components/layout/Header";
import { MobileTabs, type PlannerTab } from "@/components/layout/MobileTabs";
import { usePlannerInput } from "@/hooks/usePlannerInput";
import type { AsyncState } from "@/types";

interface Props {
  /** 개발 중 로딩/에러 UI 확인용 초기 상태 (Step 2에서 제거) */
  initialItinerary?: AsyncState;
  initialUsp?: AsyncState;
}

const IDLE: AsyncState = { status: "idle" };

export function PlannerApp({ initialItinerary = IDLE, initialUsp = IDLE }: Props) {
  const { input, update, reset } = usePlannerInput();
  const [tab, setTab] = useState<PlannerTab>("input");
  const [itinerary] = useState<AsyncState>(initialItinerary);
  const [usp] = useState<AsyncState>(initialUsp);

  // Step 2에서 /api/generate-itinerary 호출로 교체된다.
  const handleGenerate = () => setTab("result");

  return (
    <div className="flex h-dvh flex-col">
      <Header />
      <MobileTabs active={tab} onChange={setTab} />
      <main className="grid min-h-0 flex-1 lg:grid-cols-[440px_1fr]">
        <aside
          aria-label="입력"
          className={`min-h-0 overflow-y-auto border-slate-200 bg-slate-50 lg:block lg:border-r ${
            tab === "input" ? "block" : "hidden"
          }`}
        >
          <TripInputForm
            input={input}
            onChange={update}
            onReset={reset}
            onGenerate={handleGenerate}
            isGenerating={itinerary.status === "loading"}
          />
        </aside>
        <section
          aria-label="결과"
          className={`min-h-0 overflow-y-auto bg-slate-100/60 lg:block ${
            tab === "result" ? "block" : "hidden"
          }`}
        >
          <Dashboard
            itinerary={itinerary}
            usp={usp}
            onRetryItinerary={handleGenerate}
            onRetryUsp={handleGenerate}
          />
        </section>
      </main>
    </div>
  );
}
