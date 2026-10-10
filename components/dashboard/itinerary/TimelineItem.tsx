import { AlertCircle, BookmarkPlus, Bus, Check, ChevronDown, ChevronUp, Clock, ExternalLink, Eye, Ticket, Trash2, Utensils, Wallet } from "lucide-react";
import { useState } from "react";
import { DurationInput } from "@/components/ui/DurationInput";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { currencySymbol } from "@/lib/currency";
import type { ItemTiming } from "@/lib/dayLoad";
import { feeHint, isLocalPay } from "@/lib/fees";
import { formatDuration } from "@/lib/format";
import { feeLabel, ITEM_TYPE_META, ITEM_TYPES, stayTimeLabel } from "@/lib/itemTypes";
import { timeRange } from "@/lib/dayTidy";
import type { SegmentKind } from "@/lib/segmentLibrary";
import type { Admission, CurrencyCode, DayPlan, ItemType, ItineraryItem, OptionSuggestion, TourSlot } from "@/types";
import { AccessibilityBox, FeeCheckBadges, RelocateControls, SuggestedOptions, selectClass, type ItemPatch } from "./TimelineItemParts";

export type { ItemPatch };
import { useFx } from "./FxContext";

interface Props {
  item: ItineraryItem;
  order: number;
  isLast: boolean;
  /** 오전 미팅 시각부터 계산한 이 코스의 시작·종료 시각 (조식 등 타임라인에서 제외된 항목은 없음) */
  timing?: ItemTiming;
  currency: CurrencyCode;
  /** 이 항목이 속한 일차 (추천 옵션을 "선택 옵션"으로 추가할 때 필요) */
  dayNo: number;
  /** 다른 날로 이동·복사할 대상을 고를 때 쓰는 전체 일정 */
  days: DayPlan[];
  /** am/pm: 세미투어 오전/오후 (번호 표시) — linear: 업체 코스 (유형 이모지 표시) */
  tone: "am" | "pm" | "linear";
  editing: boolean;
  onChangeItem: (itemId: string, patch: ItemPatch) => void;
  onDeleteItem: (itemId: string) => void;
  onAddSuggestedOption: (suggestion: OptionSuggestion, dayNo: number) => void;
  onMoveItem: (itemId: string, direction: "up" | "down") => void;
  onRelocateItem: (itemId: string, targetDay: number, targetSlot: TourSlot, mode: "move" | "copy") => void;
  onSaveSegment: (items: ItineraryItem[], kind: SegmentKind, defaultName: string) => void;
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

export function TimelineItem({
  item,
  order,
  isLast,
  timing,
  currency,
  dayNo,
  days,
  tone,
  editing,
  onChangeItem,
  onDeleteItem,
  onAddSuggestedOption,
  onMoveItem,
  onRelocateItem,
  onSaveSegment,
}: Props) {
  const symbol = currencySymbol(currency);
  const { rate } = useFx();
  const [favorited, setFavorited] = useState(false);
  const { fee, meal } = costFields(item.type);
  const typeMeta = ITEM_TYPE_META[item.type ?? "sightseeing"];
  const showEstimateTag = fee || meal;
  const localPay = isLocalPay(item);
  const check = item.feeCheck;

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
        {timing && (
          <p className="mb-0.5 text-[11px] font-semibold tabular-nums text-indigo-600" title="오전 미팅 시각부터 계산한 예상 시작·종료 시각">
            {timeRange(timing)}
          </p>
        )}
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
              onClick={() => onMoveItem(item.id, "up")}
              disabled={order === 1}
              aria-label={`${item.name} 위로 이동`}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronUp className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onMoveItem(item.id, "down")}
              disabled={isLast}
              aria-label={`${item.name} 아래로 이동`}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronDown className="h-4 w-4" aria-hidden />
            </button>
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

        {editing && <RelocateControls item={item} dayNo={dayNo} days={days} onRelocateItem={onRelocateItem} />}

        {item.description && <p className="mt-1 text-xs leading-5 text-slate-600">{item.description}</p>}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {item.type === "hotel" && item.stayMinutes === 0 && !editing ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600" title="그날 마지막 숙소는 머무는 시간을 두지 않습니다 (편집에서 바꿀 수 있음)">
              투숙 · 체류시간 없음
            </span>
          ) : (
            <DurationInput label={stayTimeLabel(item.type)} icon={Clock} value={item.stayMinutes} onChange={(stayMinutes) => onChangeItem(item.id, { stayMinutes })} />
          )}
          {item.timeNote && (
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600" title="원문에 적힌 소요 시간 표기">
              {item.timeNote}
            </span>
          )}
          {/* 체류 시간을 어디서 확인했는지: 구역 확인(하루 순서 통째로) / 장소 확인(장소 하나만) / AI 추정 */}
          {item.timeCheck?.basis === "area" ? (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700"
              title={`하루 방문 순서를 웹에서 확인해 구역 단위(걸어서 함께 도는 장소 묶음)로 맞춘 시간${item.timeCheck.sourceName ? ` · 출처: ${item.timeCheck.sourceName}` : ""}`}
            >
              <Check className="size-3" aria-hidden />
              구역 확인{item.timeCheck.area ? ` · ${item.timeCheck.area}` : ""}
            </span>
          ) : null}
          {item.timeCheck?.basis === "area" && (item.timeCheck.dropOff || item.timeCheck.pickUp) ? (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"
              title="차량이 못 들어가는 걷기 구역 — 한 방향으로 걷고 차량은 반대편에서 기다립니다. 가이드·기사에게 미리 알려 주세요"
            >
              <Bus className="size-3" aria-hidden />
              {[item.timeCheck.dropOff && `하차 ${item.timeCheck.dropOff}`, item.timeCheck.pickUp && `픽업 ${item.timeCheck.pickUp}`].filter(Boolean).join(" → 걸어서 → ")}
            </span>
          ) : null}
          {item.timeCheck?.basis === "area" ? null : item.timeCheck?.basis === "place" || item.feeCheck?.stayMinutesChecked ? (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
              title={`이 장소 하나만 웹에서 확인한 통상적인 ${stayTimeLabel(item.type)} 시간 — 걸어서 함께 도는 장소들이면 일정 카드의 '시간 검증'으로 구역 단위로 맞추세요`}
            >
              <Check className="size-3" aria-hidden />
              장소 확인
            </span>
          ) : (
            item.isEstimated &&
            item.stayMinutes > 0 &&
            !["flight", "transfer", "hotel"].includes(item.type ?? "") && (
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500" title="AI가 추정한 시간 — 일정 카드의 '시간 검증'으로 확인할 수 있습니다">
                AI 추정
              </span>
            )
          )}
          {item.fromCatalog && (
            <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">투어 카탈로그</span>
          )}
          {favorited ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              <Check className="h-3 w-3" aria-hidden />
              즐겨찾기됨
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                onSaveSegment([item], "place", item.name);
                setFavorited(true);
              }}
              title="이 장소를 라이브러리에 저장해 다음에 검색으로 바로 넣을 수 있게 합니다"
              className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-amber-50 hover:text-amber-700"
            >
              <BookmarkPlus className="h-3 w-3" aria-hidden />
              즐겨찾기
            </button>
          )}
          {item.link && (
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline"
            >
              예약처 검색
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
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
          {meal && (
            <label className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 py-0.5 pl-2 pr-1 text-[11px] font-medium text-slate-600">
              음식 종류
              <input
                type="text"
                value={item.cuisine ?? ""}
                placeholder="현지식"
                aria-label="음식 종류"
                onChange={(e) => onChangeItem(item.id, { cuisine: e.target.value })}
                className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
              />
            </label>
          )}
          {(fee || meal) && (item.entryFee > 0 || item.mealCost > 0) && (
            <span className="text-[11px] font-medium tabular-nums text-slate-500" title="현지 금액과 원화 환산 (환율은 왼쪽 '원화 환율'에 입력한 값)">
              {feeHint(item.entryFee + item.mealCost, item, currency, rate)}
            </span>
          )}
          {showEstimateTag && (
            <span
              className={`text-[10px] font-medium ${check && check.status !== "unverified" ? "text-emerald-600" : item.isEstimated ? "text-amber-600" : "text-emerald-600"}`}
              title={item.isEstimated ? "AI 추정치 — 실제 금액을 확인하세요" : check && check.status !== "unverified" ? "웹에서 확인한 금액" : "직접 수정한 금액"}
            >
              {item.isEstimated ? "AI 추정" : check && check.status !== "unverified" ? "웹 확인" : "직접 입력"}
            </span>
          )}
          {(fee || meal) && (
            <button
              type="button"
              aria-pressed={localPay}
              onClick={() => onChangeItem(item.id, { payment: localPay ? "included" : "local" })}
              title={localPay ? "고객이 현지에서 직접 내는 항목입니다. 판매가와 원가에 넣지 않습니다. 누르면 판매가 포함으로 바뀝니다." : "판매가에 포함되는 항목입니다. 누르면 현지 지불(불포함)로 바뀝니다."}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                localPay ? "border-orange-300 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              <Wallet className="h-3 w-3" aria-hidden />
              {localPay ? "현지 지불(불포함)" : "판매가 포함"}
            </button>
          )}
          <FeeCheckBadges item={item} symbol={symbol} onChangeItem={onChangeItem} />
        </div>

        {check && (check.sourceName || check.note) && (
          <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
            {check.sourceName ? `확인 출처: ${check.sourceName}` : ""}
            {check.sourceName && check.note ? " · " : ""}
            {check.note}
          </p>
        )}

        {item.caution && (
          <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] leading-4 text-amber-800">
            <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            {item.caution}
          </p>
        )}

        <AccessibilityBox item={item} onDeleteItem={onDeleteItem} />

        <SuggestedOptions item={item} dayNo={dayNo} currency={currency} rate={rate} onAddSuggestedOption={onAddSuggestedOption} />

        {!isLast && item.travelMinutesToNext !== null && item.travelMinutesToNext > 0 && (
          <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-400">
            <Bus className="h-3 w-3" aria-hidden />
            {item.type === "flight"
              ? `비행 ${formatDuration(item.travelMinutesToNext)} (현지 시각 기준, 시차 포함)`
              : `다음 장소까지 이동 ${formatDuration(item.travelMinutesToNext)}`}
          </p>
        )}
      </div>
    </li>
  );
}
