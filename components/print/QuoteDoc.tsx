import { CANCELLATION_TERMS, includeLists, paymentPlan, resolveRecipients, tripPeriod, type DocRecipient } from "@/lib/documents";
import { localPayRows, moneyWithKrw } from "@/lib/fees";
import { formatMoney } from "@/lib/currency";
import { DocFacts, DocSection, DocShell, type DocProps } from "./DocShell";

/** 견적서 한 부(수신 1명 또는 단체 기준). 개인별 문서면 사람마다 이 컴포넌트가 반복된다. */
function OneQuote({ recipient, isGroup, breakBefore, data }: { recipient: DocRecipient; isGroup: boolean; breakBefore: boolean; data: DocProps }) {
  const { input, days, pmChoice, quote, meta, company } = data;
  const localPay = localPayRows(days, pmChoice);
  const { included, excluded } = includeLists(quote, input, localPay.rows.length > 0);
  const money = (v: number) => moneyWithKrw(v, input.currency, input.exchangeRateToKrw);
  const payment = paymentPlan(recipient.totalPrice, company, input);
  const title = meta?.packageName?.trim() || `${input.destination} ${input.nights}박 ${input.days}일`;
  const others = quote.matrix.filter((m) => m.travelers !== quote.travelers);

  return (
    <div style={breakBefore ? { breakBefore: "page" } : undefined}>
      <DocShell title="견 적 서" subtitle={title} company={company}>
        <DocSection title="견적 내용">
          <DocFacts
            rows={[
              { label: "수신", value: recipient.name },
              { label: "상품명", value: title },
              { label: "여행지", value: input.destination || "-" },
              { label: "여행기간", value: `${tripPeriod(input)} (${input.nights}박 ${input.days}일)` },
              { label: "인원", value: `${recipient.personCount}명${!isGroup ? ` (전체 ${quote.travelers}명 중 1인)` : ""}` },
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
                <td className="px-2 py-1.5 text-right tabular-nums">{money(recipient.pricePerPerson)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{recipient.personCount}명</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{money(recipient.totalPrice)}</td>
              </tr>
              <tr className="border-b-2 border-slate-800 bg-slate-50 font-bold">
                <td className="px-2 py-1.5" colSpan={3}>
                  합계
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{money(recipient.totalPrice)}</td>
              </tr>
            </tbody>
          </table>
          {quote.undecidedLabels.length > 0 && (
            <p className="mt-1 text-[10px] text-slate-500">
              {quote.undecidedLabels.join(", ")} 요금이 확정되지 않아 최종 금액이 달라질 수 있습니다.
            </p>
          )}
          {isGroup && others.length > 0 && (
            <p className="mt-1.5 text-slate-600">
              인원별 1인 요금 — {others.map((m) => `${m.travelers}명 ${money(m.pricePerPerson)}`).join(" / ")}
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
                {localPay.rows.map((r) => `${r.name}${r.amount > 0 ? ` ${money(r.amount)}` : ""}`).join(", ")}
                {localPay.perPerson > 0 && <span className="text-slate-600"> (1인 합계 약 {money(localPay.perPerson)})</span>}
              </p>
            )}
            {input.options.length > 0 && (
              <p>
                <span className="font-medium">선택 옵션</span>{" "}
                {input.options.map((o) => `${o.name} 1인 ${money(o.pricePerPerson)}`).join(", ")}
                <span className="text-slate-600"> — 참여 여부는 자유이며 기본 요금에 포함되지 않습니다.</span>
              </p>
            )}
          </DocSection>
        )}

        <DocSection title="결제 조건">
          <DocFacts
            rows={[
              { label: "계약금", value: `${money(payment.deposit)} (여행요금의 ${payment.depositRate}%)` },
              ...(payment.interim
                ? [{ label: "중도금", value: `${money(payment.interim.amount)} (여행요금의 ${payment.interim.rate}%) · ${payment.interim.due}` }]
                : []),
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
    </div>
  );
}

/** 고객·거래처에 보내는 견적서. 원가와 마진은 넣지 않는다. 개인별 명단을 입력하면 사람마다 따로 만든다. */
export function QuoteDoc(data: DocProps) {
  const recipients = resolveRecipients(data.input, data.quote);
  const isGroup = data.input.travelerNames.filter((n) => n.trim()).length === 0;
  return (
    <>
      {recipients.map((recipient, i) => (
        <OneQuote key={recipient.name + i} recipient={recipient} isGroup={isGroup} breakBefore={i > 0} data={data} />
      ))}
    </>
  );
}

// formatMoney is re-exported here only to keep the import used if needed elsewhere; currently unused directly.
void formatMoney;
