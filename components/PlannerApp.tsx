"use client";

import { useMemo, useState } from "react";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { TripInputForm } from "@/components/form/TripInputForm";
import { Header } from "@/components/layout/Header";
import { CompanySettings } from "@/components/layout/CompanySettings";
import { PrintDocuments } from "@/components/print/PrintDocuments";
import { SavedPlansMenu } from "@/components/layout/SavedPlansMenu";
import { MobileTabs, type PlannerTab } from "@/components/layout/MobileTabs";
import { useItinerary } from "@/hooks/useItinerary";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import { useRequest } from "@/hooks/useRequest";
import { usePlannerInput } from "@/hooks/usePlannerInput";
import { useUsp } from "@/hooks/useUsp";
import { useWorkPersistence } from "@/hooks/useWorkPersistence";
import { missingLegalFields } from "@/lib/company";
import { calculateQuote } from "@/lib/cost";
import { applyFeeResults, feeCheckTargets, type FeeApplySummary } from "@/lib/fees";
import type { VerifyFeesResponse } from "@/lib/schemas/market";
import { overnightNights } from "@/lib/itinerary";
import { buildEmojiCustomerText } from "@/lib/exportEmoji";
import { buildCustomerText, buildInternalText } from "@/lib/exportText";
import { tourToOption } from "@/lib/options";
import { buildUspRequest } from "@/lib/uspRequest";
import type { PlanSnapshot, ResultSnapshot } from "@/lib/workspace";
import type { TripInput } from "@/types";

const NO_USPS: never[] = [];

export function PlannerApp() {
  const { input, update, reset, replace } = usePlannerInput();
  const itinerary = useItinerary();
  const usp = useUsp();
  const [tab, setTab] = useState<PlannerTab>("input");
  const feeRequest = useRequest<
    { destination: string; currency: string; exchangeRateToKrw: number; items: { id: string; name: string; city?: string }[] },
    VerifyFeesResponse
  >("/api/verify-fees");
  const [feeSummary, setFeeSummary] = useState<FeeApplySummary | null>(null);
  const { company } = useCompanyProfile();
  const { kind: printKind, print } = usePrintDocument();

  const { days, pmChoice, meta } = itinerary;
  const isReady = itinerary.state.status === "success";

  // 견적은 입력/일정/오후 코스 선택이 바뀔 때마다 다시 계산되어 모든 패널이 공유한다.
  const quote = useMemo(
    () => (isReady ? calculateQuote(input, days, pmChoice) : null),
    [isReady, input, days, pmChoice],
  );
  // 인쇄 문서는 견적이 준비된 뒤에만 만들 수 있다
  const docData = useMemo(
    () => (quote?.ok ? { input, days, pmChoice, quote, meta, company } : null),
    [quote, input, days, pmChoice, meta, company],
  );

  const stays = useMemo(() => overnightNights(days), [days]);
  const uspRequest = useMemo(
    () => (quote?.ok ? buildUspRequest(input, days, pmChoice, quote, meta) : null),
    [quote, input, days, pmChoice, meta],
  );
  const uspStale = usp.state.status === "success" && usp.generatedKey !== JSON.stringify(uspRequest);

  // 생성된 결과(일정·오후 선택·세일즈 포인트)는 새로고침해도 남도록 자동 보관한다
  const usps = usp.state.status === "success" ? usp.usps : NO_USPS;
  const uspKey = usp.state.status === "success" ? usp.generatedKey : null;
  const result = useMemo<ResultSnapshot>(
    () => ({ days, pmChoice, meta, generatedCurrency: itinerary.generatedCurrency, usps, uspKey }),
    [days, pmChoice, meta, itinerary.generatedCurrency, usps, uspKey],
  );
  const restoreResult = (saved: ResultSnapshot) => {
    itinerary.restore(saved);
    usp.restore(saved.usps, saved.uspKey);
  };
  useWorkPersistence(result, restoreResult);

  const snapshot = useMemo<PlanSnapshot>(() => ({ ...result, input }), [result, input]);
  const handleLoadPlan = (saved: PlanSnapshot) => {
    replace(saved.input);
    restoreResult(saved);
    if (saved.days.length > 0) setTab("result");
  };

  const handleGenerate = async () => {
    setTab("result");
    setFeeSummary(null);
    usp.reset();
    const result = await itinerary.generate(input);
    if (!result) return;

    // 붙여넣은 코스에서 읽은 기간/도시를 입력 폼에 반영한다 (박수는 코스 원문이 기준이다)
    let nextInput: TripInput = input;
    if (result.detected) {
      const patch: Partial<TripInput> = {
        days: result.detected.days,
        nights: result.detected.nights,
        destination: result.detected.cities.length > 0 ? result.detected.cities.join(", ") : input.destination,
      };
      update(patch);
      nextInput = { ...input, ...patch };
    }

    // 일정이 만들어지면 세일즈 포인트도 이어서 생성한다 (실패해도 일정/견적에는 영향 없음)
    const firstQuote = calculateQuote(nextInput, result.days, result.pmChoice);
    if (firstQuote.ok) {
      void usp.generate(buildUspRequest(nextInput, result.days, result.pmChoice, firstQuote, result.meta));
    }
  };

  /** 입장료·체험료를 웹에서 확인해 일정 항목에 반영한다 */
  const handleVerifyFees = async () => {
    const items = feeCheckTargets(days).slice(0, 40);
    if (items.length === 0) return;
    const response = await feeRequest.run({
      destination: input.destination.trim() || meta?.cities.join(", ") || "",
      currency: input.currency,
      exchangeRateToKrw: input.exchangeRateToKrw,
      items,
    });
    if (!response) return;
    const { days: next, summary } = applyFeeResults(days, response.results, response.checkedAt);
    itinerary.replaceDays(next);
    setFeeSummary(summary);
  };

  const handleGenerateUsp = () => {
    if (uspRequest) void usp.generate(uspRequest);
  };

  const exportData = () => {
    if (!quote?.ok) throw new Error("견적이 아직 준비되지 않았습니다.");
    return { input, days, pmChoice, quote, meta, usps: usp.state.status === "success" ? usp.usps : [] };
  };

  return (
    <>
    <PrintDocuments kind={printKind} data={docData} />
    <div className="screen-only flex h-dvh flex-col">
      <Header
        actions={
          <>
            <CompanySettings />
            <SavedPlansMenu snapshot={snapshot} onLoad={handleLoadPlan} />
          </>
        }
      />
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
            stays={stays}
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
            meta={meta}
            input={input}
            quote={quote}
            pmChoice={pmChoice}
            generatedCurrency={itinerary.generatedCurrency}
            researchInfo={itinerary.researchInfo}
            onSelectPm={itinerary.selectPmOption}
            itemActions={{
              onChangeItem: itinerary.updateItem,
              onDeleteItem: itinerary.deleteItem,
              onAddItem: itinerary.addItem,
              onAddTour: itinerary.addTour,
            }}
            optionActions={{
              onAddOption: (tour, dayNo) => update({ options: [...input.options, tourToOption(tour, dayNo, input)] }),
              onChangeOptions: (options) => update({ options }),
            }}
            onRetryItinerary={handleGenerate}
            feeCheck={{
              state: feeRequest.state,
              targetCount: Math.min(40, feeCheckTargets(days).length),
              summary: feeSummary,
              sources: feeRequest.data?.sources ?? [],
              searched: feeRequest.data?.searched ?? true,
              fxUpdatedAt: feeRequest.data?.fx[0]?.updatedAt ?? "",
              onRun: () => void handleVerifyFees(),
            }}
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
              getEmojiText: () => buildEmojiCustomerText(exportData()),
            }}
            documents={{
              disabled: !quote?.ok,
              missingLegal: missingLegalFields(company),
              onPrint: print,
            }}
          />
        </section>
      </main>
    </div>
    </>
  );
}
