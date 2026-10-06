import { Accessibility, AlertTriangle, ArrowRightLeft, BadgeCheck, Copy, HelpCircle, Plus, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { itemFeeText } from "@/lib/fees";
import { slotOptions } from "@/lib/tourItem";
import type { CurrencyCode, DayPlan, ItineraryItem, OptionSuggestion, TourSlot } from "@/types";

/** 일정 항목 카드의 하위 블록 — 다른 날로 옮기기, 요금 확인 배지, 편의시설, 선택 옵션 추천 */

export type ItemPatch = Partial<ItineraryItem>;

export const selectClass =
  "rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[11px] text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30";

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

/** 다른 날짜로 이동·복사 (편집 중일 때만) */
export function RelocateControls({
  item,
  dayNo,
  days,
  onRelocateItem,
}: {
  item: ItineraryItem;
  dayNo: number;
  days: DayPlan[];
  onRelocateItem: (itemId: string, targetDay: number, targetSlot: TourSlot, mode: "move" | "copy") => void;
}) {
  const otherDays = days.filter((d) => d.day !== dayNo);
  const [targetDay, setTargetDay] = useState<number>(otherDays[0]?.day ?? dayNo);
  const targetDayPlan = days.find((d) => d.day === targetDay) ?? otherDays[0];
  const targetSlots = targetDayPlan ? slotOptions(targetDayPlan) : [];
  const [targetSlot, setTargetSlot] = useState<TourSlot>(targetSlots[0]?.slot ?? "day");
  const activeTargetSlot = targetSlots.some((s) => s.slot === targetSlot) ? targetSlot : (targetSlots[0]?.slot ?? "day");
  if (otherDays.length === 0) return null;

  return (
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
  );
}

/** 웹 요금 확인 결과 배지 (다르면 "확인가 적용") */
export function FeeCheckBadges({ item, symbol, onChangeItem }: { item: ItineraryItem; symbol: string; onChangeItem: (itemId: string, patch: ItemPatch) => void }) {
  const check = item.feeCheck;
  if (!check) return null;
  return (
    <>
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
    </>
  );
}

/** 이용 편의시설 확인 결과 */
export function AccessibilityBox({ item, onDeleteItem }: { item: ItineraryItem; onDeleteItem: (itemId: string) => void }) {
  if (!item.accessibility) return null;
  return (
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
  );
}

/** 이 코스에서 팔 만한 선택 옵션 (웹 조사 결과) */
export function SuggestedOptions({
  item,
  dayNo,
  currency,
  rate,
  onAddSuggestedOption,
}: {
  item: ItineraryItem;
  dayNo: number;
  currency: CurrencyCode;
  rate: number;
  onAddSuggestedOption: (suggestion: OptionSuggestion, dayNo: number) => void;
}) {
  const [addedNames, setAddedNames] = useState<string[]>([]);
  if (!item.suggestedOptions || item.suggestedOptions.length === 0) return null;
  return (
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
  );
}
