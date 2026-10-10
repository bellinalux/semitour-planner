"use client";

import { useShowOps } from "@/hooks/useShowOps";
import { OpsToggle } from "@/components/layout/OpsToggle";
import { insertDays, placeNames, shiftOptions, shortenOne } from "@/lib/nightsChange";
import { fitCourse } from "@/lib/courseFit";
import { tidyDays } from "@/lib/dayTidy";
import { Undo2 } from "lucide-react";
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
import { DayTourMenu } from "@/components/daytour/DayTourMenu";
import { MoreMenu } from "@/components/layout/MoreMenu";
import { WelcomeGuide } from "@/components/layout/WelcomeGuide";
import { CommandPalette, plannerCommands } from "@/components/layout/CommandPalette";
import { InstallApp } from "@/components/layout/InstallApp";
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
import { buildSharedItinerary } from "@/lib/shareItinerary";
import { loadPriceRules, ruleNotices } from "@/lib/seriesPricing";
import { englishTexts } from "@/lib/englishDoc";
import type { DocLang } from "@/lib/foreignDoc";
import { departureNotice } from "@/lib/departureNotice";
import { buildGuideSheet } from "@/lib/guideSheet";
import { citiesOf, coursePlaces } from "@/lib/knowledge";
import { useKnowledgeEdits } from "@/hooks/useKnowledgeEdits";
import { usePreResearch } from "@/hooks/usePreResearch";
import { KnowledgeMenu } from "@/components/layout/KnowledgeMenu";
import { RateBookMenu } from "@/components/layout/RateBookMenu";
import { addVersion, loadVersions, makeVersion, versionKey, type QuoteVersion } from "@/lib/quoteVersions";
import { packingList, packingText } from "@/lib/packingList";
import type { TravelInfo } from "@/lib/schemas/travelInfo";
import { postJson } from "@/lib/api";
import { DOC_LABELS, type DocKind } from "@/components/print/PrintDocuments";
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
import { supplierOptions, tourToOption } from "@/lib/options";
import { buildUspRequest } from "@/lib/uspRequest";
import { newPlanId, suggestPlanName, type PlanSnapshot, type ResultSnapshot } from "@/lib/workspace";
import { useSavedPlans } from "@/hooks/useSavedPlans";
import type { CourseFile } from "@/lib/courseFile";
import { supplierQuotePatch } from "@/lib/supplierQuote";
import { knownFlight, repairFlightTimes } from "@/lib/flightRepair";
import { useCompetitorAutoFind } from "@/hooks/useCompetitorAutoFind";
import { CompetitorItinerariesContext, useCompetitorItineraries } from "@/hooks/useCompetitorItineraries";
import { useVerifyPipeline, VerifyPipelineContext } from "@/hooks/useVerifyPipeline";
import { useUndoHistory } from "@/hooks/useUndoHistory";
import { useFxDrift } from "@/hooks/useFxDrift";
import { useSeasonCheck } from "@/hooks/useSeasonCheck";
import { useOps } from "@/hooks/useOps";
import { useCompetitorRefresh } from "@/hooks/useCompetitorRefresh";
import { useCompetitorWatch } from "@/hooks/useCompetitorWatch";
import { dueChecklist } from "@/lib/opsStore";
import { bookingChecklist } from "@/lib/bookingChecklist";
import { applyFxPatch } from "@/lib/fxDrift";
import { addSupplierRecord, loadSupplierHistory, recordFromQuote } from "@/lib/supplierHistory";
import { SUPPLIER_HISTORY_EVENT } from "@/components/dashboard/quote/SupplierHistoryPanel";
import { TaskTray } from "@/components/layout/TaskTray";
import { CourseEngineContext, useCourseEngine } from "@/hooks/useCourseEngine";
import { DayTimeCheckContext, useDayTimeCheck } from "@/hooks/useDayTimeCheck";
import type { DayPlan, FlightOption, ItineraryItem, TourCandidate, TripInput } from "@/types";

const NO_USPS: never[] = [];
const NO_WORDS: Record<string, string> = {};

export function PlannerApp() {
  const { input, update, reset, replace } = usePlannerInput();
  // 타업체 상품 자동 찾기 (코스를 만들면 비교표를 바로 채운다)
  const competitorFind = useCompetitorAutoFind(update);
  // 타업체 일정·선택관광 가져오기 (상품 비교 보기와 한 번에 검증이 같이 쓴다)
  const competitorItineraries = useCompetitorItineraries(input, update);
  const itinerary = useItinerary();
  // 일정을 통째로 바꾸는 작업의 되돌리기 기록 (화면 오른쪽 아래 "되돌리기"·Ctrl+Z)
  const history = useUndoHistory(itinerary.days, itinerary.replaceDays);
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
  const webChecks = useWebChecks({ input, days, meta, replaceDays: history.labeled("입장료·체류시간 확인") });
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
  // 영문 일정표·견적서용 번역 (한글 글 → 영어, 이 화면에서 모아 둔다)
  const [translationsByLang, setTranslationsByLang] = useState<Partial<Record<DocLang, Record<string, string>>>>({});
  const translations = translationsByLang.en ?? NO_WORDS;
  const [translating, setTranslating] = useState(false);
  // 일정표 「여행 정보」 (시차·전압·통화·입국·긴급 연락처) — 일정표를 인쇄할 때 한 번 찾는다
  const [travelInfo, setTravelInfo] = useState<{ key: string; info: TravelInfo } | null>(null);
  // 인쇄 문서는 견적이 준비된 뒤에만 만들 수 있다
  const docData = useMemo(
    // 고객 문서는 선택한 판매 채널의 소비자가를 쓰고, 내부 검토서는 원래 견적(rawQuote)으로 모든 채널을 본다
    () =>
      quote?.ok
        ? { input, days, pmChoice, quote: documentQuote(quote, input), rawQuote: quote, meta, company, translations, translationsByLang, travelInfo: travelInfo?.key === input.destination.trim() ? travelInfo.info : null }
        : null,
    [quote, input, days, pmChoice, meta, company, translations, translationsByLang, travelInfo],
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
  const currentInput = input;
  const handleGenerate = async (options: { fromAutoBuild?: boolean; override?: Partial<TripInput> } = {}): Promise<DayPlan[] | null> => {
    // 고객 유형별 변형처럼 입력 일부를 바꿔 바로 만들 때 (상태가 바뀌기 전이라 직접 합친다)
    const input: TripInput = options.override ? { ...currentInput, ...options.override } : currentInput;
    setTab("result");
    webChecks.clear();
    usp.reset();
    // 코스를 만드는 동안 비어 있는 차량·가이드·숙박·항공 시세를 미리 조회해 둔다 (자동 견적이 캐시에서 바로 받는다)
    prewarmEstimates(input);
    const result = await timed("generate", input.destination.trim(), () => itinerary.generate(input, courseFile));
    if (!result) return null;
    // 업체 견적서는 아래에서 견적서 내용을 넣은 다음에 자동 견적을 건다 (호텔 이름별 시세를 찾도록)
    if (autoQuote.afterGenerate && !options.fromAutoBuild && !result.supplierQuote) autoQuote.armAfterGenerate();
    // 업체 견적서는 아래 '한 번에 검증'에서 시간 검증·코스 점검까지 하므로 따로 걸지 않는다
    if (courseEngine.autoCheck && !result.supplierQuote) courseEngine.armAfterGenerate();

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
      const quotePatch = await supplierQuotePatch(result.supplierQuote, nextInput, undefined, result.meta);
      // 견적서의 불포함·선택관광 중 금액이 적힌 것(예: 홍콩 데이투어)은 선택 옵션으로 등록한다
      const extra = quotePatch.supplierQuote ? supplierOptions(quotePatch.supplierQuote, nextInput) : [];
      const patch = extra.length > 0 ? { ...quotePatch, options: [...nextInput.options, ...extra] } : quotePatch;
      update(patch);
      nextInput = { ...nextInput, ...patch };
      // 업체 견적 기록에 쌓는다 (같은 여행지 여러 업체·같은 업체 지난 요금과 견주기)
      if (patch.supplierQuote) {
        addSupplierRecord(loadSupplierHistory(), recordFromQuote(patch.supplierQuote, nextInput, courseFile?.name ?? "붙여넣은 견적", result.meta?.packageName ?? ""));
        window.dispatchEvent(new Event(SUPPLIER_HISTORY_EVENT));
      }
      // 업체 견적서를 읽었으면 우리 시세(견적서 호텔별 숙박·차량·가이드·팁·보험)를 바로 조회해 업체 몫 추정까지 보여 준다
      // 업체 견적서를 읽었으면 한 번에 검증: 시세 → 시간 검증 → 코스 점검 → 타업체 찾기 → 타업체 일정 가져오기
      if (!options.fromAutoBuild) verifyPipeline.start();
    }

    // 타업체 상품을 자동으로 찾아 비교한다 — 자동 견적이 돌면 그쪽에서 찾으므로 그때는 건너뛴다
    const autoQuoteRuns = !options.fromAutoBuild && (autoQuote.afterGenerate || !!result.supplierQuote);
    if (!options.fromAutoBuild && !autoQuoteRuns) competitorFind.run(nextInput, knownFlight(result.days, nextInput, result.meta));

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

  // 고객 유형별 변형 — 지금 상품을 이 브라우저에 저장해 두고, 동반자·강도·여행 유형을 바꿔 코스를 다시 만든다
  const localPlans = useSavedPlans();
  const makeVariant = async (patch: Partial<TripInput>, label: string): Promise<string> => {
    const name = `${suggestPlanName(input, meta)} (원본)`.slice(0, 60);
    const saved = localPlans.save({ id: newPlanId(), name, snapshot });
    update(patch);
    const days = await handleGenerate({ override: patch });
    if (!days) return `${label}을(를) 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.`;
    return saved.ok ? `${label}을(를) 만들었습니다. 원래 상품은 "${name}"으로 저장해 두었습니다 (저장·불러오기 → 이 브라우저).` : `${label}을(를) 만들었습니다 (원래 상품 저장은 실패 — ${saved.error}).`;
  };

  // 박수 바꾸기 — 줄이면 가벼운 날을 빼고 장소는 다른 날로, 늘리면 새 날을 만들어 마지막 날 앞에
  const changeNights = async (delta: number): Promise<string> => {
    const label = `${input.nights + delta}박 ${input.days + delta}일`;
    if (delta < 0) {
      let work = days;
      let options = input.options;
      const moved: string[] = [];
      const dropped: string[] = [];
      for (let k = 0; k < -delta; k++) {
        const r = shortenOne(work, pmChoice);
        if (!r) return `더 줄일 수 있는 날이 없습니다 (첫날·마지막 날·항공일은 빼지 않음).`;
        work = r.days;
        options = shiftOptions(options, r.removedDay, null);
        moved.push(...r.moved);
        dropped.push(...r.dropped);
      }
      history.labeled("박수 바꾸기")(work);
      update({ days: input.days + delta, nights: input.nights + delta, options });
      return `${label}로 줄였습니다.${moved.length ? ` 옮긴 곳: ${moved.join(", ")}.` : ""}${dropped.length ? ` 빠진 곳: ${dropped.join(", ")}.` : ""}`;
    }
    try {
      const r = await postJson<{ days: DayPlan[] }>("/api/generate-itinerary", {
        destination: input.destination,
        days: delta,
        travelers: input.travelers,
        currency: input.currency,
        themes: input.themes,
        notes: `${input.notes}\n이미 일정에 있는 곳은 넣지 않습니다: ${placeNames(days).join(", ")}`.slice(0, 500),
        travelType: input.travelType,
        tripScope: input.tripScope,
        regionPlan: "",
        pace: input.pace,
        companions: input.companions,
        mustHave: "",
        avoid: input.avoid,
      });
      const fresh = fitCourse(tidyDays(r.days), { walk: false }).days;
      const { days: next, insertedAt } = insertDays(days, fresh);
      history.labeled("박수 바꾸기")(next);
      update({ days: input.days + delta, nights: input.nights + delta, options: shiftOptions(input.options, null, insertedAt, delta) });
      return `${label}로 늘렸습니다. 새 날: DAY ${insertedAt}${delta > 1 ? `~${insertedAt + delta - 1}` : ""} (지금 없는 인기 장소로).`;
    } catch (e) {
      return e instanceof Error ? e.message : "새 날을 만들지 못했습니다.";
    }
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
    history.labeled("항공편 적용")(applyFlightWithMeals(days, flight));
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
    replaceDays: history.labeled("예산 맞추기"),
    hotelChoices: autoBuild.hotelChoices,
    tours: autoBuild.tours,
    insertTour,
    onHotelChosen: autoBuild.chooseHotel,
    onHotelRestore: autoBuild.restoreHotelPicks,
  });

  // 하루 일정 시간 검증 (구역 단위 웹 확인) — 요약·추천과 일정 카드의 '시간 검증'에서 쓴다
  const dayTimeCheck = useDayTimeCheck({ input, days, pmChoice, replaceDays: history.labeled("일정 시간 검증") });

  // 코스 엔진 점검 — 점검 상자·일정 카드 점수 배지·요약·추천이 같이 쓴다. 자동 점검을 켜면 코스를 만든 뒤 긴 날 시간 검증 → 엔진 점검
  // 운영 기능(예약 관리·출발 준비·출발 전 안내문)은 기본으로 숨긴다 — 이 앱은 패키지·코스 만들기용
  const [showOps] = useShowOps();

  // 지식 창고 미리 조사 — 여행지를 적으면 그 도시를, 하루 한 번 최근 견적 여행지를 (오래된 것만 실제로 조사)
  usePreResearch({
    destination: input.destination,
    enabled: input.mode === "ai",
    travelType: input.travelType,
    tripScope: input.tripScope,
    companions: input.companions,
    recent: quoteLog.entries.map((e) => e.destination),
  });

  // 직원 수정(뺀 곳·넣은 곳)을 지식 창고에 배운다
  const knowledgeEdits = useKnowledgeEdits(citiesOf(input.destination)[0] ?? "");

  const courseEngine = useCourseEngine({
    days,
    pmChoice,
    destination: input.destination.trim(),
    departureDate: input.departureDate || undefined,
    travelType: input.travelType,
    currency: input.currency,
    tripScope: input.tripScope,
    replaceDays: history.labeled("코스 점검 적용"),
    saveCoords: itinerary.replaceDays,
    reorderReplace: history.labeled("코스 재정렬"),
    beforeAuto: { run: dayTimeCheck.run, busy: dayTimeCheck.running !== null },
  });

  // 한 번에 검증 (업체 견적서를 올리면 자동, 요약·추천의 버튼으로도)
  const verifyPipeline = useVerifyPipeline({
    days,
    pmChoice,
    competitorCount: input.competitors.length,
    autoQuote,
    dayTime: dayTimeCheck,
    engine: { run: () => courseEngine.run() },
    itineraries: competitorItineraries,
  });

  // 경쟁 상품 가격 정기 확인 (마지막 확인 7일 뒤 화면을 열면 백그라운드로)
  const competitorWatch = useCompetitorRefresh(input, update);
  useCompetitorWatch(input, competitorWatch, isReady);

  // 출발 준비·명단·정산 (상품 이름별 저장)
  const planKey = suggestPlanName(input, meta);
  const ops = useOps(planKey);
  // 견적 버전 (고객에게 나간 견적의 변경 내역)
  const [versionState, setVersionState] = useState<{ key: string; list: QuoteVersion[] } | null>(null);
  const vKey = versionKey(input, meta);
  const versions = versionState?.key === vKey ? versionState.list : typeof window === "undefined" ? [] : loadVersions(vKey);
  const saveVersion = (label: string) => {
    if (!docData) return;
    setVersionState({ key: vKey, list: addVersion(vKey, makeVersion(docData, label)) });
  };
  const opsOverdue = quote?.ok && days.length > 0 ? dueChecklist(bookingChecklist(input, days, pmChoice, quote.travelers), ops.data.checklist).overdue.length : 0;

  // 외화 업체 견적: 받을 때 환율과 지금 환율 비교
  const fx = useFxDrift(input);
  // 출발 시기 확인: 출발일이 정해지고 일정이 있으면 날씨·현지 공휴일·축제·휴관·혼잡을 확인
  const season = useSeasonCheck(
    days.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(input.departureDate) && input.destination.trim()
      ? { destination: input.destination.trim(), departureDate: input.departureDate, days: Math.max(1, Math.min(60, input.days || days.length)) }
      : null,
  );

  // 레이아웃3(요약·추천): 핵심 숫자와 고치면 좋은 것
  const money = (v: number) => formatMoney(Math.round(v), input.currency);
  const insightArgs = { input, days, pmChoice, meta, quote, budgetFit, money, engine: { scores: courseEngine.scores, moves: courseEngine.moves, zigzags: courseEngine.zigzags, zigzagFixable: courseEngine.zigzagFixable }, fx: fx.drift, season: season.result, opsOverdue };
  const numbers = keyNumbers(insightArgs);
  // 영업 권한은 원가·공급가·예산 관련 추천을 숨긴다
  const insights = buildInsights(insightArgs).filter((i) => session.user?.role !== "sales" || !/^(supplier-|fx-drift|budget-|upgrade-)/.test(i.id));
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
      dayTime={dayTimeCheck}
      engine={courseEngine}
      competitorFind={competitorFind}
      pipeline={verifyPipeline}
      onApplyFx={() => {
        if (fx.current) update(applyFxPatch(input, fx.current));
      }}
      onConfirmCosts={(keys) => update({ costStatus: { ...input.costStatus, ...Object.fromEntries(keys.map((k) => [k, "confirmed" as const])) } })}
      onFixFlight={() => {
        const fixed = repairFlightTimes(days, input, meta);
        if (fixed) history.labeled("항공 시각 맞추기")(fixed);
      }}
    />
  );

  const { exporter, printDocument: printPlain } = useQuoteOutputs({ input, days, pmChoice, meta, quote, usps, quoteLog, author: session.user?.name || quoteLog.author, print });

  /** 영문 문서·링크용 — 아직 번역하지 않은 한글 글을 번역해 번역표를 돌려준다 (실패하면 null) */
  const ensureForeign = async (lang: DocLang, info?: TravelInfo | null): Promise<Record<string, string> | null> => {
    if (!docData) return null;
    const have = translationsByLang[lang] ?? {};
    const texts = englishTexts({ ...docData, travelInfo: info ?? docData.travelInfo }).filter((t) => !(t in have));
    if (texts.length === 0) return have;
    setTranslating(true);
    try {
      const r = await postJson<{ translations: string[] }>("/api/translate-doc", { texts, lang });
      const next = { ...have, ...Object.fromEntries(texts.map((t, i) => [t, r.translations[i] ?? t])) };
      setTranslationsByLang((prev) => ({ ...prev, [lang]: next }));
      return next;
    } catch {
      return null;
    } finally {
      setTranslating(false);
    }
  };

  /** 일정표 여행 정보 — 같은 여행지는 한 번만 (서버가 30일 보관). 못 찾아도 인쇄는 한다 */
  const ensureTravelInfo = async (): Promise<TravelInfo | null> => {
    const dest = input.destination.trim();
    if (!dest) return null;
    if (travelInfo?.key === dest) return travelInfo.info;
    setTranslating(true);
    try {
      const info = await postJson<TravelInfo>("/api/travel-info", { destination: dest, month: /^\d{4}-\d{2}/.test(input.departureDate) ? input.departureDate.slice(0, 7) : "" });
      setTravelInfo({ key: dest, info });
      return info;
    } catch {
      /* 여행 정보 없이 인쇄 */
      return null;
    } finally {
      setTranslating(false);
    }
  };

  /** 문서 인쇄 — 영문 문서는 아직 번역하지 않은 글을 먼저 번역하고, 일정표는 여행 정보를 먼저 찾는다 */
  const printDocument = async (kind: DocKind) => {
    if (kind === "itinerary" || kind === "packing" || kind === "operation") await ensureTravelInfo();

    const foreign: Partial<Record<DocKind, DocLang>> = { english: "en", japanese: "ja", chinese: "zh" };
    const lang = foreign[kind];
    if (lang && !(await ensureForeign(lang, await ensureTravelInfo()))) {
      window.alert("영문 번역을 하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
      return;
    }
    // 고객에게 나가는 문서는 견적 버전으로 남긴다 (내용이 같으면 새로 만들지 않음)
    if (["quote", "itinerary", "options", "english", "japanese", "chinese", "pitch"].includes(kind)) saveVersion(`${DOC_LABELS[kind]} 인쇄`);
    printPlain(kind);
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
    <PrintDocuments kind={printKind} data={docData ? { ...docData, season: season.result } : null} />
    <div className="screen-only pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 flex flex-col items-end gap-2 [&>*]:pointer-events-auto">
    {history.last && (
      <button
        type="button"
        onClick={history.undo}
        title="Ctrl+Z로도 되돌릴 수 있습니다"
        className="inline-flex max-w-[calc(100vw-2rem)] items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-md hover:bg-slate-50"
      >
        <Undo2 className="size-3.5" aria-hidden />
        <span className="truncate">되돌리기 — {history.last}</span>
        {history.count > 1 && <span className="font-normal text-slate-400">({history.count})</span>}
      </button>
    )}
    <TaskTray
      tasks={[
        { key: "generate", label: "코스 만들기 / 업체 견적서 읽기", running: itinerary.state.status === "loading", typical: "30초~1분" },
        { key: "autobuild", label: "자동 구성", running: autoBuild.running, typical: "1~2분" },
        { key: "autoquote", label: "시세 조회 (자동 견적)", running: autoQuote.running, typical: "30초~1분" },
        { key: "fees", label: "입장료·체류시간 웹 확인", running: webChecks.feeCheck.state.status === "loading", typical: "30초~1분" },
        { key: "daytime", label: `일정 시간 검증${dayTimeCheck.running ? ` (DAY ${dayTimeCheck.running.join(", ")})` : ""}`, running: dayTimeCheck.running !== null, typical: "1분 안팎" },
        { key: "engine", label: "코스 점검", running: courseEngine.running, typical: "하루 10~40초" },
        { key: "translate", label: "문서 준비 (번역·여행 정보)", running: translating, typical: "10~30초" },
        { key: "watch", label: "경쟁 상품 가격 정기 확인", running: competitorWatch.running, typical: "30초~1분" },
        { key: "season", label: "출발 시기 확인 (날씨·공휴일·축제)", running: season.running, typical: "20~40초" },
        { key: "competitors", label: "타업체 상품 찾기", running: competitorFind.running, typical: "30초~1분" },
        { key: "itineraries", label: `타업체 일정 가져오기 (${competitorItineraries.pending}개 남음)`, running: competitorItineraries.running.length > 0, typical: "상품당 30초" },
      ]}
    />
    </div>
    <div className="screen-only flex h-dvh flex-col">
      <Header
        actions={
          <>
            <CommandPalette
              commands={plannerCommands({
                scroll: scrollToResult,
                settings: openSettings,
                input: () => {
                  setTab("input");
                  document.getElementById("planner-input")?.scrollIntoView({ block: "start", behavior: "smooth" });
                },
              })}
            />
            <SavedPlansMenu snapshot={snapshot} onLoad={handleLoadPlan} onImportDay={itinerary.appendDayFromSegment} />
            {showOps && <BookingsMenu
              author={session.user?.name || quoteLog.author}
              companyName={company.name}
              onFillInput={(patch) => {
                update(patch);
                setTab("input");
              }}
              draftFromQuote={() =>
                quote?.ok ? { ...bookingFromQuote(input, documentQuote(quote, input)), planName: suggestPlanName(input, meta), city: citiesOf(input.destination)[0] ?? "", places: coursePlaces(days, pmChoice) } : null
              }
              buttonClassName="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 [&>span]:hidden sm:[&>span]:inline"
            />}
            <DayTourMenu
              input={input}
              company={{ name: company.name, phone: company.phone, email: company.email }}
              dayCount={days.length}
              onAddOption={(tour, dayNo, price) =>
                update({ options: [...input.options, { ...tourToOption(tour, dayNo, input), costPerPerson: price.cost, pricePerPerson: price.sale }] })
              }
              buttonClassName="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 [&>span]:hidden sm:[&>span]:inline"
            />
            <AccountMenu />
            <MoreMenu attention={missingLegalFields(company).length > 0}>
              <WelcomeGuide />
              <InstallApp />
              <CompanySettings {...companyProfile} />
              <HistoryMenu log={quoteLog} teamSync={teamSync} />
              <KnowledgeMenu defaultCity={citiesOf(input.destination)[0] ?? ""} travelType={input.travelType} tripScope={input.tripScope} />
              <RateBookMenu defaultCity={citiesOf(input.destination)[0] ?? ""} />
              <OpsToggle />
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
          <DayTimeCheckContext.Provider value={dayTimeCheck}>
          <CourseEngineContext.Provider value={courseEngine}>
          <CompetitorItinerariesContext.Provider value={competitorItineraries}>
          <VerifyPipelineContext.Provider value={verifyPipeline}>
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
            onInputChange={update}
            onReplaceDays={history.labeled("가격 낮추기")}
            onRegroupDays={history.labeled("지역 묶기")}
            onPaceDays={history.labeled("쉬는 날")}
            onProductDays={history.labeled("상품 등급·변형")}
            onVariant={makeVariant}
            onNights={changeNights}
            onOpenSettings={openSettings}
            autoQuote={{ running: autoQuote.running, run: () => void autoQuote.run() }}
            budgetFit={budgetFit}
            itemActions={{
              onChangeItem: itinerary.updateItem,
              onChangeDay: itinerary.updateDay,
              onDeleteItem: (itemId) => {
                // AI가 넣은 장소를 직원이 지우면 지식 창고에 "뺀 곳"으로 배운다
                const it = days.flatMap((d) => [...d.items, ...d.amGuided, ...d.pmFreeOptions.flatMap((o) => o.items)]).find((i) => i.id === itemId);
                if (it?.isEstimated && !["flight", "transfer", "hotel", "free_time", "meal"].includes(it.type ?? "sightseeing")) knowledgeEdits.removed(it.name);
                itinerary.deleteItem(itemId);
              },
              onAddItem: itinerary.addItem,
              onAddTour: (dayNo, slot, item) => {
                knowledgeEdits.added(item.name);
                itinerary.addTour(dayNo, slot, item);
              },
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
            ops={!showOps ? undefined : { ...ops, title: planKey, companyName: company.name, guide: { planKey, city: citiesOf(input.destination)[0] ?? "", build: (withNames) => (docData ? buildGuideSheet(docData, withNames ? ops.data.participants : []) : null) } }}
            versions={{ versions, currency: input.currency, customer: input.customerName.trim(), onSaveNow: () => saveVersion("직접 저장") }}
            notice={!showOps ? undefined : {
              buildNotice: async () => (docData ? departureNotice(docData, await ensureTravelInfo(), season.result) : null),
              buildPacking: async () => (docData ? packingText(packingList(input, days, pmChoice, await ensureTravelInfo(), season.result)) : null),
              onPrintPacking: () => void printDocument("packing"),
            }}
            share={{ build: (showPrice, words, lang) => (docData ? buildSharedItinerary(docData, showPrice, new Date(), ruleNotices(loadPriceRules()), words, lang) : null), translate: (lang) => ensureForeign(lang), planKey }}
            documents={{
              disabled: !quote?.ok,
              missingLegal: missingLegalFields(company),
              unconfirmed,
              onPrint: printDocument,
            }}
          />
          </VerifyPipelineContext.Provider>
          </CompetitorItinerariesContext.Provider>
          </CourseEngineContext.Provider>
          </DayTimeCheckContext.Provider>
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
