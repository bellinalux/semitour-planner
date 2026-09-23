import { CONTRACT_TERMS_REVISED, CONTRACT_TERMS_SOURCE, STANDARD_CONTRACT_TERMS } from "@/lib/contractTerms";
import { ourPolicy, POLICY_LABELS } from "@/lib/competitorDiff";
import { paymentPlan, resolveRecipients, tripPeriod, type DocRecipient } from "@/lib/documents";
import { localPayRows, moneyWithKrw } from "@/lib/fees";
import { DocFacts, DocSection, DocShell, type DocProps } from "./DocShell";

/** 계약서 표지(①②③) 한 부. 개인별 문서면 사람마다 이 컴포넌트가 반복된다. */
function OneCover({ recipient, breakBefore, data }: { recipient: DocRecipient; breakBefore: boolean; data: DocProps }) {
  const { input, days, pmChoice, quote, meta, company } = data;
  const money = (v: number) => moneyWithKrw(v, input.currency, input.exchangeRateToKrw);
  const payment = paymentPlan(recipient.totalPrice, company, input);
  const title = meta?.packageName?.trim() || `${input.destination} ${input.nights}박 ${input.days}일`;
  const localPay = localPayRows(days, pmChoice);
  const policy = ourPolicy(days, pmChoice, input, meta);

  return (
    <div style={breakBefore ? { breakBefore: "page" } : undefined}>
      <DocShell title="여행계약서" subtitle={title} company={company}>
        <p className="break-inside-avoid border border-slate-300 bg-slate-50 px-3 py-2 text-slate-600">
          이 계약서는 국외여행 표준약관(공정거래위원회 표준약관 제10021호, {CONTRACT_TERMS_REVISED}) 제4조에 따라 계약서와 약관을 함께 담은
          문서입니다. 회사 고유의 특약사항이 있으면 추가하고, 실제 계약에 사용하기 전 내용을 다시 한번 확인하세요.
        </p>

        <DocSection title="① 계약 당사자">
          <DocFacts
            rows={[
              { label: "여행사", value: company.name.trim() || "(회사 설정에서 입력)" },
              { label: "여행업 등록번호", value: company.registrationNumber.trim() || "(회사 설정에서 입력)" },
              { label: "등록관청", value: company.registrationAuthority.trim() || "(회사 설정에서 입력)" },
              { label: "소재지", value: company.address.trim() || "(회사 설정에서 입력)" },
              { label: "보증보험 등 가입 내용", value: company.insurance.trim() || "(회사 설정에서 입력)" },
              { label: "여행자(수신)", value: recipient.name },
            ]}
          />
        </DocSection>

        <DocSection title="② 여행 내용">
          <DocFacts
            rows={[
              { label: "상품명", value: title },
              { label: "여행기간", value: `${tripPeriod(input)} (${input.nights}박 ${input.days}일)` },
              { label: "인원", value: `${recipient.personCount}명${recipient.personCount !== quote.travelers ? ` (전체 ${quote.travelers}명 중 1인)` : ""}` },
              ...(input.minTravelers > 0 ? [{ label: "최저 행사인원", value: `${input.minTravelers}명` }] : []),
              { label: "여행경비 (1인)", value: money(recipient.pricePerPerson) },
              { label: "여행경비 (총액)", value: money(recipient.totalPrice) },
              { label: "계약금 (계약 체결 시)", value: `${money(payment.deposit)} (여행요금의 ${payment.depositRate}%)` },
              ...(payment.interim
                ? [{ label: "중도금 (납부 기한)", value: `${money(payment.interim.amount)} (여행요금의 ${payment.interim.rate}%) · ${payment.interim.due}` }]
                : []),
              { label: "잔금 (납부 기한)", value: `${money(payment.balance)} · ${payment.balanceDue}` },
              ...(company.bankAccount.trim() ? [{ label: "입금 계좌", value: company.bankAccount.trim() }] : []),
              { label: "쇼핑 일정", value: policy.shopping === "some" ? `있음 (일정 중 ${policy.shoppingCount}곳)` : POLICY_LABELS[policy.shopping] },
            ]}
          />
          {payment.isCustomSchedule && (
            <p className="mt-1.5 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-slate-700">
              <span className="font-semibold text-amber-800">특약(제6조)</span> — 이 계약은 붙임 표준약관 제10조③④항(계약금 10%이하, 잔금 출발 7일전 납부)과 달리{" "}
              {payment.interim ? "중도금을 두고 " : ""}
              잔금 납부 기한을 <strong>{payment.balanceDue}</strong>로 정하는 특약을 적용합니다. 여행사는 이 특약이 표준약관보다 우선 적용됨을 여행자에게 설명하고 서명 등으로 별도 확인을 받아야 합니다.
            </p>
          )}
          {localPay.rows.length > 0 && (
            <p className="mt-1.5 text-slate-600">
              현지에서 별도로 지불해야 하는 경비: {localPay.rows.map((r) => `${r.name}${r.amount > 0 ? ` ${money(r.amount)}` : ""}`).join(", ")}
              {localPay.perPerson > 0 ? ` (1인 합계 약 ${money(localPay.perPerson)})` : ""}
              {" — 제10조제2항에 따른 별도 표시입니다."}
            </p>
          )}
          <p className="mt-1.5 text-[10px] text-slate-500">
            여행 일정·포함/불포함 사항·취소 규정의 세부 내용은 함께 교부하는 여행일정표를 따릅니다(제4조).
          </p>
        </DocSection>

        <DocSection title="③ 서명">
          <p className="mb-2 text-slate-600">
            위 내용으로 여행계약을 체결하며, 별도 첨부하는 국외여행 표준약관과 따로 교부하는 여행일정표를 계약 내용으로 합니다.
          </p>
          <table className="w-full border-collapse">
            <tbody>
              <tr className="border-b border-slate-300">
                <th scope="row" className="w-32 shrink-0 bg-slate-50 px-2 py-6 text-left align-top font-medium text-slate-600">
                  여행사
                </th>
                <td className="px-2 py-6 align-top">
                  {company.name.trim() || "________________________"} (인)　　대표 {company.ceo.trim() || "________"}
                </td>
              </tr>
              <tr>
                <th scope="row" className="w-32 shrink-0 bg-slate-50 px-2 py-6 text-left align-top font-medium text-slate-600">
                  여행자
                </th>
                <td className="px-2 py-6 align-top">{recipient.name} (서명)　　계약일자 ________________</td>
              </tr>
            </tbody>
          </table>
        </DocSection>
      </DocShell>
    </div>
  );
}

/**
 * 여행계약서. 국외여행 표준약관(공정거래위원회 표준약관 제10021호) 제4조가 정한 구성대로,
 * ① 계약서(우리 데이터로 채운 표지 + 서명란) ② 약관 전문을 함께 담는다.
 * 개인별 명단을 입력하면 사람마다 표지·서명란을 따로 만들고, 약관 전문은 맨 뒤에 한 번만 붙인다.
 *
 * 표준약관 조항은 임의로 만든 것이 아니라 한국여행업협회 공식 게시 원문을 그대로 옮긴 것이다.
 * 회사 고유의 특약사항이나 실제 계약서로 쓰기 전 법률 검토는 별도로 필요하다.
 */
export function ContractDoc(data: DocProps) {
  const { meta, company } = data;
  const recipients = resolveRecipients(data.input, data.quote);
  const title = meta?.packageName?.trim() || `${data.input.destination} ${data.input.nights}박 ${data.input.days}일`;

  return (
    <>
      {recipients.map((recipient, i) => (
        <OneCover key={recipient.name + i} recipient={recipient} breakBefore={i > 0} data={data} />
      ))}

      <div style={{ breakBefore: "page" }}>
        <DocShell title="여행계약서" subtitle={title} company={company}>
          <DocSection title={`붙임: 국외여행 표준약관 (${CONTRACT_TERMS_REVISED})`}>
            <div className="space-y-2.5">
              {STANDARD_CONTRACT_TERMS.map((article) => (
                <div key={article.title} className="break-inside-avoid">
                  <p className="font-semibold text-slate-800">{article.title}</p>
                  {article.body.map((line, i) => (
                    <p key={i} className="pl-1 text-slate-600">
                      {line}
                    </p>
                  ))}
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-slate-400">출처: {CONTRACT_TERMS_SOURCE}</p>
          </DocSection>
        </DocShell>
      </div>
    </>
  );
}
