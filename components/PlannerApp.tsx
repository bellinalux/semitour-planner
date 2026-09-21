"use client";

import { useState } from "react";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { TripInputForm } from "@/components/form/TripInputForm";
import { Header } from "@/components/layout/Header";
import { MobileTabs, type PlannerTab } from "@/components/layout/MobileTabs";
import { useItinerary } from "@/hooks/useItinerary";
import { usePlannerInput } from "@/hooks/usePlannerInput";
import type { AsyncState } from "@/types";

// Step 4에서 /api/generate-usp 호출로 교체된다.
const USP_IDLE: AsyncState = { status: "idle" };

export function PlannerApp() {
  const { input, update, reset } = usePlannerInput();
  const { state, days, pmChoice, generatedCurrency, generate, selectPmOption, updateItemCost } = useItinerary();
  const [tab, setTab] = useState<PlannerTab>("input");

  const handleGenerate = () => {
    setTab("result");
    void generate(input);
  };

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
            isGenerating={state.status === "loading"}
          />
        </aside>
        <section
          aria-label="결과"
          className={`min-h-0 overflow-y-auto bg-slate-100/60 lg:block ${
            tab === "result" ? "block" : "hidden"
          }`}
        >
          <Dashboard
            itinerary={state}
            days={days}
            input={input}
            pmChoice={pmChoice}
            generatedCurrency={generatedCurrency}
            onSelectPm={selectPmOption}
            onChangeCost={updateItemCost}
            usp={USP_IDLE}
            onRetryItinerary={handleGenerate}
            onRetryUsp={handleGenerate}
          />
        </section>
      </main>
    </div>
  );
}
