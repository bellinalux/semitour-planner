import { priceGrid, pricePlans } from "@/lib/customerPrices";
import { includeLists, tripPeriod } from "@/lib/documents";
import { localPayRows, moneyWithKrw } from "@/lib/fees";
import { gradeText } from "@/lib/itemTypes";
import { DocCover, DocSection, DocShell, type DocProps } from "./DocShell";

/**
 * 고객용 비교 견적서 — 숙소 등급만 다른 A/B/C안을 나란히, 그리고 인원별(출발 요일별) 1인 요금표.
 * 상담에서 고객이 안과 인원을 보고 바로 고르도록 한 장에 담는다. 원가·수익률·경쟁사 이름은 넣지 않는다.
 */
export function OptionsDoc({ input, days, pmChoice, quote, meta, company }: DocProps) {
  const title = meta?.packageName?.trim() || `${input.destination} ${input.nights}박 ${input.days}일`;
  const money = (v: number) => moneyWithKrw(v, input.currency, input.exchangeRateToKrw);
  const plans = pricePlans(input, days, pmChoice, quote, meta);
  const grid = priceGrid(input, days, pmChoice, quote, meta);
  const localPay = localPayRows(days, pmChoice);
  const { included, excluded } = includeLists(quote, input, localPay.rows.length > 0);
  const hotels = Object.values(input.selectedHotels ?? {}).map((h) => h.name).filter(Boolean);
  const lowest = plans.length > 0 ? Math.min(...plans.map((p) => p.salePrice)) : quote.scenario.pricePerPerson;
  const roomBasis = quote.lodgingUnits > 0 || plans.length > 0 ? " (2인 1실 기준)" : "";

  return (
    <DocShell title="비교 견적서" subtitle={title} company={company}>
      <DocCover
        title={title}
        destination={input.destination || "-"}
        period={`${tripPeriod(input)} (${input.nights}박 ${input.days}일)`}
        travelers={`${quote.travelers}명`}
        priceLine={`1인 ${money(lowest)}${plans.length > 0 ? "부터" : ""}`}
      />

      {plans.length >= 2 && (
        <DocSection title="숙소 등급별 A/B/C안">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-50 text-left">
                <th className="px-2 py-1.5 font-medium">구분</th>
                {plans.map((p) => (
                  <th key={p.key} className={`px-2 py-1.5 text-right font-semibold ${p.isCurrent ? "bg-indigo-50 text-indigo-900" : ""}`}>
                    {p.key}안{p.isCurrent ? " (추천)" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <tr className="border-b border-slate-200">
                <td className="px-2 py-1.5">숙소</td>
                {plans.map((p) => (
                  <td key={p.key} className={`px-2 py-1.5 text-right ${p.isCurrent ? "bg-indigo-50" : ""}`}>
                    {p.label}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-slate-200 font-bold">
                <td className="px-2 py-1.5">1인 요금{roomBasis}</td>
                {plans.map((p) => (
                  <td key={p.key} className={`px-2 py-1.5 text-right ${p.isCurrent ? "bg-indigo-50" : ""}`}>
                    {money(p.salePrice)}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-slate-200">
                <td className="px-2 py-1.5">{quote.travelers}명 합계</td>
                {plans.map((p) => (
                  <td key={p.key} className={`px-2 py-1.5 text-right ${p.isCurrent ? "bg-indigo-50" : ""}`}>
                    {money(p.totalPrice)}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-slate-200 text-slate-600">
                <td className="px-2 py-1.5">추천안과 차이 (1인)</td>
                {plans.map((p) => (
                  <td key={p.key} className={`px-2 py-1.5 text-right ${p.isCurrent ? "bg-indigo-50" : ""}`}>
                    {p.diff === 0 ? "—" : `${p.diff > 0 ? "+" : "−"}${money(Math.abs(p.diff))}`}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          <p className="mt-1 text-slate-600">세 안은 숙소 등급만 다르고 일정·식사·차량·가이드 등 나머지는 모두 같습니다.</p>
          {hotels.length > 0 && <p className="text-slate-600">추천안 숙소(예정): {hotels.join(", ")} 또는 동급</p>}
        </DocSection>
      )}

      <DocSection title={grid.kind === "weekday" ? "인원 · 출발 요일별 1인 요금" : "인원별 1인 요금"}>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-300 bg-slate-50 text-left">
              <th className="px-2 py-1.5 font-medium">인원</th>
              {grid.columns.map((c) => (
                <th key={c} className="px-2 py-1.5 text-right font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {grid.rows
              .filter((r) => !r.belowMin)
              .map((r) => (
                <tr key={r.travelers} className={`border-b border-slate-200 ${r.isCurrent ? "bg-indigo-50 font-semibold" : ""}`}>
                  <td className="px-2 py-1.5">{r.travelers}명</td>
                  {r.prices.map((p, i) => (
                    <td key={i} className="px-2 py-1.5 text-right">
                      {p === null ? "-" : money(p)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
        <p className="mt-1 text-[10px] text-slate-500">
          인원이 늘면 차량·가이드 비용을 나눠 1인 요금이 내려갑니다.{roomBasis && " 홀수 인원은 1인실 사용 시 싱글차지가 붙습니다."}
          {grid.minTravelers > 0 && ` 최저 행사인원 ${grid.minTravelers}명.`}
        </p>
      </DocSection>

      <DocSection title="공통 포함 · 불포함">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="font-semibold text-emerald-800">포함</p>
            <p>{included.join(", ") || "-"}</p>
          </div>
          <div>
            <p className="font-semibold text-slate-700">불포함</p>
            <p>{excluded.join(", ") || "-"}</p>
          </div>
        </div>
      </DocSection>

      <p className="mt-2 text-[10px] text-slate-500">
        {input.hotelGrade !== "any" && plans.length > 0 && `등급별 요금은 ${gradeText(input.hotelGrade)} 견적을 기준으로 산출한 안내 금액이며, `}
        요금은 예약 시점의 항공·숙박 사정에 따라 달라질 수 있습니다. 계약 전 최종 견적서로 확정합니다.
      </p>
    </DocShell>
  );
}
