"use client";

import { useEffect, useMemo, useState } from "react";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { TripInputForm } from "@/components/form/TripInputForm";
import { Header } from "@/components/layout/Header";
import { CompanySettings } from "@/components/layout/CompanySettings";
import { PrintDocuments } from "@/components/print/PrintDocuments";
import { SavedPlansMenu } from "@/components/layout/SavedPlansMenu";
import { SendToTourdesign } from "@/components/layout/SendToTourdesign";
import { ErrorLogMenu } from "@/components/layout/ErrorLogMenu";
import { HistoryMenu } from "@/components/layout/HistoryMenu";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { FeedbackButton } from "@/components/layout/FeedbackButton";
import { BookingsMenu } from "@/components/layout/BookingsMenu";
import { MoreMenu } from "@/components/layout/MoreMenu";
import { bookingFromQuote } from "@/lib/bookings";
import { useSession } from "@/components/SessionContext";
import { StepGuide } from "@/components/layout/StepGuide";
import { StudioNotices } from "@/components/layout/StudioNotices";
import { MobileTabs, type PlannerTab } from "@/components/layout/MobileTabs";
import type { SettingsFocus, SettingsSection } from "@/components/form/settingsFocus";
import { InsightPanel } from "@/components/insight/InsightPanel";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { SectionCard } from "@/components/ui/SectionCard";
import { buildInsights, keyNumbers } from "@/lib/insights";
import { formatMoney } from "@/lib/currency";
import { useItinerary } from "@/hooks/useItinerary";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import { usePlannerInput } from "@/hooks/usePlannerInput";
import { useSegmentLibrary } from "@/hooks/useSegmentLibrary";
import { useUsp } from "@/hooks/useUsp";
import { useWebChecks } from "@/hooks/useWebChecks";
import { useQuoteLog } from "@/hooks/useQuoteLog";
import { useQuoteOutputs } from "@/hooks/useQuoteOutputs";
import { useTeamSync } from "@/hooks/useTeamSync";
import { useWorkPersistence } from "@/hooks/useWorkPersistence";
import { useStudioProductReceive } from "@/hooks/useStudioProductReceive";
import { useStudioProductProvide } from "@/hooks/useStudioProductProvide";
import { planToProduct } from "@/lib/planToProduct";
import { listenErrors } from "@/lib/errorReport";
import { missingLegalFields } from "@/lib/company";
import { calculateQuote } from "@/lib/cost";
import { rememberCosts } from "@/lib/costMemory";
import { useAutoQuote } from "@/hooks/useAutoQuote";
import { autoBuildStatus, useAutoBuild } from "@/hooks/useAutoBuild";
import { useBudgetFit } from "@/hooks/useBudgetFit";
import { slotOptions, tourToItem } from "@/lib/tourItem";
import { documentQuote } from "@/lib/pricing";
import { withSource } from "@/lib/costSource";
import { plannerGuide } from "@/lib/plannerGuide";
import { prewarmEstimates } from "@/lib/autoQuoteRequests";
import { timed } from "@/lib/perf";
import { suggestionToOption } from "@/lib/optionSuggestions";
import { newSegmentId, type SegmentKind } from "@/lib/segmentLibrary";
import { applyFlightWithMeals, tripSpanFromFlight } from "@/lib/flightApply";
import { dayItems, overnightNights } from "@/lib/itinerary";
import { tourToOption } from "@/lib/options";
import { buildUspRequest } from "@/lib/uspRequest";
import { suggestPlanName, type PlanSnapshot, type ResultSnapshot } from "@/lib/workspace";
import type { CourseFile } from "@/lib/courseFile";
import { supplierQuotePatch } from "@/lib/supplierQuote";
import { repairFlightTimes } from "@/lib/flightRepair";
import type { DayPlan, FlightOption, ItineraryItem, TourCandidate, TripInput } from "@/types";

const NO_USPS: never[] = [];

export function PlannerApp() {
  const { input, update, reset, replace } = usePlannerInput();
  const itinerary = useItinerary();
  const usp = useUsp();
  const [tab, setTab] = useState<PlannerTab>("input");
  const [settingsFocus, setSettingsFocus] = useState<SettingsFocus | null>(null);
  /** 입력 화면의 해당 폴더·항목을 펼치고 그곳으로 이동한다 (좁은 화면에서는 입력 탭으로 전환) */
  const openSettings = (section: SettingsSection) => {
    setTab("input");
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
  // 저장해 둔 일정을 되살릴 때, 항공 시각이 확인된 항공편(원문 시각·고른 항공편)과 어긋나 있으면 바로잡아서 넣는다
  const restoreResult = (saved: ResultSnapshot, forInput: TripInput = input) => {
    const fixed = repairFlightTimes(saved.days, forInput, saved.meta);
    itinerary.restore(fixed ? { ...saved, days: fixed } : saved);
    usp.restore(saved.usps, saved.uspKey);
  };
  useWorkPersistence(result, restoreResult);

  const snapshot = useMemo<PlanSnapshot>(() => ({ ...result, input }), [result, input]);
  const handleLoadPlan = (saved: PlanSnapshot) => {
    replace(saved.input);
    restoreResult(saved, saved.input);
    if (saved.days.length > 0) setTab("result");
  };

  /** 코스를 만든다. 만든 일정을 돌려준다(실패하면 null). 자동 구성에서 부르면 자동 견적은 자동 구성이 직접 돌린다 */
  const handleGenerate = async (options: { fromAutoBuild?: boolean } = {}): Promise<DayPlan[] | null> => {
    setTab("result");
    webChecks.clear();
    usp.reset();
    // 코스를 만드는 동안 비어 있는 차량·가이드·숙박·항공 시세를 미리 조회해 둔다 (자동 견적이 캐시에서 바로 받는다)
    prewarmEstimates(input);
    const result = await timed("generate", input.destination.trim(), () => itinerary.generate(input, courseFile));
    if (!result) return null;
    if (autoQuote.afterGenerate && !options.fromAutoBuild) autoQuote.armAfterGenerate();

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

    // 업체 견적서였으면 읽은 금액으로 "업체 공급가에서 시작"하는 견적으로 바꾼다 (목표 판매가는 그때까지 쓰던 판매가)
    if (result.supplierQuote) {
      const patch = await supplierQuotePatch(result.supplierQuote, nextInput, undefined, result.meta);
      update(patch);
      nextInput = { ...nextInput, ...patch };
    }

    // 일정이 만들어지면 세일즈 포인트도 이어서 생성한다 (실패해도 일정/견적에는 영향 없음)
    const firstQuote = calculateQuote(nextInput, result.days, result.pmChoice);
    if (firstQuote.ok) {
      void usp.generate(buildUspRequest(nextInput, result.days, result.pmChoice, firstQuote, result.meta));
    }
    return result.days;
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
    itinerary.replaceDays(applyFlightWithMeals(days, flight));
  };

  // 견적에 넣은 원가를 여행지별로 기억해, 다음에 같은 여행지 견적을 만들 때 자동 견적이 불러온다
  useEffect(() => {
    if (quote?.ok) rememberCosts(input);
  }, [quote, input]);

  /** 추천 투어를 판매가에 넣는다 — 일정이 가장 한가한 날(첫날·마지막 날 제외)의 마지막 칸에 */
  const insertTour = (tour: TourCandidate) => {
    if (days.length === 0) return;
    const middle = days.length > 2 ? days.slice(1, -1) : days;
    const target = [...middle].sort((a, b) => dayItems(a, pmChoice).length - dayItems(b, pmChoice).length)[0];
    const slots = slotOptions(target);
    itinerary.insertSegment(target.day, slots[slots.length - 1].slot, [tourToItem(tour)]);
  };

  const autoQuote = useAutoQuote({ input, update, verifyFees: webChecks.verifyFees, hasItinerary: days.length > 0, itinerary: days });
  const autoBuild = useAutoBuild({ input, update, days, pmChoice, generate: () => handleGenerate({ fromAutoBuild: true }), runAutoQuote: autoQuote.run });
  // 판매가·도매가에서 시작한 견적: 예산을 넘으면 줄이고 남으면 올린다
  const budgetFit = useBudgetFit({
    input,
    update,
    days,
    pmChoice,
    meta,
    quote,
    replaceDays: itinerary.replaceDays,
    hotelChoices: autoBuild.hotelChoices,
    tours: autoBuild.tours,
    insertTour,
    onHotelChosen: autoBuild.chooseHotel,
    onHotelRestore: autoBuild.restoreHotelPicks,
  });

  // 레이아웃3(요약·추천): 핵심 숫자와 고치면 좋은 것
  const money = (v: number) => formatMoney(Math.round(v), input.currency);
  const insightArgs = { input, days, pmChoice, meta, quote, budgetFit, money };
  const numbers = keyNumbers(insightArgs);
  const insights = buildInsights(insightArgs);
  const urgentCount = insights.filter((i) => i.tone === "warn").length;
  // 요약·추천은 한 곳에만 그린다: lg~1400px는 결과 위 접이, 그 밖(넓은 화면의 3칸째·좁은 화면의 추천 탭)은 오른쪽 칸
  const isLg = useMediaQuery("(min-width: 64rem)");
  const isWide = useMediaQuery("(min-width: 87.5rem)");
  const insightInResult = isLg && !isWide;
  /** 결과 화면의 이 id로 이동 (좁은 화면이면 결과 탭으로 바꾼 뒤) */
  const scrollToResult = (id: string) => {
    setTab("result");
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" }), 80);
  };
  const insightPanel = (
    <InsightPanel
      input={input}
      numbers={numbers}
      insights={insights}
      budgetFit={budgetFit}
      build={autoBuild}
      auto={autoQuote}
      money={money}
      onFocus={openSettings}
      onScrollTo={scrollToResult}
      onAddTourOption={(tour) => update({ options: [...input.options, tourToOption(tour, 0, input)] })}
      onInsertTour={insertTour}
      onFixFlight={() => {
        const fixed = repairFlightTimes(days, input, meta);
        if (fixed) itinerary.replaceDays(fixed);
      }}
    />
  );

  const { exporter, printDocument } = useQuoteOutputs({ input, days, pmChoice, meta, quote, usps, quoteLog, author: session.user?.name || quoteLog.author, print });

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
            <SavedPlansMenu snapshot={snapshot} onLoad={handleLoadPlan} onImportDay={itinerary.appendDayFromSegment} />
            <BookingsMenu
              author={session.user?.name || quoteLog.author}
              draftFromQuote={() => (quote?.ok ? { ...bookingFromQuote(input, documentQuote(quote, input)), planName: suggestPlanName(input, meta) } : null)}
              buttonClassName="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 [&>span]:hidden sm:[&>span]:inline"
            />
            <AccountMenu />
            <MoreMenu attention={missingLegalFields(company).length > 0}>
              <CompanySettings {...companyProfile} />
              <HistoryMenu log={quoteLog} teamSync={teamSync} />
              <SendToTourdesign getProduct={getProduct} />
              <FeedbackButton where={`${feedbackStage} 단계 · ${tab} 탭`} />
              <ErrorLogMenu />
            </MoreMenu>
          </>
        }
      />
      <StepGuide steps={guideSteps} />
      <MobileTabs active={tab} onChange={setTab} counts={{ insight: urgentCount }} />
      {/* 좁은 화면: 탭 하나씩(입력·결과·추천) / lg: 입력 | 결과(위에 요약·추천 접이) / 넓은 화면(1400px~): 입력 | 결과 | 요약·추천 */}
      <main className="grid min-h-0 flex-1 lg:grid-cols-[400px_minmax(0,1fr)] wide:grid-cols-[400px_minmax(0,1fr)_360px]">
        <aside
          aria-label="입력"
          className={`relative min-h-0 overflow-y-auto border-slate-200 bg-slate-50 lg:block lg:border-r ${tab === "input" ? "block" : "hidden"}`}
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
            stays={stays}
            focus={settingsFocus}
            onAutoBuild={() => void autoBuild.run()}
            autoBuilding={autoBuild.running}
            autoStatus={autoBuildStatus(autoBuild)}
            onShowProgress={() => {
              setTab(insightInResult ? "result" : "insight");
              window.setTimeout(() => document.getElementById("build-progress")?.scrollIntoView({ block: "start", behavior: "smooth" }), 60);
            }}
          />
        </aside>
        <section
          aria-label="결과"
          className={`relative min-h-0 overflow-y-auto bg-slate-100/60 lg:block ${tab === "result" ? "block" : "hidden"}`}
        >
          {/* lg~1400px: 레이아웃3이 들어갈 자리가 없어 결과 위에 접이로 둔다 */}
          {insightInResult && (
          <div className="p-4 pb-0">
            <SectionCard
              title={`요약 · 추천${insights.length > 0 ? ` ${insights.length}건` : ""}`}
              collapsible
              summary={numbers ? `1인 ${money(numbers.pricePerPerson)} · 수익률 ${numbers.marginRate.toFixed(1)}%${urgentCount > 0 ? ` · 확인 ${urgentCount}건` : ""}` : "견적 전"}
            >
              {insightPanel}
            </SectionCard>
          </div>
          )}
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
            budgetFit={budgetFit}
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
            exporter={exporter}
            documents={{
              disabled: !quote?.ok,
              missingLegal: missingLegalFields(company),
              unconfirmed,
              onPrint: printDocument,
            }}
          />
        </section>
        <aside
          aria-label="요약 · 추천"
          className={`relative min-h-0 overflow-y-auto border-slate-200 bg-slate-50 p-4 lg:hidden wide:block wide:border-l ${tab === "insight" ? "block" : "hidden"}`}
        >
          {!insightInResult && insightPanel}
        </aside>
      </main>
    </div>
    </>
  );
}
