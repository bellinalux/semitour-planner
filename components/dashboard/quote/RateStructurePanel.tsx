import { formatMoney } from "@/lib/currency";
import { composition, singleSupplement } from "@/lib/pricing";
import type { CurrencyCode, QuoteData, TripInput } from "@/types";

interface Props {
  quote: QuoteData;
  input: TripInput;
  currency: CurrencyCode;
}

/** 1인실 추가요금(싱글차지)과 성인·아동·유아 구성별 총액·이익 */
export function RateStructurePanel({ quote, input, currency }: Props) {
  const money = (v: number) => formatMoney(v, currency);
  const single = singleSupplement(quote, input);
  const comp = composition(quote, input);

  return (
    <div className="space-y-3">
      {single ? (
        <div className="rounded-lg bg-slate-50 p-3 text-xs">
          <p className="text-[11px] font-medium text-slate-500">1인실 사용 시 추가요금 (싱글차지)</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">+ {money(single.price)} <span className="text-[11px] font-normal text-slate-500">(1인)</span></p>
          <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
            한 방을 {single.guestsPerUnit}명이 나눠 쓰던 숙박비를 혼자 쓸 때 늘어나는 원가 {money(single.cost)}에 목표 마진·수수료를 반영한 권장 추가요금입니다.
            {quote.travelers % single.guestsPerUnit !== 0 && ` 현재 ${quote.travelers}명은 방이 남아 한 명이 혼자 쓰게 되니, 그 한 명에게 이 금액을 받거나 평균 원가로 흡수할지 정하세요.`}
          </p>
        </div>
      ) : (
        <p className="text-[11px] text-slate-500">숙박이 포함된 구성(랜드+숙박·풀패키지)에서 1실 인원이 2명 이상이면 1인실 추가요금을 계산합니다.</p>
      )}

      {comp ? (
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-xs">
              <caption className="sr-only">성인·아동·유아 구성별 요금</caption>
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] text-slate-500">
                  <th className="py-2 pr-3 font-medium">구분</th>
                  <th className="py-2 pr-3 text-right font-medium">1인 요금</th>
                  <th className="py-2 pr-3 text-right font-medium">인원</th>
                  <th className="py-2 text-right font-medium">금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                <tr>
                  <td className="py-2 pl-2 pr-3">성인</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(comp.adultPrice)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{comp.adults}명</td>
                  <td className="py-2 text-right tabular-nums">{money(comp.adults * comp.adultPrice)}</td>
                </tr>
                {comp.children > 0 && (
                  <tr>
                    <td className="py-2 pl-2 pr-3">아동 ({input.childPriceRate}%)</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(comp.childPrice)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{comp.children}명</td>
                    <td className="py-2 text-right tabular-nums">{money(comp.children * comp.childPrice)}</td>
                  </tr>
                )}
                {comp.infants > 0 && (
                  <tr>
                    <td className="py-2 pl-2 pr-3">유아 ({input.infantPriceRate}%)</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(comp.infantPrice)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{comp.infants}명</td>
                    <td className="py-2 text-right tabular-nums">{money(comp.infants * comp.infantPrice)}</td>
                  </tr>
                )}
                <tr className="border-t-2 border-slate-300 font-semibold text-slate-900">
                  <td className="py-2 pl-2 pr-3" colSpan={3}>
                    총 판매액
                  </td>
                  <td className="py-2 text-right tabular-nums">{money(comp.revenue)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className={`text-[11px] leading-4 ${comp.profit < 0 ? "font-semibold text-red-600" : "text-slate-600"}`}>
            이 구성의 예상 이익 {money(comp.profit)} (이익률 {comp.marginRate.toFixed(1)}%) — 모두 성인 요금으로 팔 때보다 {money(Math.abs(comp.profitDelta))}{" "}
            {comp.profitDelta < 0 ? "줄어듭니다" : "늘어납니다"}.
          </p>
          <p className="text-[10px] leading-4 text-slate-400">
            아동은 성인과 같은 좌석·식사·숙박 원가가 든다고 보고, 유아는 별도 좌석·식사·숙박이 없다고 보고 원가 0으로 계산했습니다. 실제 조건이 다르면 요금 비율을 조정하세요.
          </p>
        </div>
      ) : (
        <p className="text-[11px] text-slate-500">왼쪽 &quot;아동·유아 요금&quot;에서 아동·유아 인원을 입력하면 구성별 총액과 이익을 계산합니다.</p>
      )}
    </div>
  );
}
