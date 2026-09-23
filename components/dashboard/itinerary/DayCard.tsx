import { AlertTriangle, BedDouble, BookmarkPlus, Clock, Plus, Sun, Sunset } from "lucide-react";
import { calcDayLoad, type DayLoadLevel } from "@/lib/dayLoad";
import { formatDuration } from "@/lib/format";
import type { SegmentKind } from "@/lib/segmentLibrary";
import type { DayPlan, CurrencyCode, ItineraryItem, OptionSuggestion, PmFreeOption, TourSlot } from "@/types";
import { PmOptionSwitch } from "./PmOptionSwitch";
import { SessionBlock } from "./SessionBlock";
import { TimelineItem, type ItemPatch } from "./TimelineItem";

const LOAD_BADGE_TONE: Record<DayLoadLevel, string> = {
  ok: "bg-white text-slate-600 ring-slate-200",
  tight: "bg-amber-50 text-amber-800 ring-amber-200",
  overloaded: "bg-rose-50 text-rose-700 ring-rose-200",
};

const LOAD_WARNING: Record<Exclude<DayLoadLevel, "ok">, string> = {
  tight: "이동·체류 시간이 빠듯합니다. 코스를 줄이는 것을 검토하세요.",
  overloaded: "이동·체류 시간을 다 더하면 하루에 소화하기 어렵습니다. 코스를 줄이거나 다른 날로 옮기세요.",
};

interface Props {
  plan: DayPlan;
  /** 다른 날로 이동·복사할 때, 새 날짜로 즐겨찾기를 넣을 때 쓰는 전체 일정 */
  days: DayPlan[];
  /** 이 날짜의 숙박 도시에서 선택해 둔 호텔 이름 (없으면 표시하지 않는다) */
  hotelName?: string;
  currency: CurrencyCode;
  selectedPmId: PmFreeOption["id"];
  editing: boolean;
  onSelectPm: (id: PmFreeOption["id"]) => void;
  onChangeItem: (itemId: string, patch: ItemPatch) => void;
  onDeleteItem: (itemId: string) => void;
  onAddItem: (day: number) => void;
  onAddSuggestedOption: (suggestion: OptionSuggestion, dayNo: number) => void;
  onMoveItem: (itemId: string, direction: "up" | "down") => void;
  onRelocateItem: (itemId: string, targetDay: number, targetSlot: TourSlot, mode: "move" | "copy") => void;
  onSaveSegment: (items: ItineraryItem[], kind: SegmentKind, defaultName: string) => void;
}

export function DayCard({
  plan,
  days,
  hotelName,
  currency,
  selectedPmId,
  editing,
  onSelectPm,
  onChangeItem,
  onDeleteItem,
  onAddItem,
  onAddSuggestedOption,
  onMoveItem,
  onRelocateItem,
  onSaveSegment,
}: Props) {
  const selected = plan.pmFreeOptions.find((o) => o.id === selectedPmId) ?? plan.pmFreeOptions[0];
  const load = calcDayLoad(plan, { [plan.day]: selectedPmId });

  return (
    <article className="rounded-lg border border-slate-200">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
        <span className="rounded-md bg-slate-900 px-2 py-1 text-xs font-bold text-white">DAY {plan.day}</span>
        <h3 className="min-w-0 flex-1 text-sm font-semibold text-slate-900">{plan.theme}</h3>
        {plan.overnightCity && (
          <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
            <BedDouble className="h-3 w-3" aria-hidden />
            {plan.overnightCity} 숙박{hotelName ? ` · ${hotelName}` : ""}
          </span>
        )}
        {load.totalMinutes > 0 && (
          <span
            title={`체류 ${formatDuration(load.stayMinutes)} + 이동 ${formatDuration(load.travelMinutes)}`}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ring-1 ${LOAD_BADGE_TONE[load.level]}`}
          >
            <Clock className="h-3 w-3" aria-hidden />총 {formatDuration(load.totalMinutes)}
          </span>
        )}
        {plan.kind === "linear" && plan.items.length > 0 && (
          <button
            type="button"
            onClick={() => onSaveSegment(plan.items, "day", plan.theme || `DAY ${plan.day}`)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
          >
            <BookmarkPlus className="h-3.5 w-3.5" aria-hidden />
            즐겨찾기
          </button>
        )}
      </header>
      {load.level !== "ok" && (
        <p className={`flex items-start gap-1.5 border-b border-slate-100 px-4 py-2 text-[11px] leading-4 ${load.level === "overloaded" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          {LOAD_WARNING[load.level]}
        </p>
      )}

      <div className="space-y-5 p-4">
        {plan.kind === "linear" ? (
          <div>
            <ol>
              {plan.items.map((item, index) => (
                <TimelineItem
                  key={item.id}
                  item={item}
                  order={index + 1}
                  isLast={index === plan.items.length - 1}
                  currency={currency}
                  dayNo={plan.day}
                  days={days}
                  tone="linear"
                  editing={editing}
                  onChangeItem={onChangeItem}
                  onDeleteItem={onDeleteItem}
                  onAddSuggestedOption={onAddSuggestedOption}
                  onMoveItem={onMoveItem}
                  onRelocateItem={onRelocateItem}
                  onSaveSegment={onSaveSegment}
                />
              ))}
            </ol>
            {editing && (
              <button
                type="button"
                onClick={() => onAddItem(plan.day)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-indigo-400 hover:text-indigo-700"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                항목 추가
              </button>
            )}
          </div>
        ) : (
          <>
            <SessionBlock
              label="오전"
              sublabel="가이드 투어"
              icon={Sun}
              tone="am"
              items={plan.amGuided}
              currency={currency}
              dayNo={plan.day}
              days={days}
              editing={editing}
              onChangeItem={onChangeItem}
              onDeleteItem={onDeleteItem}
              onAddSuggestedOption={onAddSuggestedOption}
              onMoveItem={onMoveItem}
              onRelocateItem={onRelocateItem}
              onSaveSegment={onSaveSegment}
            />
            {selected && (
              <SessionBlock
                label="오후"
                sublabel="반자유 일정 · 코스를 선택하세요"
                icon={Sunset}
                tone="pm"
                items={selected.items}
                currency={currency}
                dayNo={plan.day}
                days={days}
                editing={editing}
                onChangeItem={onChangeItem}
                onDeleteItem={onDeleteItem}
                onAddSuggestedOption={onAddSuggestedOption}
                onMoveItem={onMoveItem}
                onRelocateItem={onRelocateItem}
                onSaveSegment={onSaveSegment}
              >
                <PmOptionSwitch
                  day={plan.day}
                  options={plan.pmFreeOptions}
                  selectedId={selected.id}
                  onSelect={onSelectPm}
                />
              </SessionBlock>
            )}
          </>
        )}
      </div>
    </article>
  );
}
