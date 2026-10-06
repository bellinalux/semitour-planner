import type { GuideStep } from "@/components/layout/StepGuide";
import { formatMoney } from "@/lib/currency";
import type { PmChoice } from "@/lib/itinerary";
import { documentQuote } from "@/lib/pricing";
import { unconfirmedValues } from "@/lib/printChecks";
import type { QuoteLogEntry } from "@/lib/quoteLog";
import { setupChecklist, type SetupSection } from "@/lib/setupChecklist";
import type { DayPlan, QuoteResult, TripInput } from "@/types";

interface Args {
  input: TripInput;
  days: DayPlan[];
  pmChoice: PmChoice;
  quote: QuoteResult | null;
  generating: boolean;
  autoQuoteRunning: boolean;
  /** 가장 최근에 고객에게 나간 견적 */
  lastIssued: QuoteLogEntry | undefined;
  actions: {
    goInput: () => void;
    generate: () => void;
    goResult: () => void;
    openSettings: (section: SetupSection) => void;
    runAutoQuote: () => void;
    goDocuments: () => void;
  };
}

/**
 * 화면 위 진행 안내 ① 입력 → ② 코스 → ③ 견적 → ④ 문서 — 단계마다 상태·한 줄 설명·누르면 할 일.
 * 인쇄 전 확인 목록(unconfirmed)과 지금 단계 이름(stage, 의견 보낼 때 함께 보냄)도 같이 돌려준다.
 */
export function plannerGuide({ input, days, pmChoice, quote, generating, autoQuoteRunning, lastIssued, actions }: Args): { steps: GuideStep[]; unconfirmed: string[]; stage: string } {
  const unconfirmed = quote?.ok ? unconfirmedValues(input, days, pmChoice, quote) : [];
  const inputDone = input.destination.trim() !== "" && input.travelers > 0 && input.days > 0;
  const missingCosts = setupChecklist(input).filter((c) => c.section !== "documents" && !c.done);
  const customerPrice = quote?.ok ? documentQuote(quote, input).scenario.pricePerPerson : 0;
  const issued = !!quote?.ok && !!lastIssued && lastIssued.destination === input.destination.trim() && lastIssued.pricePerPerson === customerPrice;
  /** 의견을 남길 때 함께 보내는 지금 단계 */
  const stage = !inputDone ? "입력" : days.length === 0 ? "코스" : missingCosts.length > 0 || unconfirmed.length > 0 ? "견적" : "문서";
  const steps: GuideStep[] = [
    {
      label: "입력",
      status: inputDone ? "done" : "current",
      detail: inputDone ? `${input.destination.trim()} ${input.nights}박${input.days}일 · ${input.travelers}명` : "여행지·기간·인원",
      onClick: actions.goInput,
    },
    {
      label: "코스",
      status: generating ? "running" : days.length > 0 ? "done" : inputDone ? "current" : "todo",
      detail: generating ? "만드는 중..." : days.length > 0 ? `${days.length}일 일정` : "누르면 코스 만들기",
      onClick: () => {
        if (days.length === 0 && inputDone && !generating) actions.generate();
        else actions.goResult();
      },
    },
    {
      label: "견적",
      status: autoQuoteRunning ? "running" : days.length === 0 ? "todo" : missingCosts.length > 0 ? "current" : unconfirmed.length > 0 ? "warn" : "done",
      detail: autoQuoteRunning
        ? "자동 견적 중..."
        : days.length === 0
          ? "원가·판매가"
          : missingCosts.length > 0
            ? `빈 값: ${missingCosts.map((c) => c.label).join(", ")} — 누르면 자동 견적`
            : unconfirmed.length > 0
              ? `확인할 추정값 ${unconfirmed.length}건`
              : `1인 ${formatMoney(customerPrice, input.currency)}`,
      onClick: () => {
        actions.openSettings(missingCosts[0]?.section ?? "cost");
        if (missingCosts.length > 0 && !autoQuoteRunning) actions.runAutoQuote();
      },
    },
    {
      label: "문서",
      status: issued ? "done" : quote?.ok && missingCosts.length === 0 ? "current" : "todo",
      detail: issued && lastIssued ? `${lastIssued.document} 발행` : "견적서·일정표 인쇄",
      onClick: actions.goDocuments,
    },
  ];

  return { steps, unconfirmed, stage };
}
