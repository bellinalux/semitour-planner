"use client";

import { useMemo, useState } from "react";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { TripInputForm } from "@/components/form/TripInputForm";
import { Header } from "@/components/layout/Header";
import { MobileTabs, type PlannerTab } from "@/components/layout/MobileTabs";
import { useItinerary } from "@/hooks/useItinerary";
import { usePlannerInput } from "@/hooks/usePlannerInput";
import { useUsp } from "@/hooks/useUsp";
import { calculateQuote } from "@/lib/cost";
import { buildCustomerText, buildInternalText } from "@/lib/exportText";
import { buildUspRequest } from "@/lib/uspRequest";

export function PlannerApp() {
  const { input, update, reset } = usePlannerInput();
  const itinerary = useItinerary();
  const usp = useUsp();
  const [tab, setTab] = useState<PlannerTab>("input");

  const { days, pmChoice } = itinerary;
  const isReady = itinerary.state.status === "success";

  // 견적은 입력/일정/오후 코스 선택이 바뀔 때마다 다시 계산되어 모든 패널이 공유한다.
  const quote = useMemo(
    () => (isReady ? calculateQuote(input, days, pmChoice) : null),
    [isReady, input, days, pmChoice],
  );
  const uspRequest = useMemo(
    () => (quote?.ok ? buildUspRequest(input, days, pmChoice, quote) : null),
    [quote, input, days, pmChoice],
  );
  const uspStale = usp.state.status === "success" && usp.generatedKey !== JSON.stringify(uspRequest);

  const handleGenerate = async () => {
    setTab("result");
    usp.reset();
    const result = await itinerary.generate(input);
    if (!result) return;

    // 일정이 만들어지면 세일즈 포인트도 이어서 생성한다 (실패해도 일정/견적에는 영향 없음)
    const firstQuote = calculateQuote(input, result.days, result.pmChoice);
    if (firstQuote.ok) void usp.generate(buildUspRequest(input, result.days, result.pmChoice, firstQuote));
  };

  const handleGenerateUsp = () => {
    if (uspRequest) void usp.generate(uspRequest);
  };

  const exportData = () => {
    if (!quote?.ok) throw new Error("견적이 아직 준비되지 않았습니다.");
    return { input, days, pmChoice, quote, usps: usp.state.status === "success" ? usp.usps : [] };
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
            isGenerating={itinerary.state.status === "loading"}
          />
        </aside>
        <section
          aria-label="결과"
          className={`min-h-0 overflow-y-auto bg-slate-100/60 lg:block ${
            tab === "result" ? "block" : "hidden"
          }`}
        >
          <Dashboard
            itinerary={itinerary.state}
            days={days}
            input={input}
            quote={quote}
            pmChoice={pmChoice}
            generatedCurrency={itinerary.generatedCurrency}
            onSelectPm={itinerary.selectPmOption}
            onChangeCost={itinerary.updateItemCost}
            onRetryItinerary={handleGenerate}
            usp={{
              state: usp.state,
              items: usp.usps,
              isStale: uspStale,
              canGenerate: uspRequest !== null,
              onGenerate: handleGenerateUsp,
            }}
            exporter={{
              disabled: !quote?.ok,
              getInternalText: () => buildInternalText(exportData()),
              getCustomerText: () => buildCustomerText(exportData()),
            }}
          />
        </section>
      </main>
    </div>
  );
}
