import type { LucideIcon } from "lucide-react";
import type { CurrencyCode, ItineraryItem, OptionSuggestion } from "@/types";
import { TimelineItem, type ItemPatch } from "./TimelineItem";

interface Props {
  label: string;
  sublabel: string;
  icon: LucideIcon;
  tone: "am" | "pm";
  items: ItineraryItem[];
  currency: CurrencyCode;
  dayNo: number;
  editing: boolean;
  onChangeItem: (itemId: string, patch: ItemPatch) => void;
  onDeleteItem: (itemId: string) => void;
  onAddSuggestedOption: (suggestion: OptionSuggestion, dayNo: number) => void;
  /** 헤더 아래에 끼워 넣을 요소 (오후 A/B 선택 등) */
  children?: React.ReactNode;
}

const HEADER_TONE = {
  am: "bg-indigo-50 text-indigo-700",
  pm: "bg-emerald-50 text-emerald-700",
} as const;

export function SessionBlock({
  label,
  sublabel,
  icon: Icon,
  tone,
  items,
  currency,
  dayNo,
  editing,
  onChangeItem,
  onDeleteItem,
  onAddSuggestedOption,
  children,
}: Props) {
  return (
    <div>
      <div className={`mb-3 flex items-center gap-2 rounded-lg px-3 py-2 ${HEADER_TONE[tone]}`}>
        <Icon className="h-4 w-4" aria-hidden />
        <span className="text-xs font-semibold">{label}</span>
        <span className="text-[11px] opacity-80">{sublabel}</span>
      </div>
      {children}
      <ol className="space-y-0">
        {items.map((item, index) => (
          <TimelineItem
            key={item.id}
            item={item}
            order={index + 1}
            isLast={index === items.length - 1}
            currency={currency}
            dayNo={dayNo}
            tone={tone}
            editing={editing}
            onChangeItem={onChangeItem}
            onDeleteItem={onDeleteItem}
            onAddSuggestedOption={onAddSuggestedOption}
          />
        ))}
      </ol>
    </div>
  );
}
