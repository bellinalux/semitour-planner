import { Check, Minus, Swords } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { POLICY_LABELS, type OurPolicy } from "@/lib/competitorDiff";
import { compareWithCompetitors } from "@/lib/cost";
import { formatMoney } from "@/lib/currency";
import type { Competitor, CompetitorIncludes, CurrencyCode, TourPolicy } from "@/types";

interface Props {
  competitors: Competitor[];
  ourPricePerPerson: number;
  ourIncludes: CompetitorIncludes;
  ourPolicy: OurPolicy;
  currency: CurrencyCode;
}

const INCLUDE_COLUMNS: { key: keyof CompetitorIncludes; label: string }[] = [
  { key: "guide", label: "가이드" },
  { key: "meals", label: "식사" },
  { key: "admission", label: "입장료" },
  { key: "vehicle", label: "차량" },
  { key: "hotel", label: "숙박" },
  { key: "flight", label: "항공" },
];

function IncludeMark({ included }: { included: boolean }) {
  return included ? (
    <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="포함" />
  ) : (
    <Minus className="mx-auto h-4 w-4 text-slate-300" aria-label="미포함" />
  );
}

/** 쇼핑·선택관광은 "없음"이 상품 경쟁력이므로 없음을 강조해서 보여 준다 */
function PolicyMark({ policy }: { policy: TourPolicy }) {
  const tone =
    policy === "none" ? "bg-emerald-50 text-emerald-700" : policy === "some" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500";
  return <span className={`mx-auto block w-fit rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}>{POLICY_LABELS[policy]}</span>;
}

function DiffCell({ diff, diffRate, currency }: { diff: number | null; diffRate: number | null; currency: CurrencyCode }) {
  if (diff === null || diffRate === null) return <span className="text-slate-400">가격 미입력</span>;
  if (Math.abs(diff) < 1e-9) return <span className="text-slate-600">동일</span>;

  const weAreCheaper = diff > 0;
  return (
    <span className={weAreCheaper ? "font-medium text-emerald-700" : "font-medium text-red-600"}>
      {weAreCheaper ? "우리가 " : "경쟁사가 "}
      {formatMoney(Math.abs(diff), currency)} 저렴
      <span className="ml-1 text-[11px] opacity-80">({Math.abs(diffRate).toFixed(1)}%)</span>
    </span>
  );
}

export function CompetitorTable({ competitors, ourPricePerPerson, ourIncludes, ourPolicy, currency }: Props) {
  if (competitors.length === 0) {
    return (
      <EmptyState
        icon={Swords}
        title="등록된 경쟁사가 없습니다"
        description="왼쪽 '경쟁사 정보'에서 대형 여행사 상품을 찾아 넣거나 직접 입력하면 비교표가 표시됩니다."
      />
    );
  }

  const comparisons = compareWithCompetitors(competitors, ourPricePerPerson);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-xs">
          <caption className="sr-only">경쟁사 가격, 포함 항목, 쇼핑·선택관광 비교</caption>
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] text-slate-500">
              <th className="py-2 pr-3 font-medium">상품</th>
              <th className="py-2 pr-3 text-right font-medium">1인 가격</th>
              <th className="py-2 pr-3 font-medium">우리 대비</th>
              {INCLUDE_COLUMNS.map((c) => (
                <th key={c.key} className="w-12 py-2 pr-1 text-center font-medium">
                  {c.label}
                </th>
              ))}
              <th className="w-16 py-2 pr-1 text-center font-medium">쇼핑</th>
              <th className="w-16 py-2 pr-1 text-center font-medium">옵션</th>
              <th className="py-2 pl-3 font-medium">특징</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr className="bg-indigo-50 font-semibold text-indigo-900">
              <td className="py-2.5 pl-2 pr-3">우리 상품 (권장가)</td>
              <td className="py-2.5 pr-3 text-right tabular-nums">{formatMoney(ourPricePerPerson, currency)}</td>
              <td className="py-2.5 pr-3">—</td>
              {INCLUDE_COLUMNS.map((c) => (
                <td key={c.key} className="py-2.5 pr-1">
                  <IncludeMark included={!!ourIncludes[c.key]} />
                </td>
              ))}
              <td className="py-2.5 pr-1">
                <PolicyMark policy={ourPolicy.shopping} />
              </td>
              <td className="py-2.5 pr-1">
                <PolicyMark policy={ourPolicy.optionTour} />
              </td>
              <td className="py-2.5 pl-3 pr-2 font-normal text-indigo-700">입력한 비용·일정 기준</td>
            </tr>
            {competitors.map((competitor, index) => {
              const cmp = comparisons[index];
              return (
                <tr key={competitor.id} className="text-slate-700">
                  <td className="py-2.5 pr-3 font-medium">{competitor.name.trim() || `경쟁사 ${index + 1}`}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    {competitor.price > 0 ? formatMoney(competitor.price, currency) : "—"}
                  </td>
                  <td className="py-2.5 pr-3">
                    <DiffCell diff={cmp.diff} diffRate={cmp.diffRate} currency={currency} />
                  </td>
                  {INCLUDE_COLUMNS.map((c) => (
                    <td key={c.key} className="py-2.5 pr-1">
                      <IncludeMark included={!!competitor.includes[c.key]} />
                    </td>
                  ))}
                  <td className="py-2.5 pr-1">
                    <PolicyMark policy={competitor.shopping} />
                  </td>
                  <td className="py-2.5 pr-1">
                    <PolicyMark policy={competitor.optionTour} />
                  </td>
                  <td className="py-2.5 pl-3 text-slate-500">{competitor.note || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-slate-400">
        우리 상품의 포함 항목은 입력한 차량·가이드비, 일정의 입장료·식대, 판매 구성(숙박·항공)에서 정한 값입니다. 쇼핑은 일정에 들어 있는 쇼핑 성격 항목으로
        판단하므로, 야시장·쇼핑몰 관광과 지정 쇼핑센터 방문은 구분해서 보셔야 합니다.
      </p>
    </div>
  );
}
