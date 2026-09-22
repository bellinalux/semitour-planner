import { paymentPlan, tripPeriod } from "@/lib/documents";
import { moneyWithKrw } from "@/lib/fees";
import { DocFacts, DocSection, DocShell, type DocProps } from "./DocShell";

/**
 * 청구서. 세금계산서 자체는 홈택스에서 발행하고, 이 문서는 청구 내역과 입금 안내를 담는다.
 * (여행알선수수료의 과세 범위는 회사 세무 기준에 따르므로 부가세 항목은 넣지 않는다)
 */
export function InvoiceDoc({ input, quote, meta, company }: DocProps) {
  const money = (v: number) => moneyWithKrw(v, input.currency, input.exchangeRateToKrw);
  const payment = paymentPlan(quote.scenario.totalPrice, company, input);
  const title = meta?.packageName?.trim() || `${input.destination} ${input.nights}박 ${input.days}일`;

  return (
    <DocShell title="청 구 서" subtitle={title} company={company}>
      <DocSection title="청구 대상">
        <DocFacts
          rows={[
            { label: "수신", value: input.customerName.trim() || "-" },
            { label: "상품명", value: title },
            { label: "여행기간", value: `${tripPeriod(input)} (${input.nights}박 ${input.days}일)` },
            { label: "인원", value: `${quote.travelers}명` },
          ]}
        />
      </DocSection>

      <DocSection title="청구 내역">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-300 bg-slate-50 text-left">
              <th className="px-2 py-1.5 font-medium">품목</th>
              <th className="px-2 py-1.5 text-right font-medium">단가</th>
              <th className="w-20 px-2 py-1.5 text-right font-medium">수량</th>
              <th className="px-2 py-1.5 text-right font-medium">금액</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-200">
              <td className="px-2 py-1.5">
                여행요금 <span className="text-slate-500">({title})</span>
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{money(quote.scenario.pricePerPerson)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{quote.travelers}명</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{money(quote.scenario.totalPrice)}</td>
            </tr>
            <tr className="border-b-2 border-slate-800 bg-slate-50 text-[13px] font-bold">
              <td className="px-2 py-2" colSpan={3}>
                청구 합계
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{money(quote.scenario.totalPrice)}</td>
            </tr>
          </tbody>
        </table>
      </DocSection>

      <DocSection title="입금 안내">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-300 bg-slate-50 text-left">
              <th className="px-2 py-1.5 font-medium">구분</th>
              <th className="px-2 py-1.5 font-medium">금액</th>
              <th className="px-2 py-1.5 font-medium">납부 기한</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-200">
              <td className="px-2 py-1.5">계약금 ({payment.depositRate}%)</td>
              <td className="px-2 py-1.5 tabular-nums">{money(payment.deposit)}</td>
              <td className="px-2 py-1.5">계약 시</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="px-2 py-1.5">잔금</td>
              <td className="px-2 py-1.5 tabular-nums">{money(payment.balance)}</td>
              <td className="px-2 py-1.5">{payment.balanceDue}</td>
            </tr>
          </tbody>
        </table>
        {company.bankAccount.trim() ? (
          <p className="mt-2 rounded border border-slate-300 bg-slate-50 px-2 py-1.5">
            <span className="font-medium">입금 계좌</span> {company.bankAccount.trim()}
          </p>
        ) : (
          <p className="mt-2 text-[10px] text-slate-400">입금 계좌가 입력되지 않았습니다. &quot;회사 설정&quot;에서 입력하면 여기에 표시됩니다.</p>
        )}
      </DocSection>

      <DocSection title="안내">
        <ul className="space-y-0.5">
          <li>· 세금계산서(또는 현금영수증)는 입금 확인 후 별도로 발행해 드립니다.</li>
          <li>· 취소·환불은 국외여행 표준약관 및 소비자분쟁해결기준에 따르며, 상세 내용은 여행일정표에 안내되어 있습니다.</li>
          {input.minTravelers > 0 && (
            <li>· 최저 행사인원 {input.minTravelers}명에 미달해 여행이 취소되는 경우 여행개시 7일 전까지 통지하고 받은 금액 전액을 환급합니다.</li>
          )}
          {company.phone.trim() && <li>· 문의: {company.phone.trim()}</li>}
        </ul>
      </DocSection>
    </DocShell>
  );
}
