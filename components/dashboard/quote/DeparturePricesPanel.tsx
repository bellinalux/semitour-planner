import { formatMoney } from "@/lib/currency";
import { departurePrices } from "@/lib/pricing";
import type { QuoteData, TripInput } from "@/types";

interface Props {
  quote: QuoteData;
  input: TripInput;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${iso.slice(5, 7)}/${iso.slice(8, 10)}(${WEEKDAYS[d.getUTCDay()]})`;
}

/**
 * 항공 시세 조회로 찾은 출발일별 요금을 왕복 항공료에 넣었을 때의 권장 판매가.
 * 풀패키지이고 조회한 요금이 있을 때만 표시한다.
 */
export function DeparturePricesPanel({ quote, input }: Props) {
  const rows = departurePrices(quote, input);
  const money = (v: number) => formatMoney(v, input.currency);

  if (input.packageType !== "full") {
    return <p className="text-[11px] text-slate-500">항공이 포함된 풀패키지에서 항공 시세를 조회하면 출발일별 권장가를 계산합니다.</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="text-[11px] text-slate-500">
        왼쪽 &quot;가장 싼 출발일 찾기&quot;로 항공 시세를 조회하면, 출발일마다 항공료가 달라질 때의 권장 판매가를 보여줍니다.
      </p>
    );
  }

  const cheapest = rows.reduce((best, r) => (r.deal.price < best.deal.price ? r : best));
  const isFixed = input.pricingMode === "fixed_price";

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-xs">
          <caption className="sr-only">출발일별 항공료와 권장 판매가</caption>
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] text-slate-500">
              <th className="py-2 pr-3 font-medium">출발일</th>
              <th className="py-2 pr-3 text-right font-medium">왕복 항공료</th>
              <th className="py-2 pr-3 text-right font-medium">1인 원가</th>
              <th className="py-2 pr-3 text-right font-medium">{isFixed ? "판매가 (입력)" : "권장 판매가"}</th>
              <th className="py-2 pr-3 text-right font-medium">{isFixed ? "이 출발일 이익률" : "현재 대비"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.deal.departDate} className={row === cheapest ? "bg-emerald-50 text-emerald-900" : "text-slate-700"}>
                <td className="py-2 pl-2 pr-3">
                  {shortDate(row.deal.departDate)}
                  {row === cheapest && <span className="ml-1.5 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] text-white">최저</span>}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{money(row.deal.price)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{money(row.costPerPerson)}</td>
                <td className="py-2 pr-3 text-right font-semibold tabular-nums">{row.pricePerPerson === null ? "—" : money(row.pricePerPerson)}</td>
                <td
                  className={`py-2 pr-2 text-right tabular-nums ${
                    isFixed ? (row.marginAtCurrent < 0 ? "font-semibold text-red-600" : "") : (row.deltaFromCurrent ?? 0) > 0 ? "text-red-600" : "text-emerald-700"
                  }`}
                >
                  {isFixed
                    ? `${row.marginAtCurrent.toFixed(1)}%`
                    : row.deltaFromCurrent === null
                      ? "—"
                      : row.deltaFromCurrent === 0
                        ? "동일"
                        : `${row.deltaFromCurrent > 0 ? "+" : "-"}${money(Math.abs(row.deltaFromCurrent))}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] leading-4 text-slate-400">
        Aviasales 캐시 최저가 기준이라 실제 예약 가능 요금과 다를 수 있습니다. 현재 항공료({money(input.flightPricePerPerson)})를 각 출발일 요금으로 바꾸고 나머지 원가는 그대로 둔 값입니다.
      </p>
    </div>
  );
}
