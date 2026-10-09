import { AlertTriangle, Store } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { channelMix } from "@/lib/channels";
import { formatMoney } from "@/lib/currency";
import type { CurrencyCode, QuoteData, TripInput } from "@/types";
import { priceIsGiven } from "@/lib/channels";

interface Props {
  quote: QuoteData;
  input: TripInput;
  currency: CurrencyCode;
}

function minTravelersText(n: number | null) {
  return n === null ? "달성 불가" : `${n}명`;
}

/** 직판과 입력한 판매 채널을 한 표로: 고객 결제가, 수수료, 우리 정산액, 이익, 채널별 손익분기 인원 */
export function ChannelTable({ quote, input, currency }: Props) {
  const money = (v: number) => formatMoney(v, currency);
  const rows = quote.channels;
  const hasChannels = rows.length > 1;
  const target = input.targetMarginRate;
  const mix = channelMix(rows, quote.travelers, quote.scenario.baseCost);

  const policy =
    priceIsGiven(input.pricingMode)
      ? "판매가 직접 입력: 모든 채널이 같은 가격입니다."
      : input.channelPriceMode === "parity"
        ? "모든 채널 같은 가격: 수수료가 가장 큰 채널 기준 가격이 직판까지 적용됩니다."
        : "채널마다 목표 마진에 맞춘 가격입니다.";

  if (!hasChannels) {
    return (
      <EmptyState
        icon={Store}
        title="추가된 판매 채널이 없습니다"
        description="왼쪽 '판매 채널·수수료'에서 플랫폼을 추가하고 수수료율을 입력하면, 채널별 판매가·정산액·이익을 비교합니다."
      />
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-xs">
          <caption className="sr-only">판매 채널별 가격과 정산</caption>
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] text-slate-500">
              <th className="py-2 pr-3 font-medium">채널</th>
              <th className="py-2 pr-3 text-right font-medium">고객 결제가 (1인)</th>
              <th className="py-2 pr-3 text-right font-medium">수수료</th>
              <th className="py-2 pr-3 text-right font-medium">우리 정산액</th>
              <th className="py-2 pr-3 text-right font-medium">이익</th>
              <th className="py-2 pr-3 text-right font-medium">이익률</th>
              <th className="py-2 pr-3 text-right font-medium">목표 마진 가격</th>
              <th className="py-2 pr-3 text-right font-medium">손익분기 인원</th>
              <th className="py-2 text-right font-medium">비중</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const loss = row.profit < 0;
              const low = !loss && row.marginRate < target - 0.05;
              return (
                <tr key={row.id} className={row.isDirect ? "bg-slate-50 font-medium text-slate-800" : "text-slate-700"}>
                  <td className="py-2 pl-2 pr-3">{row.name}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(row.pricePerPerson)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {row.feeRate.toFixed(1)}%{row.fixedFeePerPerson > 0 ? ` + ${money(row.fixedFeePerPerson)}/인` : ""}
                    <span className="block text-[10px] text-slate-400">{money(row.feeAmount)}</span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(row.settlement)}</td>
                  <td className={`py-2 pr-3 text-right tabular-nums ${loss ? "font-semibold text-red-600" : ""}`}>{money(row.profit)}</td>
                  <td className={`py-2 pr-3 text-right tabular-nums ${loss ? "font-semibold text-red-600" : low ? "text-amber-700" : ""}`}>
                    {row.marginRate.toFixed(1)}%
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{row.requiredPrice === null ? "—" : money(row.requiredPrice)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {minTravelersText(row.breakEvenTravelers)}
                    <span className="block text-[10px] text-slate-400">목표 {minTravelersText(row.targetMarginTravelers)}</span>
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">{row.share.toFixed(0)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.some((r) => r.profit < 0) && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-red-50 px-2.5 py-2 text-[11px] leading-4 text-red-700">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          이익이 마이너스인 채널이 있습니다. 해당 채널은 가격을 올리거나 수수료를 협상하지 않으면 팔수록 손해입니다.
        </p>
      )}

      {mix && (
        <dl className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-[11px] text-slate-500">판매 비중 가중평균 수수료율</dt>
            <dd className="mt-0.5 font-semibold text-slate-900">{mix.weightedFeeRate.toFixed(1)}%</dd>
          </div>
          <div>
            <dt className="text-[11px] text-slate-500">비중대로 팔릴 때 예상 이익</dt>
            <dd className={`mt-0.5 font-semibold ${mix.totalProfit < 0 ? "text-red-600" : "text-slate-900"}`}>
              {money(mix.totalProfit)} (1인 {money(mix.profitPerPerson)})
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-slate-500">평균 이익률</dt>
            <dd className="mt-0.5 font-semibold text-slate-900">{mix.marginRate.toFixed(1)}%</dd>
          </div>
        </dl>
      )}

      <p className="mt-2 text-[11px] leading-4 text-slate-500">
        {policy} 정산액은 고객 결제 총액에서 수수료를 뺀 금액이고, 손익분기 인원은 채널 수수료가 달라 채널마다 따로 계산합니다.
      </p>
    </div>
  );
}
