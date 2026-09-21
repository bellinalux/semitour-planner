import { AlertCircle, Bus, Clock, Eye, Ticket, Trash2, Utensils } from "lucide-react";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { currencySymbol } from "@/lib/currency";
import { formatDuration } from "@/lib/format";
import { feeLabel, ITEM_TYPE_META, ITEM_TYPES } from "@/lib/itemTypes";
import type { Admission, CurrencyCode, ItemType, ItineraryItem } from "@/types";

export type ItemPatch = Partial<ItineraryItem>;

interface Props {
  item: ItineraryItem;
  order: number;
  isLast: boolean;
  currency: CurrencyCode;
  /** am/pm: 세미투어 오전/오후 (번호 표시) — linear: 업체 코스 (유형 이모지 표시) */
  tone: "am" | "pm" | "linear";
  editing: boolean;
  onChangeItem: (itemId: string, patch: ItemPatch) => void;
  onDeleteItem: (itemId: string) => void;
}

const TONE = {
  am: { node: "bg-indigo-600 text-white", rail: "bg-indigo-200" },
  pm: { node: "bg-emerald-600 text-white", rail: "bg-emerald-200" },
  linear: { node: "bg-slate-100 text-base ring-1 ring-slate-200", rail: "bg-slate-200" },
} as const;

const ADMISSION_LABELS: Record<Admission, string> = {
  enter: "입장",
  view_only: "외부 조망만",
  none: "해당 없음",
  unknown: "미확인",
};

/** 비용 입력창을 보여줄 유형. 유형이 없는 항목(AI 세미투어)은 둘 다 보여준다. */
const NO_COST_TYPES: ItemType[] = ["flight", "transfer", "hotel", "free_time"];
function costFields(type: ItemType | undefined) {
  if (type === undefined) return { fee: true, meal: true };
  if (NO_COST_TYPES.includes(type)) return { fee: false, meal: false };
  if (type === "meal") return { fee: false, meal: true };
  return { fee: true, meal: false };
}

const selectClass =
  "rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[11px] text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30";

export function TimelineItem({ item, order, isLast, currency, tone, editing, onChangeItem, onDeleteItem }: Props) {
  const symbol = currencySymbol(currency);
  const { fee, meal } = costFields(item.type);
  const typeMeta = ITEM_TYPE_META[item.type ?? "sightseeing"];
  const showEstimateTag = fee || meal;

  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${TONE[tone].node}`}
          title={tone === "linear" ? typeMeta.label : undefined}
        >
          {tone === "linear" ? typeMeta.emoji : order}
        </span>
        {!isLast && <span className={`my-1 w-0.5 flex-1 ${TONE[tone].rail}`} aria-hidden />}
      </div>

      <div className={`min-w-0 flex-1 ${isLast ? "" : "pb-3"}`}>
        {editing ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              aria-label="항목 이름"
              value={item.name}
              onChange={(e) => onChangeItem(item.id, { name: e.target.value })}
              className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
            />
            <select
              aria-label="항목 유형"
              value={item.type ?? "sightseeing"}
              onChange={(e) => onChangeItem(item.id, { type: e.target.value as ItemType })}
              className={selectClass}
            >
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ITEM_TYPE_META[t].emoji} {ITEM_TYPE_META[t].label}
                </option>
              ))}
            </select>
            <select
              aria-label="입장 여부"
              value={item.admission ?? "unknown"}
              onChange={(e) => {
                const admission = e.target.value as Admission;
                // 외부 조망이면 입장료는 없다 (해당 없음이어도 마사지·체험처럼 요금은 있을 수 있다)
                onChangeItem(item.id, admission === "view_only" ? { admission, entryFee: 0 } : { admission });
              }}
              className={selectClass}
            >
              {(Object.keys(ADMISSION_LABELS) as Admission[]).map((a) => (
                <option key={a} value={a}>
                  {ADMISSION_LABELS[a]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onDeleteItem(item.id)}
              aria-label={`${item.name} 삭제`}
              className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : (
          <h4 className="text-sm font-semibold text-slate-900">{item.name}</h4>
        )}

        {item.description && <p className="mt-1 text-xs leading-5 text-slate-600">{item.description}</p>}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {(item.stayMinutes > 0 || item.timeNote) && (
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              <Clock className="h-3 w-3" aria-hidden />
              {item.timeNote ? item.timeNote : `${formatDuration(item.stayMinutes)} 체류`}
            </span>
          )}
          {item.admission === "view_only" && !editing && (
            <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
              <Eye className="h-3 w-3" aria-hidden />
              외부 조망
            </span>
          )}
          {fee && (
            <MoneyInput
              label={feeLabel(item.type)}
              icon={Ticket}
              symbol={symbol}
              value={item.entryFee}
              onChange={(entryFee) => onChangeItem(item.id, { entryFee })}
            />
          )}
          {meal && (
            <MoneyInput
              label="식대"
              icon={Utensils}
              symbol={symbol}
              value={item.mealCost}
              onChange={(mealCost) => onChangeItem(item.id, { mealCost })}
            />
          )}
          {showEstimateTag && (
            <span
              className={`text-[10px] font-medium ${item.isEstimated ? "text-amber-600" : "text-emerald-600"}`}
              title={item.isEstimated ? "AI 추정치 — 실제 금액을 확인하세요" : "직접 수정한 금액"}
            >
              {item.isEstimated ? "AI 추정" : "직접 입력"}
            </span>
          )}
        </div>

        {item.caution && (
          <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] leading-4 text-amber-800">
            <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            {item.caution}
          </p>
        )}

        {!isLast && item.travelMinutesToNext !== null && item.travelMinutesToNext > 0 && (
          <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-400">
            <Bus className="h-3 w-3" aria-hidden />
            다음 장소까지 이동 {formatDuration(item.travelMinutesToNext)}
          </p>
        )}
      </div>
    </li>
  );
}
