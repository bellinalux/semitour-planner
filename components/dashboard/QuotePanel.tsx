import { AlertTriangle, Calculator } from "lucide-react";
import { useMemo } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { calculateQuote } from "@/lib/cost";
import type { AsyncState, CurrencyCode, DayPlan, PmFreeOption, TripInput } from "@/types";
import { CompetitorTable } from "./quote/CompetitorTable";
import { CostBreakdownTable } from "./quote/CostBreakdownTable";
import { PerPersonMatrix } from "./quote/PerPersonMatrix";
import { QuoteKpis } from "./quote/QuoteKpis";

interface Props {
  /** 견적은 일정 결과에 의존하므로 일정 상태를 그대로 받는다 */
  state: AsyncState;
  input: TripInput;
  days: DayPlan[];
  pmChoice: Record<number, PmFreeOption["id"]>;
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

function QuoteContent({ input, days, pmChoice, generatedCurrency }: Omit<Props, "state">) {
  const quote = useMemo(() => calculateQuote(input, days, pmChoice), [input, days, pmChoice]);

  if (!quote.ok) return <ErrorBanner title="견적을 계산할 수 없습니다" message={quote.error} />;

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

      <QuoteKpis scenario={quote.scenario} currency={input.currency} exchangeRateToKrw={input.exchangeRateToKrw} />

      <section>
        <SubHeading>원가 내역</SubHeading>
        <CostBreakdownTable lines={quote.lines} scenario={quote.scenario} currency={input.currency} />
      </section>

      <section>
        <SubHeading>인원별 견적 · 손익분기</SubHeading>
        <PerPersonMatrix quote={quote} currency={input.currency} targetMarginRate={input.targetMarginRate} />
      </section>

      <section>
        <SubHeading>경쟁사 비교</SubHeading>
        <CompetitorTable
          competitors={input.competitors}
          ourPricePerPerson={quote.scenario.pricePerPerson}
          ourIncludes={quote.ourIncludes}
          currency={input.currency}
        />
      </section>
    </div>
  );
}

export function QuotePanel({ state, input, days, pmChoice, generatedCurrency }: Props) {
  return (
    <SectionCard
      title="견적서"
      description="원가 · 권장 판매가 · 인원별 1인 단가 · 경쟁사 비교"
      icon={Calculator}
    >
      {state.status === "loading" && <QuoteSkeleton />}
      {state.status === "success" && <QuoteContent input={input} days={days} pmChoice={pmChoice} generatedCurrency={generatedCurrency} />}
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
