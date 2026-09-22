import { Accessibility, AlertCircle, AlertTriangle, ArrowRightLeft, BadgeCheck, BookmarkPlus, Bus, Check, ChevronDown, ChevronUp, Clock, Copy, ExternalLink, Eye, HelpCircle, Plus, Sparkles, Ticket, Trash2, Utensils, Wallet, X } from "lucide-react";
import { useState } from "react";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { currencySymbol } from "@/lib/currency";
import { feeHint, isLocalPay, itemFeeText } from "@/lib/fees";
import { formatDuration } from "@/lib/format";
import { feeLabel, ITEM_TYPE_META, ITEM_TYPES } from "@/lib/itemTypes";
import { slotOptions } from "@/lib/tourItem";
import type { SegmentKind } from "@/lib/segmentLibrary";
import type { Admission, CurrencyCode, DayPlan, ItemType, ItineraryItem, OptionSuggestion, TourSlot } from "@/types";
import { useFx } from "./FxContext";

export type ItemPatch = Partial<ItineraryItem>;

interface Props {
  item: ItineraryItem;
  order: number;
  isLast: boolean;
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

const ACCESSIBILITY_LABELS: Record<NonNullable<ItineraryItem["accessibility"]>["level"], string> = {
  ok: "이용 가능",
  limited: "일부 구간 어려움",
  difficult: "이용 어려움",
  unknown: "확인 못함",
};

const ACCESSIBILITY_TONE: Record<NonNullable<ItineraryItem["accessibility"]>["level"], string> = {
  ok: "bg-emerald-50 text-emerald-800",
  limited: "bg-amber-50 text-amber-800",
  difficult: "bg-rose-50 text-rose-800",
  unknown: "bg-slate-100 text-slate-600",
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

export function TimelineItem({
  item,
  order,
  isLast,
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
  const [addedNames, setAddedNames] = useState<string[]>([]);
  const [favorited, setFavorited] = useState(false);
  const otherDays = days.filter((d) => d.day !== dayNo);
  const [targetDay, setTargetDay] = useState<number>(otherDays[0]?.day ?? dayNo);
  const targetDayPlan = days.find((d) => d.day === targetDay) ?? otherDays[0];
  const targetSlots = targetDayPlan ? slotOptions(targetDayPlan) : [];
  const [targetSlot, setTargetSlot] = useState<TourSlot>(targetSlots[0]?.slot ?? "day");
  const activeTargetSlot = targetSlots.some((s) => s.slot === targetSlot) ? targetSlot : (targetSlots[0]?.slot ?? "day");
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

        {editing && otherDays.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <select
              aria-label={`${item.name} 옮길 날짜`}
              value={targetDayPlan?.day}
              onChange={(e) => setTargetDay(Number(e.target.value))}
              className={selectClass}
            >
              {otherDays.map((d) => (
                <option key={d.day} value={d.day}>
                  DAY {d.day} · {d.theme.slice(0, 12)}
                </option>
              ))}
            </select>
            <select
              aria-label={`${item.name} 옮길 위치`}
              value={activeTargetSlot}
              onChange={(e) => setTargetSlot(e.target.value as TourSlot)}
              className={selectClass}
            >
              {targetSlots.map((s) => (
                <option key={s.slot} value={s.slot}>
                  {s.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => targetDayPlan && onRelocateItem(item.id, targetDayPlan.day, activeTargetSlot, "move")}
              disabled={!targetDayPlan}
              title="다른 날짜로 옮깁니다 (여기서는 빠집니다)"
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden />
              이동
            </button>
            <button
              type="button"
              onClick={() => targetDayPlan && onRelocateItem(item.id, targetDayPlan.day, activeTargetSlot, "copy")}
              disabled={!targetDayPlan}
              title="다른 날짜에 복사합니다 (여기는 그대로 남습니다)"
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
              복사
            </button>
          </div>
        )}

        {item.description && <p className="mt-1 text-xs leading-5 text-slate-600">{item.description}</p>}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {(item.stayMinutes > 0 || item.timeNote) && (
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              <Clock className="h-3 w-3" aria-hidden />
              {item.timeNote ? item.timeNote : `${formatDuration(item.stayMinutes)} 체류`}
            </span>
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
          {check?.status === "confirmed" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              <BadgeCheck className="h-3 w-3" aria-hidden />
              요금 확인됨
            </span>
          )}
          {check?.status === "free" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
              <BadgeCheck className="h-3 w-3" aria-hidden />
              무료 확인
            </span>
          )}
          {check?.status === "unverified" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
              <HelpCircle className="h-3 w-3" aria-hidden />
              요금 확인 못함
            </span>
          )}
          {check?.status === "differs" && check.foundAmount !== undefined && (
            <span className="inline-flex flex-wrap items-center gap-1.5 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
              웹 확인가 {symbol}
              {check.foundAmount.toLocaleString("ko-KR")} (입력값과 다름)
              <button
                type="button"
                onClick={() =>
                  onChangeItem(item.id, {
                    entryFee: check.foundAmount,
                    isEstimated: false,
                    feeCheck: { ...check, status: "confirmed", foundAmount: undefined },
                  })
                }
                className="rounded border border-rose-300 bg-white px-1.5 py-px text-[10px] font-semibold text-rose-700 hover:bg-rose-100"
              >
                확인가 적용
              </button>
            </span>
          )}
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

        {item.accessibility && (
          <div className={`mt-2 rounded-md px-2.5 py-1.5 text-[11px] leading-4 ${ACCESSIBILITY_TONE[item.accessibility.level]}`}>
            <p className="flex items-center gap-1.5 font-semibold">
              <Accessibility className="h-3.5 w-3.5 shrink-0" aria-hidden />
              이용 편의시설: {ACCESSIBILITY_LABELS[item.accessibility.level]}
            </p>
            {item.accessibility.level !== "unknown" && (
              <p className="mt-0.5">
                {[
                  item.accessibility.wheelchairAccessible ? "휠체어 이용 가능" : "휠체어 이용 어려움",
                  item.accessibility.accessibleRestroom ? "장애인 화장실 있음" : "장애인 화장실 없음/미확인",
                  item.accessibility.elevator ? "엘리베이터 있음" : "엘리베이터 없음/미확인",
                  item.accessibility.ramp ? "경사로 있음" : "경사로 없음/미확인",
                ].join(" · ")}
              </p>
            )}
            {item.accessibility.note && <p className="mt-0.5 text-slate-500">{item.accessibility.note}</p>}
            {item.accessibility.mustSeeButHard && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-rose-200/70 pt-1.5">
                <span className="inline-flex items-center gap-1 font-semibold text-rose-700">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  꼭 봐야 할 대표 코스지만 이용이 어려움 — 고객 상황에 맞게 선택하세요
                </span>
                <button
                  type="button"
                  onClick={() => onDeleteItem(item.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                >
                  <X className="h-3 w-3" aria-hidden />
                  이 코스 빼기
                </button>
              </div>
            )}
          </div>
        )}

        {item.suggestedOptions && item.suggestedOptions.length > 0 && (
          <div className="mt-2 space-y-1.5 rounded-md border border-indigo-100 bg-indigo-50/40 px-2.5 py-1.5 text-[11px] leading-4">
            <p className="flex items-center gap-1.5 font-semibold text-indigo-800">
              <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />이 코스에서 팔 만한 선택 옵션
            </p>
            <ul className="space-y-1.5">
              {item.suggestedOptions.map((s, i) => (
                <li key={`${s.name}-${i}`} className="rounded-md bg-white px-2 py-1.5 ring-1 ring-indigo-100">
                  <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800">{s.name}</p>
                      {s.description && <p className="text-slate-500">{s.description}</p>}
                    </div>
                    {addedNames.includes(s.name) ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">
                        추가됨
                      </span>
                    ) : (
                      s.status === "confirmed" && (
                        <button
                          type="button"
                          onClick={() => {
                            onAddSuggestedOption(s, dayNo);
                            setAddedNames((prev) => [...prev, s.name]);
                          }}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-indigo-300 bg-indigo-50 px-1.5 py-0.5 font-semibold text-indigo-700 hover:bg-indigo-100"
                        >
                          <Plus className="h-3 w-3" aria-hidden />
                          선택 옵션으로 추가
                        </button>
                      )
                    )}
                  </div>
                  <p className="mt-1">
                    {s.status === "confirmed" ? (
                      <span className="font-semibold tabular-nums text-slate-900">{itemFeeText(s.amount, { local: s.local }, { currency, exchangeRateToKrw: rate })}</span>
                    ) : (
                      <span className="text-slate-500">요금 확인 못함</span>
                    )}
                    {s.sourceName && <span className="text-slate-400"> · 확인 출처: {s.sourceName}</span>}
                  </p>
                  {s.note && <p className="mt-0.5 text-slate-500">{s.note}</p>}
                </li>
              ))}
            </ul>
          </div>
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
