import { AlertTriangle, Calculator } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { ourPolicy } from "@/lib/competitorDiff";
import { lodgingUnitsFor } from "@/lib/cost";
import type { PmChoice } from "@/lib/itinerary";
import type { AsyncState, CourseMeta, CurrencyCode, DayPlan, PackageType, QuoteResult, TripInput } from "@/types";
import { CompetitorTable } from "./quote/CompetitorTable";
import { CostBreakdownTable } from "./quote/CostBreakdownTable";
import { PerPersonMatrix } from "./quote/PerPersonMatrix";
import { PriceGapAnalysis } from "./quote/PriceGapAnalysis";
import { QuoteKpis } from "./quote/QuoteKpis";
import { UndecidedRange } from "./quote/UndecidedRange";

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

function QuoteContent({ quote, input, days, pmChoice, meta, generatedCurrency }: Omit<Props, "state" | "quote"> & { quote: QuoteResult }) {
  if (!quote.ok) return <ErrorBanner title="견적을 계산할 수 없습니다" message={quote.error} />;

  const policy = ourPolicy(days, pmChoice, input, meta);

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

  return (
    <div className="space-y-6">
      {warnings.length > 0 && (
        <ul className="space-y-1.5">
          {warnings.map((warning) => (
            <li
              key={warning}
              className="flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-800"
            >
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              {warning}
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-slate-500">
        판매 구성 <span className="font-semibold text-slate-700">{PACKAGE_LABELS[quote.packageType]}</span>
        {quote.lodgingUnits > 0 && (
          <>
            {" · "}숙소 {quote.lodgingUnits}
            {input.lodgingType === "bnb" ? "유닛" : "실"} × {input.nights}박
            {input.selectedHotel ? ` (${input.selectedHotel.name})` : ""}
          </>
        )}
        {" · "}차량·가이드 {quote.groundDays}일
      </p>

      <QuoteKpis
        scenario={quote.scenario}
        pricingMode={quote.pricingMode}
        currency={input.currency}
        exchangeRateToKrw={input.exchangeRateToKrw}
      />

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
        <SubHeading>인원별 견적 · 손익분기</SubHeading>
        <PerPersonMatrix
          quote={quote}
          currency={input.currency}
          targetMarginRate={input.targetMarginRate}
          unitsFor={quote.lodgingUnits > 0 ? (n) => lodgingUnitsFor(n, input.guestsPerUnit) : null}
          unitLabel={input.lodgingType === "bnb" ? "유닛" : "실"}
        />
      </section>

      <section>
        <SubHeading>경쟁사 비교</SubHeading>
        <CompetitorTable
          competitors={input.competitors}
          ourPricePerPerson={quote.scenario.pricePerPerson}
          ourIncludes={quote.ourIncludes}
          ourPolicy={policy}
          currency={input.currency}
        />
      </section>

      {input.competitors.some((c) => c.price > 0) && (
        <section>
          <SubHeading>가격 차이 분석</SubHeading>
          <PriceGapAnalysis competitors={input.competitors} quote={quote} input={input} ourPolicy={policy} currency={input.currency} />
        </section>
      )}
    </div>
  );
}

export function QuotePanel({ state, quote, input, days, pmChoice, meta, generatedCurrency }: Props) {
  return (
    <SectionCard
      title="견적서"
      description="원가 · 권장 판매가 · 인원별 1인 단가 · 경쟁사 비교"
      icon={Calculator}
    >
      {state.status === "loading" && <QuoteSkeleton />}
      {state.status === "success" && quote && (
        <QuoteContent quote={quote} input={input} days={days} pmChoice={pmChoice} meta={meta} generatedCurrency={generatedCurrency} />
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
