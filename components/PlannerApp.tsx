"use client";

import { useEffect, useMemo, useState } from "react";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { TripInputForm } from "@/components/form/TripInputForm";
import { Header } from "@/components/layout/Header";
import { CompanySettings } from "@/components/layout/CompanySettings";
import { DOC_LABELS, PrintDocuments, type DocKind } from "@/components/print/PrintDocuments";
import { SavedPlansMenu } from "@/components/layout/SavedPlansMenu";
import { SendToTourdesign } from "@/components/layout/SendToTourdesign";
import { ErrorLogMenu } from "@/components/layout/ErrorLogMenu";
import { HistoryMenu } from "@/components/layout/HistoryMenu";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { FeedbackButton } from "@/components/layout/FeedbackButton";
import { useSession } from "@/components/SessionContext";
import { StepGuide } from "@/components/layout/StepGuide";
import { StudioNotices } from "@/components/layout/StudioNotices";
import { MobileTabs, type PlannerTab } from "@/components/layout/MobileTabs";
import { SettingsPanel, type SettingsFocus, type SettingsSection } from "@/components/form/SettingsPanel";
import { useItinerary } from "@/hooks/useItinerary";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import { usePlannerInput } from "@/hooks/usePlannerInput";
import { useSegmentLibrary } from "@/hooks/useSegmentLibrary";
import { useUsp } from "@/hooks/useUsp";
import { useWebChecks } from "@/hooks/useWebChecks";
import { useQuoteLog } from "@/hooks/useQuoteLog";
import { useTeamSync } from "@/hooks/useTeamSync";
import { buildQuoteLogEntry, type QuoteLogAction } from "@/lib/quoteLog";
import { useWorkPersistence } from "@/hooks/useWorkPersistence";
import { useStudioProductReceive } from "@/hooks/useStudioProductReceive";
import { useStudioProductProvide } from "@/hooks/useStudioProductProvide";
import { planToProduct } from "@/lib/planToProduct";
import { listenErrors } from "@/lib/errorReport";
import { missingLegalFields } from "@/lib/company";
import { calculateQuote } from "@/lib/cost";
import { rememberCosts } from "@/lib/costMemory";
import { useAutoQuote } from "@/hooks/useAutoQuote";
import { documentQuote } from "@/lib/pricing";
import { withSource } from "@/lib/costSource";
import { plannerGuide } from "@/lib/plannerGuide";
import { suggestionToOption } from "@/lib/optionSuggestions";
import { newSegmentId, type SegmentKind } from "@/lib/segmentLibrary";
import { applyFlightToDays, tripSpanFromFlight } from "@/lib/flightApply";
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
  const [settingsFocus, setSettingsFocus] = useState<SettingsFocus | null>(null);
  /** 설정 패널의 해당 항목을 펼치고 그곳으로 이동한다 (좁은 화면에서는 설정 탭으로 전환) */
  const openSettings = (section: SettingsSection) => {
    setTab("settings");
    setSettingsFocus((prev) => ({ section, n: (prev?.n ?? 0) + 1 }));
  };
  // 상세페이지 스튜디오 [세미투어로 보내기]로 받은 상품 → 입력칸 채우기
  const [studioNotice, clearStudioNotice] = useStudioProductReceive(input, update, () => setTab("input"));
  const segmentLibrary = useSegmentLibrary();
  const [courseFile, setCourseFile] = useState<CourseFile | null>(null);
  const companyProfile = useCompanyProfile();
  const { company } = companyProfile;
  const { kind: printKind, print } = usePrintDocument();
  // 회사 기본값·원가 기억을 팀(같은 접속 코드)과 맞추고, 고객에게 나간 견적을 이력으로 남긴다
  const teamSync = useTeamSync();
  const quoteLog = useQuoteLog();
  const session = useSession();

  const { days, pmChoice, meta } = itinerary;
  const webChecks = useWebChecks({ input, days, meta, replaceDays: itinerary.replaceDays });
  const isReady = itinerary.state.status === "success";
  // 화면 오류를 오류 기록(/api/errors)으로 보낸다
  useEffect(() => listenErrors(), []);
  // 상세페이지 스튜디오로 보낼 상품 데이터 (원가·판매가는 넣지 않는다)
  const getProduct = () => (days.length ? planToProduct({ input, days, pmChoice, meta }) : null);
  // 상세페이지 스튜디오의 [세미투어에서 가져오기]로 열린 경우 → 화면 위에서 보낼지 묻는다
  const provide = useStudioProductProvide(getProduct);

  // 견적은 입력/일정/오후 코스 선택이 바뀔 때마다 다시 계산되어 모든 패널이 공유한다.
  const quote = useMemo(
    () => (isReady ? calculateQuote(input, days, pmChoice) : null),
    [isReady, input, days, pmChoice],
  );
  // 인쇄 문서는 견적이 준비된 뒤에만 만들 수 있다
  const docData = useMemo(
    // 고객 문서는 선택한 판매 채널의 소비자가를 쓰고, 내부 검토서는 원래 견적(rawQuote)으로 모든 채널을 본다
    () => (quote?.ok ? { input, days, pmChoice, quote: documentQuote(quote, input), rawQuote: quote, meta, company } : null),
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
    webChecks.clear();
    usp.reset();
    const result = await itinerary.generate(input, courseFile);
    if (!result) return;
    if (autoQuote.afterGenerate) autoQuote.armAfterGenerate();

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

  /**
   * 고른 항공편을 저장하고, 항공 이동일 항목(있으면)에 편명·시간을 반영한다.
   * 아직 코스를 만들기 전이면 출국·귀국 시각으로 출발일·일수·숙박 수도 맞춘다(일수 − 1로 단정하지 않음).
   * 코스를 만든 뒤에는 일정을 바꾸지 않고, 귀국일이 다르면 항공편 패널이 일수 조정을 안내한다.
   */
  const handleApplyFlight = (flight: FlightOption) => {
    const span = days.length === 0 ? tripSpanFromFlight(flight) : null;
    update({
      selectedFlight: flight,
      flightPricePerPerson: flight.price > 0 ? flight.price : input.flightPricePerPerson,
      costStatus: { ...input.costStatus, flight: "estimated" },
      ...withSource(input, "flight", "flight", [flight.airline, flight.flightNumber].filter(Boolean).join(" ")),
      ...(span ? { departureDate: span.departureDate, days: span.days, nights: span.nights, includesFlights: true } : {}),
    });
    itinerary.replaceDays(applyFlightToDays(days, flight));
  };

  // 견적에 넣은 원가를 여행지별로 기억해, 다음에 같은 여행지 견적을 만들 때 자동 견적이 불러온다
  useEffect(() => {
    if (quote?.ok) rememberCosts(input);
  }, [quote, input]);

  const autoQuote = useAutoQuote({ input, update, verifyFees: webChecks.verifyFees, hasItinerary: days.length > 0, itinerary: days });

  const exportData = () => {
    if (!quote?.ok) throw new Error("견적이 아직 준비되지 않았습니다.");
    return { input, days, pmChoice, quote, meta, usps: usp.state.status === "success" ? usp.usps : [] };
  };
  /** 고객에게 나가는 텍스트는 선택한 판매 채널의 소비자가로 만든다 */
  const customerExportData = () => {
    const data = exportData();
    return { ...data, quote: documentQuote(data.quote, input) };
  };

  /** 고객에게 나간 견적(인쇄·문구 복사)을 이력으로 남긴다 */
  const logIssued = (action: QuoteLogAction, document: string) => {
    if (quote?.ok) quoteLog.record(buildQuoteLogEntry(input, documentQuote(quote, input), quote, action, document, session.user?.name || quoteLog.author));
  };
  const printDocument = (kind: DocKind) => {
    print(kind);
    if (kind !== "internal") logIssued("print", DOC_LABELS[kind]);
  };

  // 화면 위 진행 안내 (① 입력 → ② 코스 → ③ 견적 → ④ 문서)
  const { steps: guideSteps, unconfirmed, stage: feedbackStage } = plannerGuide({
    input,
    days,
    pmChoice,
    quote,
    generating: itinerary.state.status === "loading",
    autoQuoteRunning: autoQuote.running,
    lastIssued: quoteLog.entries[0],
    actions: {
      goInput: () => {
        setTab("input");
        document.getElementById("planner-input")?.scrollIntoView({ block: "start", behavior: "smooth" });
      },
      generate: () => void handleGenerate(),
      goResult: () => setTab("result"),
      openSettings,
      runAutoQuote: () => void autoQuote.run(),
      goDocuments: () => {
        setTab("result");
        window.setTimeout(() => document.getElementById("documents")?.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
      },
    },
  });

  return (
    <>
    <PrintDocuments kind={printKind} data={docData} />
    <div className="screen-only flex h-dvh flex-col">
      <Header
        actions={
          <>
            <AccountMenu />
            <CompanySettings {...companyProfile} />
            <SavedPlansMenu snapshot={snapshot} onLoad={handleLoadPlan} onImportDay={itinerary.appendDayFromSegment} />
            <HistoryMenu log={quoteLog} teamSync={teamSync} />
            <SendToTourdesign getProduct={getProduct} />
            <FeedbackButton where={`${feedbackStage} 단계 · ${tab} 탭`} />
            <ErrorLogMenu />
          </>
        }
      />
      <StepGuide steps={guideSteps} />
      <MobileTabs active={tab} onChange={setTab} />
      {/* 좁은 화면: 탭 하나씩 / lg: 왼쪽에 입력+설정을 쌓고 오른쪽에 결과 / 넓은 화면(1400px~): 입력 | 결과 | 설정 3열 고정 */}
      <main className="grid min-h-0 flex-1 lg:grid-cols-[400px_minmax(0,1fr)] wide:grid-cols-[380px_minmax(0,1fr)_420px]">
        <div
          className={`min-h-0 overflow-y-auto border-slate-200 bg-slate-50 lg:block lg:border-r wide:contents ${
            tab === "result" ? "hidden" : "block"
          }`}
        >
        <aside
          aria-label="입력"
          className={`bg-slate-50 lg:block wide:order-1 wide:min-h-0 wide:overflow-y-auto wide:border-r wide:border-slate-200 ${
            tab === "input" ? "block" : "hidden"
          }`}
        >
          <StudioNotices provide={provide} productTitle={days.length ? (getProduct()?.title ?? "") : ""} studioNotice={studioNotice} onClearStudioNotice={clearStudioNotice} />
          <span id="planner-input" className="block scroll-mt-2" aria-hidden />
          <TripInputForm
            input={input}
            onChange={update}
            onReset={reset}
            onGenerate={handleGenerate}
            isGenerating={itinerary.state.status === "loading"}
            courseFile={courseFile}
            onCourseFileChange={setCourseFile}
            onApplyFlight={handleApplyFlight}
          />
        </aside>
        <aside
          aria-label="설정"
          className={`border-t border-slate-200 bg-slate-50 lg:block wide:order-3 wide:min-h-0 wide:overflow-y-auto wide:border-l wide:border-t-0 ${
            tab === "settings" ? "block" : "hidden"
          }`}
        >
          <SettingsPanel
            input={input}
            onChange={update}
            stays={stays}
            onApplyFlight={handleApplyFlight}
            focus={settingsFocus}
            onFocus={openSettings}
            auto={autoQuote}
          />
        </aside>
        </div>
        <section
          aria-label="결과"
          className={`min-h-0 overflow-y-auto bg-slate-100/60 lg:block wide:order-2 ${
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
            onReplaceDays={itinerary.replaceDays}
            onInputChange={update}
            onOpenSettings={openSettings}
            autoQuote={{ running: autoQuote.running, run: () => void autoQuote.run() }}
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
            feeCheck={webChecks.feeCheck}
            optionSuggest={webChecks.optionSuggest}
            accessibilityCheck={webChecks.accessibilityCheck}
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
              getCustomerText: () => {
                const text = buildCustomerText(customerExportData());
                logIssued("copy", "고객용 문구");
                return text;
              },
              getEmojiText: () => {
                const text = buildEmojiCustomerText(customerExportData());
                logIssued("copy", "이모지 고객용 문구");
                return text;
              },
            }}
            documents={{
              disabled: !quote?.ok,
              missingLegal: missingLegalFields(company),
              unconfirmed,
              onPrint: printDocument,
            }}
          />
        </section>
      </main>
    </div>
    </>
  );
}
