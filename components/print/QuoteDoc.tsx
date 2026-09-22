import { CANCELLATION_TERMS, includeLists, paymentPlan, tripPeriod } from "@/lib/documents";
import { localPayRows, moneyWithKrw } from "@/lib/fees";
import { formatMoney } from "@/lib/currency";
import { DocFacts, DocSection, DocShell, type DocProps } from "./DocShell";

/** 고객·거래처에 보내는 견적서. 원가와 마진은 넣지 않는다. */
export function QuoteDoc({ input, days, pmChoice, quote, meta, company }: DocProps) {
  const localPay = localPayRows(days, pmChoice);
  const { included, excluded } = includeLists(quote, input, localPay.rows.length > 0);
  const money = (v: number) => moneyWithKrw(v, input.currency, input.exchangeRateToKrw);
  const payment = paymentPlan(quote.scenario.totalPrice, company, input);
  const title = meta?.packageName?.trim() || `${input.destination} ${input.nights}박 ${input.days}일`;
  const others = quote.matrix.filter((m) => m.travelers !== quote.travelers);

  return (
    <DocShell title="견 적 서" subtitle={title} company={company}>
      <DocSection title="견적 내용">
        <DocFacts
          rows={[
            { label: "수신", value: input.customerName.trim() || "-" },
            { label: "상품명", value: title },
            { label: "여행지", value: input.destination || "-" },
            { label: "여행기간", value: `${tripPeriod(input)} (${input.nights}박 ${input.days}일)` },
            { label: "기준 인원", value: `${quote.travelers}명` },
            ...(input.minTravelers > 0 ? [{ label: "최저 행사인원", value: `${input.minTravelers}명` }] : []),
            ...(input.travelAlert ? [{ label: "여행경보단계", value: `${input.travelAlert.country} ${input.travelAlert.levelLabel}` }] : []),
          ]}
        />
      </DocSection>

      <DocSection title="견적 금액">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-300 bg-slate-50 text-left">
              <th className="px-2 py-1.5 font-medium">구분</th>
              <th className="px-2 py-1.5 text-right font-medium">1인 요금</th>
              <th className="w-20 px-2 py-1.5 text-right font-medium">인원</th>
              <th className="px-2 py-1.5 text-right font-medium">금액</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-200">
              <td className="px-2 py-1.5">여행요금</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{money(quote.scenario.pricePerPerson)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{quote.travelers}명</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{money(quote.scenario.totalPrice)}</td>
            </tr>
            <tr className="border-b-2 border-slate-800 bg-slate-50 font-bold">
              <td className="px-2 py-1.5" colSpan={3}>
                합계
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{money(quote.scenario.totalPrice)}</td>
            </tr>
          </tbody>
        </table>
        {quote.undecidedLabels.length > 0 && (
          <p className="mt-1 text-[10px] text-slate-500">
            {quote.undecidedLabels.join(", ")} 요금이 확정되지 않아 최종 금액이 달라질 수 있습니다.
          </p>
        )}
        {others.length > 0 && (
          <p className="mt-1.5 text-slate-600">
            인원별 1인 요금 — {others.map((m) => `${m.travelers}명 ${formatMoney(m.pricePerPerson, input.currency)}`).join(" / ")}
          </p>
        )}
      </DocSection>

      <DocSection title="포함 · 불포함 사항">
        <DocFacts
          rows={[
            { label: "포함", value: included.length > 0 ? included.join(", ") : "별도 안내" },
            { label: "불포함", value: excluded.join(", ") },
          ]}
        />
      </DocSection>

      {(localPay.rows.length > 0 || input.options.length > 0) && (
        <DocSection title="별도 비용 안내">
          {localPay.rows.length > 0 && (
            <p className="mb-1">
              <span className="font-medium">현지 지불</span>{" "}
              {localPay.rows.map((r) => `${r.name}${r.amount > 0 ? ` ${formatMoney(r.amount, input.currency)}` : ""}`).join(", ")}
              {localPay.perPerson > 0 && <span className="text-slate-600"> (1인 합계 약 {money(localPay.perPerson)})</span>}
            </p>
          )}
          {input.options.length > 0 && (
            <p>
              <span className="font-medium">선택 옵션</span>{" "}
              {input.options.map((o) => `${o.name} 1인 ${formatMoney(o.pricePerPerson, input.currency)}`).join(", ")}
              <span className="text-slate-600"> — 참여 여부는 자유이며 기본 요금에 포함되지 않습니다.</span>
            </p>
          )}
        </DocSection>
      )}

      <DocSection title="결제 조건">
        <DocFacts
          rows={[
            { label: "계약금", value: `${money(payment.deposit)} (여행요금의 ${payment.depositRate}%)` },
            { label: "잔금", value: `${money(payment.balance)} · ${payment.balanceDue}` },
            ...(company.bankAccount.trim() ? [{ label: "입금 계좌", value: company.bankAccount.trim() }] : []),
          ]}
        />
      </DocSection>

      <DocSection title="취소 및 환불 규정">
        <table className="w-full border-collapse">
          <tbody>
            {CANCELLATION_TERMS.map((term) => (
              <tr key={term.when} className="border-b border-slate-200">
                <td className="px-2 py-1">{term.when}</td>
                <td className="px-2 py-1">{term.fee}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1.5 text-[10px] leading-4 text-slate-500">
          본 견적은 발행일 기준이며, 항공·숙박 요금 변동과 잔여 좌석 상황에 따라 달라질 수 있습니다. 여행 조건의 상세 내용은 여행일정표와 국외여행 표준약관을 따릅니다.
        </p>
      </DocSection>
    </DocShell>
  );
}
