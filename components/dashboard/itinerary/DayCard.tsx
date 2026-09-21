import { Sun, Sunset } from "lucide-react";
import type { CurrencyCode, DayPlan, PmFreeOption } from "@/types";
import { PmOptionSwitch } from "./PmOptionSwitch";
import { SessionBlock } from "./SessionBlock";
import type { ItemCostPatch } from "./TimelineItem";

interface Props {
  plan: DayPlan;
  currency: CurrencyCode;
  selectedPmId: PmFreeOption["id"];
  onSelectPm: (id: PmFreeOption["id"]) => void;
  onChangeCost: (itemId: string, patch: ItemCostPatch) => void;
}

export function DayCard({ plan, currency, selectedPmId, onSelectPm, onChangeCost }: Props) {
  const selected = plan.pmFreeOptions.find((o) => o.id === selectedPmId) ?? plan.pmFreeOptions[0];

  return (
    <article className="rounded-lg border border-slate-200">
      <header className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
        <span className="rounded-md bg-slate-900 px-2 py-1 text-xs font-bold text-white">DAY {plan.day}</span>
        <h3 className="text-sm font-semibold text-slate-900">{plan.theme}</h3>
      </header>

      <div className="space-y-5 p-4">
        <SessionBlock
          label="오전"
          sublabel="가이드 투어"
          icon={Sun}
          tone="am"
          items={plan.amGuided}
          currency={currency}
          onChangeCost={onChangeCost}
        />
        {selected && (
          <SessionBlock
            label="오후"
            sublabel="반자유 일정 · 코스를 선택하세요"
            icon={Sunset}
            tone="pm"
            items={selected.items}
            currency={currency}
            onChangeCost={onChangeCost}
          >
            <PmOptionSwitch
              day={plan.day}
              options={plan.pmFreeOptions}
              selectedId={selected.id}
              onSelect={onSelectPm}
            />
          </SessionBlock>
        )}
      </div>
    </article>
  );
}
