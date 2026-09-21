import { AlertCircle, Bus, Clock, Ticket, Utensils } from "lucide-react";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { currencySymbol } from "@/lib/currency";
import { formatDuration } from "@/lib/format";
import type { CurrencyCode, ItineraryItem } from "@/types";

export type ItemCostPatch = Partial<Pick<ItineraryItem, "entryFee" | "mealCost">>;

interface Props {
  item: ItineraryItem;
  order: number;
  currency: CurrencyCode;
  tone: "am" | "pm";
  onChangeCost: (itemId: string, patch: ItemCostPatch) => void;
}

const TONE = {
  am: { node: "bg-indigo-600 text-white", rail: "bg-indigo-200" },
  pm: { node: "bg-emerald-600 text-white", rail: "bg-emerald-200" },
} as const;

export function TimelineItem({ item, order, currency, tone, onChangeCost }: Props) {
  const isLast = item.travelMinutesToNext === null;
  const symbol = currencySymbol(currency);

  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${TONE[tone].node}`}
        >
          {order}
        </span>
        {!isLast && <span className={`my-1 w-0.5 flex-1 ${TONE[tone].rail}`} aria-hidden />}
      </div>

      <div className={`min-w-0 flex-1 ${isLast ? "" : "pb-3"}`}>
        <h4 className="text-sm font-semibold text-slate-900">{item.name}</h4>
        <p className="mt-1 text-xs leading-5 text-slate-600">{item.description}</p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            <Clock className="h-3 w-3" aria-hidden />
            {formatDuration(item.stayMinutes)} 체류
          </span>
          <MoneyInput
            label="입장료"
            icon={Ticket}
            symbol={symbol}
            value={item.entryFee}
            onChange={(entryFee) => onChangeCost(item.id, { entryFee })}
          />
          <MoneyInput
            label="식대"
            icon={Utensils}
            symbol={symbol}
            value={item.mealCost}
            onChange={(mealCost) => onChangeCost(item.id, { mealCost })}
          />
          <span
            className={`text-[10px] font-medium ${item.isEstimated ? "text-amber-600" : "text-emerald-600"}`}
            title={item.isEstimated ? "AI 추정치 — 실제 금액을 확인하세요" : "직접 수정한 금액"}
          >
            {item.isEstimated ? "AI 추정" : "직접 입력"}
          </span>
        </div>

        {item.caution && (
          <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] leading-4 text-amber-800">
            <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            {item.caution}
          </p>
        )}

        {!isLast && item.travelMinutesToNext !== null && (
          <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-400">
            <Bus className="h-3 w-3" aria-hidden />
            다음 장소까지 이동 {formatDuration(item.travelMinutesToNext)}
          </p>
        )}
      </div>
    </li>
  );
}
