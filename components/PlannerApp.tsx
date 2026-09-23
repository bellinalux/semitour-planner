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
import { useSegmentLibrary } from "@/hooks/useSegmentLibrary";
import { useUsp } from "@/hooks/useUsp";
import { useWorkPersistence } from "@/hooks/useWorkPersistence";
import { missingLegalFields } from "@/lib/company";
import { calculateQuote } from "@/lib/cost";
import { applyFeeResults, feeCheckTargets, type FeeApplySummary } from "@/lib/fees";
import { applyOptionSuggestions, optionSuggestTargets, suggestionToOption, type OptionSuggestApplySummary } from "@/lib/optionSuggestions";
import { accessibilityCheckTargets, applyAccessibilityResults, type AccessibilityApplySummary } from "@/lib/accessibilityCheck";
import type { VerifyFeesResponse } from "@/lib/schemas/market";
import type { SuggestOptionsResponse } from "@/lib/schemas/optionSuggest";
import type { VerifyAccessibilityResponse } from "@/lib/schemas/accessibility";
import { newSegmentId, type SegmentKind } from "@/lib/segmentLibrary";
import { applyFlightToDays } from "@/lib/flightApply";
import { overnightNights } from "@/lib/itinerary";
import { buildEmojiCustomerText } from "@/lib/exportEmoji";
import { buildCustomerText, buildInternalText } from "@/lib/exportText";
import { tourToOption } from "@/lib/options";
import { buildUspRequest } from "@/lib/uspRequest";
import type { PlanSnapshot, ResultSnapshot } from "@/lib/workspace";
import type { CourseFile } from "@/lib/courseFile";
import type { FlightOption, ItineraryItem, TripInput } from "@/types";

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
  const optionSuggestRequest = useRequest<
    { destination: string; currency: string; exchangeRateToKrw: number; items: { id: string; name: string; description?: string; city?: string }[] },
    SuggestOptionsResponse
  >("/api/suggest-options");
  const [optionSuggestSummary, setOptionSuggestSummary] = useState<OptionSuggestApplySummary | null>(null);
  const accessibilityRequest = useRequest<{ destination: string; items: { id: string; name: string; city?: string }[] }, VerifyAccessibilityResponse>(
    "/api/verify-accessibility",
  );
  const [accessibilitySummary, setAccessibilitySummary] = useState<AccessibilityApplySummary | null>(null);
  const segmentLibrary = useSegmentLibrary();
  const [courseFile, setCourseFile] = useState<CourseFile | null>(null);
  const companyProfile = useCompanyProfile();
  const { company } = companyProfile;
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
    setOptionSuggestSummary(null);
    setAccessibilitySummary(null);
    usp.reset();
    const result = await itinerary.generate(input, courseFile);
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

  /** 코스마다 팔 만한 선택 옵션(바나나보트, 제트스키 등)을 웹에서 찾아 일정 항목에 반영한다 */
  const handleSuggestOptions = async () => {
    const items = optionSuggestTargets(days).slice(0, 30);
    if (items.length === 0) return;
    const response = await optionSuggestRequest.run({
      destination: input.destination.trim() || meta?.cities.join(", ") || "",
      currency: input.currency,
      exchangeRateToKrw: input.exchangeRateToKrw,
      items,
    });
    if (!response) return;
    const { days: next, summary } = applyOptionSuggestions(days, response.results, input.currency);
    itinerary.replaceDays(next);
    setOptionSuggestSummary(summary);
  };

  /** "확인 못함"으로 남은 이용 편의시설을 웹에서 다시 검색해 반영한다 */
  const handleVerifyAccessibility = async () => {
    const items = accessibilityCheckTargets(days).slice(0, 30);
    if (items.length === 0) return;
    const response = await accessibilityRequest.run({
      destination: input.destination.trim() || meta?.cities.join(", ") || "",
      items,
    });
    if (!response) return;
    const { days: next, summary } = applyAccessibilityResults(days, response.results);
    itinerary.replaceDays(next);
    setAccessibilitySummary(summary);
  };

  /** 오전·오후·하루 일정이나 장소 하나를 라이브러리에 즐겨찾기로 저장한다 */
  const handleSaveSegment = (items: ItineraryItem[], kind: SegmentKind, defaultName: string) => {
    const name = window.prompt("라이브러리에 저장할 이름", defaultName);
    if (!name || !name.trim()) return;
    const error = segmentLibrary.save({
      id: newSegmentId(),
      name: name.trim(),
      destination: input.destination.trim() || meta?.cities.join(", ") || "미지정",
      kind,
      items,
    });
    if (error) window.alert(error);
  };

  const handleGenerateUsp = () => {
    if (uspRequest) void usp.generate(uspRequest);
  };

  /** 항공편 상세 검색에서 고른 항공편을 저장하고, 항공 이동일 항목(있으면)에 편명·시간을 반영한다 */
  const handleApplyFlight = (flight: FlightOption) => {
    update({ selectedFlight: flight, flightPricePerPerson: flight.price, costStatus: { ...input.costStatus, flight: "estimated" } });
    itinerary.replaceDays(applyFlightToDays(days, flight));
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
            <CompanySettings {...companyProfile} />
            <SavedPlansMenu snapshot={snapshot} onLoad={handleLoadPlan} onImportDay={itinerary.appendDayFromSegment} />
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
            courseFile={courseFile}
            onCourseFileChange={setCourseFile}
            onApplyFlight={handleApplyFlight}
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
              onChangeDay: itinerary.updateDay,
              onDeleteItem: itinerary.deleteItem,
              onAddItem: itinerary.addItem,
              onAddTour: itinerary.addTour,
              onMoveItem: itinerary.moveItemOrder,
              onRelocateItem: itinerary.relocate,
              onReorderItems: itinerary.reorderSessionItems,
              onInsertItems: itinerary.insertSegment,
              onSaveSegment: handleSaveSegment,
            }}
            regionActions={{
              cityRegenState: itinerary.cityRegenState,
              onRegenerateCity: (city, dayNumbers) => void itinerary.regenerateCity(input, city, dayNumbers),
            }}
            optionActions={{
              onAddOption: (tour, dayNo) => update({ options: [...input.options, tourToOption(tour, dayNo, input)] }),
              onAddSuggestedOption: (suggestion, dayNo) => update({ options: [...input.options, suggestionToOption(suggestion, dayNo, input)] }),
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
            optionSuggest={{
              state: optionSuggestRequest.state,
              targetCount: Math.min(30, optionSuggestTargets(days).length),
              summary: optionSuggestSummary,
              sources: optionSuggestRequest.data?.sources ?? [],
              searched: optionSuggestRequest.data?.searched ?? true,
              onRun: () => void handleSuggestOptions(),
            }}
            accessibilityCheck={{
              state: accessibilityRequest.state,
              targetCount: Math.min(30, accessibilityCheckTargets(days).length),
              summary: accessibilitySummary,
              sources: accessibilityRequest.data?.sources ?? [],
              searched: accessibilityRequest.data?.searched ?? true,
              onRun: () => void handleVerifyAccessibility(),
            }}
            library={{
              segments: segmentLibrary.segments,
              onInsert: itinerary.insertSegment,
              onAppendDay: itinerary.appendDayFromSegment,
              onDelete: segmentLibrary.remove,
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
