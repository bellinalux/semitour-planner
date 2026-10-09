import { AlertTriangle, Calculator } from "lucide-react";
import { useEffect, useState } from "react";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import type { SettingsSection } from "@/components/form/SettingsPanel";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { ourPolicy } from "@/lib/competitorDiff";
import { buildTourCompare } from "@/lib/tourCompare";
import { budgetPlan } from "@/lib/budget";
import { lodgingRoomsFor } from "@/lib/cost";
import { formatMoney } from "@/lib/currency";
import { BudgetPanel } from "./quote/BudgetPanel";
import { CostSheetPanel } from "./quote/CostSheetPanel";
import { BudgetFitBox } from "./quote/BudgetFitBox";
import type { BudgetFitView } from "@/hooks/useBudgetFit";
import { bindingChannel, buildPriceTiers, singleSupplement } from "@/lib/pricing";
import type { PmChoice } from "@/lib/itinerary";
import type { AsyncState, CourseMeta, CurrencyCode, DayPlan, PackageType, QuoteResult, TripInput } from "@/types";
import { ChannelTable } from "./quote/ChannelTable";
import { CompetitorTable } from "./quote/CompetitorTable";
import { TourCompareTable } from "./quote/TourCompareTable";
import { CostBreakdownTable } from "./quote/CostBreakdownTable";
import { DeparturePricesPanel } from "./quote/DeparturePricesPanel";
import { DiscountSimulator } from "./quote/DiscountSimulator";
import { FxSensitivityPanel } from "./quote/FxSensitivityPanel";
import { PerPersonMatrix } from "./quote/PerPersonMatrix";
import { PriceGapAnalysis } from "./quote/PriceGapAnalysis";
import { PriceTiersCard } from "./quote/PriceTiersCard";
import { QuoteKpis } from "./quote/QuoteKpis";
import { RateStructurePanel } from "./quote/RateStructurePanel";
import { ScenarioCompare } from "./quote/ScenarioCompare";
import { UndecidedRange } from "./quote/UndecidedRange";
import { priceIsGiven } from "@/lib/channels";

interface Props {
  /** 견적은 일정 결과에 의존하므로 일정 상태를 그대로 받는다 */
  state: AsyncState;
  /** 일정이 성공적으로 만들어진 뒤에만 값이 있다 */
  quote: QuoteResult | null;
  input: TripInput;
  days: DayPlan[];
  pmChoice: PmChoice;
  meta: CourseMeta | null;
  generatedCurrency: CurrencyCode | null;
  /** 할인 시나리오·가격안 저장처럼 견적 화면에서 입력값을 바꾸는 곳에서 쓴다 */
  onInputChange: (patch: Partial<TripInput>) => void;
  /** 경고에서 설정 패널의 해당 항목으로 이동한다 */
  onOpenSettings: (section: SettingsSection) => void;
  autoQuote: { running: boolean; run: () => void };
  /** 판매가·도매가에서 시작한 견적의 예산 맞추기 */
  budgetFit?: BudgetFitView | null;
}

/** 경고 문구가 가리키는 설정 항목. 없으면 바로 가기를 만들지 않는다 */
function settingsTargetFor(warning: string): SettingsSection | null {
  if (/차량|가이드/.test(warning)) return "cost";
  if (/숙박|항공료|풀패키지/.test(warning)) return "package";
  if (/마진|수수료|채널/.test(warning)) return "pricing";
  return null;
}

function QuoteSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="견적 계산 중">
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-xs font-semibold text-slate-800">{children}</h3>;
}

const PACKAGE_LABELS: Record<PackageType, string> = {
  land: "랜드만",
  land_hotel: "랜드+숙박",
  full: "풀패키지 (항공 포함)",
};

const VIEW_KEY = "semitour-planner:quote-view:v1";
type QuoteView = "summary" | "detail";

/** 요약(판매가·추천가·원가·경쟁사)과 자세히(채널·할인·환율·출발일별 등) 중 고른 보기를 기억한다 */
function useQuoteView(): [QuoteView, (v: QuoteView) => void] {
  const [view, setView] = useState<QuoteView>("summary");
  useEffect(() => {
    try {
      // 브라우저 저장소 값이라 화면을 그린 뒤에 읽는다
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(VIEW_KEY) === "detail") setView("detail");
    } catch {
      // 무시
    }
  }, []);
  const change = (v: QuoteView) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // 무시
    }
  };
  return [view, change];
}

function QuoteContent({ quote, input, days, pmChoice, meta, generatedCurrency, onInputChange, onOpenSettings, autoQuote, budgetFit }: Omit<Props, "state" | "quote"> & { quote: QuoteResult }) {
  const [view, setView] = useQuoteView();
  if (!quote.ok) return <ErrorBanner title="견적을 계산할 수 없습니다" message={quote.error} />;

  const policy = ourPolicy(days, pmChoice, input, meta);
  const tourCompare = buildTourCompare(input, days, pmChoice, quote, meta);
  // 판매가·도매가에서 시작한 견적이면 원가 예산과 지금 원가를 비교한다
  const budget = budgetPlan(input, quote, quote.groundDays);
  const single = singleSupplement(quote, input);
  const tiers = buildPriceTiers(quote, input, policy);
  const binding = bindingChannel(quote, input);
  const priceNote =
    !priceIsGiven(input.pricingMode) && input.channelPriceMode === "parity" && quote.channels.length > 1
      ? `모든 채널 같은 가격 · '${binding.name}' 수수료 기준`
      : undefined;
  const hasFxData = input.currency !== "KRW" && input.exchangeRateToKrw > 0;

  // 일정을 만든 뒤 입력이 바뀌어 일정의 금액과 견적이 어긋나는 경우
  const staleWarnings: string[] = [];
  if (generatedCurrency && generatedCurrency !== input.currency) {
    staleWarnings.push(
      `일정의 입장료·식대는 ${generatedCurrency} 기준으로 생성됐습니다. 견적 통화를 ${input.currency}로 바꿨다면 일정을 다시 생성하거나 금액을 직접 수정하세요.`,
    );
  }
  if (days.length !== input.days) {
    staleWarnings.push(
      `일정은 ${days.length}일 기준인데 여행 기간은 ${input.days}일입니다. 고정비는 ${input.days}일로 계산됩니다. 일정을 다시 생성하세요.`,
    );
  }
  const warnings = [...staleWarnings, ...quote.warnings];
  const detail = view === "detail";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <span className="text-[11px] text-slate-500">{detail ? "모든 분석을 보여 줍니다" : "채널·할인·환율·출발일별 분석은 '자세히'에서"}</span>
        <ChoiceGroup
          name="quoteView"
          label="견적 보기"
          variant="segmented"
          value={view}
          options={[
            { id: "summary", label: "요약" },
            { id: "detail", label: "자세히" },
          ]}
          onChange={setView}
        />
      </div>
      {warnings.some((w) => settingsTargetFor(w) !== null) && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] text-indigo-900">
          <span className="flex-1">비어 있는 원가가 있습니다. 지난 견적 값이나 웹 검색 추정으로 한 번에 채울 수 있습니다.</span>
          <button
            type="button"
            onClick={autoQuote.run}
            disabled={autoQuote.running}
            className="shrink-0 rounded-md bg-indigo-600 px-2.5 py-1 font-semibold text-white hover:bg-indigo-700 disabled:bg-indigo-300"
          >
            {autoQuote.running ? "자동 견적 중..." : "자동 견적"}
          </button>
        </div>
      )}
      {warnings.length > 0 && (
        <ul className="space-y-1.5">
          {warnings.map((warning) => {
            const target = settingsTargetFor(warning);
            return (
              <li
                key={warning}
                className="flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-800"
              >
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="flex-1">{warning}</span>
                {target && (
                  <button type="button" onClick={() => onOpenSettings(target)} className="shrink-0 font-semibold underline underline-offset-2 hover:text-amber-950">
                    설정에서 수정
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[11px] text-slate-500">
        판매 구성 <span className="font-semibold text-slate-700">{PACKAGE_LABELS[quote.packageType]}</span>
        {quote.lodgingUnits > 0 && (
          <>
            {" · "}숙소 {quote.lodgingUnits}
            {input.lodgingType === "bnb" ? "유닛" : "실"} × {input.nights}박
            {(() => {
              const names = Object.values(input.selectedHotels).map((h) => h.name);
              return names.length > 0 ? ` (${names.join(", ")})` : "";
            })()}
          </>
        )}
        {" · "}차량·가이드 {quote.groundDays}일
      </p>

      <QuoteKpis
        scenario={quote.scenario}
        pricingMode={quote.pricingMode}
        currency={input.currency}
        exchangeRateToKrw={input.exchangeRateToKrw}
        priceNote={priceNote}
      />

      {quote.singleTravelers > 0 && single && (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-600 ring-1 ring-slate-200">
          {quote.travelers}명은 2인 1실로 나누면 {quote.singleTravelers}명이 1인실을 씁니다 — 그 {quote.singleTravelers}명은 싱글차지{" "}
          <span className="font-semibold text-slate-800">+{formatMoney(single.price, input.currency)}</span>를 더 받습니다(1인 요금에는 넣지 않음).
        </p>
      )}
      {quote.partnerConsumerPrice !== null && (
        <p className="rounded-md bg-indigo-50 px-3 py-2 text-[11px] leading-4 text-indigo-900 ring-1 ring-indigo-100">
          거래처 권장 소비자가(거래처 마진 {input.partnerMarginRate}%): 1인{" "}
          <span className="font-semibold">{formatMoney(quote.partnerConsumerPrice, input.currency)}</span> (2인 1실 기준) — 경쟁 상품과 비교할 때 이 가격을 기준으로 보세요.
        </p>
      )}

      {budget && (
        <section>
          <SubHeading>예산 사용표 (1인, 2인 1실 기준)</SubHeading>
          <BudgetPanel plan={budget} currency={input.currency} />
          {budgetFit && (
            <div className="mt-2">
              <BudgetFitBox fit={budgetFit} />
            </div>
          )}
        </section>
      )}

      <section>
        <SubHeading>추천 판매가 (최저 · 권장 · 경쟁력)</SubHeading>
        <PriceTiersCard tiers={tiers} currency={input.currency} targetMarginRate={input.targetMarginRate} />
      </section>

      {quote.withUndecided && (
        <UndecidedRange
          labels={quote.undecidedLabels}
          base={quote.scenario}
          withUndecided={quote.withUndecided}
          currency={input.currency}
        />
      )}

      <section>
        <SubHeading>원가 내역</SubHeading>
        <CostBreakdownTable
          lines={quote.lines}
          scenario={quote.scenario}
          currency={input.currency}
          pricingMode={quote.pricingMode}
          withUndecided={quote.withUndecided}
        />
      </section>

      <section>
        <SubHeading>원가 계산서 · 엑셀</SubHeading>
        <CostSheetPanel input={input} days={days} pmChoice={pmChoice} quote={quote} title={meta?.packageName?.trim() || `${input.destination} ${input.nights}박${input.days}일`} />
      </section>

      {detail && (
        <>
          <section>
            <SubHeading>인원별 견적 · 손익분기</SubHeading>
            <PerPersonMatrix
              quote={quote}
              currency={input.currency}
              targetMarginRate={input.targetMarginRate}
              unitsFor={quote.lodgingUnits > 0 ? (n) => lodgingRoomsFor(n, input).bookedRooms : null}
              unitLabel={input.lodgingType === "bnb" ? "유닛" : "실"}
            />
          </section>

          <section>
            <SubHeading>판매 채널별 가격 · 정산</SubHeading>
            <ChannelTable quote={quote} input={input} currency={input.currency} />
          </section>

          <section>
            <SubHeading>할인·쿠폰 시뮬레이션</SubHeading>
            <DiscountSimulator quote={quote} input={input} currency={input.currency} onInputChange={onInputChange} />
          </section>

          <section>
            <SubHeading>1인실 추가요금 · 아동·유아 요금</SubHeading>
            <RateStructurePanel quote={quote} input={input} currency={input.currency} />
          </section>

          {hasFxData && (
            <section>
              <SubHeading>환율 민감도</SubHeading>
              <FxSensitivityPanel quote={quote} input={input} />
            </section>
          )}

          <section>
            <SubHeading>출발일별 권장가</SubHeading>
            <DeparturePricesPanel quote={quote} input={input} />
          </section>

        </>
      )}

      {tourCompare && (
        <section>
          <SubHeading>투어 비교표 (우리 vs 경쟁 상품)</SubHeading>
          <TourCompareTable compare={tourCompare} currency={input.currency} />
        </section>
      )}

      {(!tourCompare || detail) && (
        <section>
          <SubHeading>{tourCompare ? "경쟁사 가격 확인 시점 · 포함 내역" : "경쟁사 비교"}</SubHeading>
          <CompetitorTable
            competitors={input.competitors}
            ourPricePerPerson={quote.scenario.pricePerPerson}
            ourIncludes={quote.ourIncludes}
            ourPolicy={policy}
            currency={input.currency}
          />
        </section>
      )}

      {detail && input.competitors.some((c) => c.price > 0) && (
        <section>
          <SubHeading>가격 차이 분석</SubHeading>
          <PriceGapAnalysis competitors={input.competitors} quote={quote} input={input} ourPolicy={policy} currency={input.currency} />
        </section>
      )}

      {detail && (
        <section>
          <SubHeading>가격안 저장 · 비교</SubHeading>
          <ScenarioCompare quote={quote} input={input} onInputChange={onInputChange} />
        </section>
      )}
    </div>
  );
}

export function QuotePanel({ state, quote, input, days, pmChoice, meta, generatedCurrency, onInputChange, onOpenSettings, autoQuote, budgetFit }: Props) {
  return (
    <SectionCard
      title="견적서"
      description="원가 · 권장 판매가 · 채널별 정산 · 인원별 1인 단가 · 경쟁사 비교"
      icon={Calculator}
    >
      {state.status === "loading" && <QuoteSkeleton />}
      {state.status === "success" && quote && (
        <QuoteContent
          quote={quote}
          input={input}
          days={days}
          pmChoice={pmChoice}
          meta={meta}
          generatedCurrency={generatedCurrency}
          onInputChange={onInputChange}
          onOpenSettings={onOpenSettings}
          autoQuote={autoQuote}
          budgetFit={budgetFit}
        />
      )}
      {(state.status === "idle" || state.status === "error") && (
        <EmptyState
          icon={Calculator}
          title="일정이 만들어지면 견적이 계산됩니다"
          description="고정비와 일정의 입장료·식대를 합산해 목표 마진율 기준 권장 판매가를 역산합니다."
        />
      )}
    </SectionCard>
  );
}
