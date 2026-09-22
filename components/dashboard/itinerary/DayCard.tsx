import { BedDouble, Plus, Sun, Sunset } from "lucide-react";
import type { CurrencyCode, DayPlan, OptionSuggestion, PmFreeOption } from "@/types";
import { PmOptionSwitch } from "./PmOptionSwitch";
import { SessionBlock } from "./SessionBlock";
import { TimelineItem, type ItemPatch } from "./TimelineItem";

interface Props {
  plan: DayPlan;
  currency: CurrencyCode;
  selectedPmId: PmFreeOption["id"];
  editing: boolean;
  onSelectPm: (id: PmFreeOption["id"]) => void;
  onChangeItem: (itemId: string, patch: ItemPatch) => void;
  onDeleteItem: (itemId: string) => void;
  onAddItem: (day: number) => void;
  onAddSuggestedOption: (suggestion: OptionSuggestion, dayNo: number) => void;
}

export function DayCard({
  plan,
  currency,
  selectedPmId,
  editing,
  onSelectPm,
  onChangeItem,
  onDeleteItem,
  onAddItem,
  onAddSuggestedOption,
}: Props) {
  const selected = plan.pmFreeOptions.find((o) => o.id === selectedPmId) ?? plan.pmFreeOptions[0];

  return (
    <article className="rounded-lg border border-slate-200">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
        <span className="rounded-md bg-slate-900 px-2 py-1 text-xs font-bold text-white">DAY {plan.day}</span>
        <h3 className="min-w-0 flex-1 text-sm font-semibold text-slate-900">{plan.theme}</h3>
        {plan.overnightCity && (
          <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
            <BedDouble className="h-3 w-3" aria-hidden />
            {plan.overnightCity} 숙박
          </span>
        )}
      </header>

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
                  tone="linear"
                  editing={editing}
                  onChangeItem={onChangeItem}
                  onDeleteItem={onDeleteItem}
                  onAddSuggestedOption={onAddSuggestedOption}
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
              editing={editing}
              onChangeItem={onChangeItem}
              onDeleteItem={onDeleteItem}
              onAddSuggestedOption={onAddSuggestedOption}
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
                editing={editing}
                onChangeItem={onChangeItem}
                onDeleteItem={onDeleteItem}
                onAddSuggestedOption={onAddSuggestedOption}
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
