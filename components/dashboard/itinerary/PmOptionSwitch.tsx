import type { PmFreeOption } from "@/types";

interface Props {
  day: number;
  options: PmFreeOption[];
  selectedId: PmFreeOption["id"];
  onSelect: (id: PmFreeOption["id"]) => void;
}

/** 오후 반자유 일정의 추천 코스 A/B 중 하나를 고른다. 선택값은 견적 계산에도 쓰인다. */
export function PmOptionSwitch({ day, options, selectedId, onSelect }: Props) {
  return (
    <div role="radiogroup" aria-label={`${day}일차 오후 코스 선택`} className="mb-3 grid gap-2 sm:grid-cols-2">
      {options.map((option) => {
        const selected = option.id === selectedId;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(option.id)}
            className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
              selected
                ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500"
                : "border-slate-200 bg-white hover:border-emerald-300"
            }`}
          >
            <span
              className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                selected ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"
              }`}
            >
              {option.id}
            </span>
            <span className="text-xs font-medium leading-4 text-slate-800">{option.title}</span>
          </button>
        );
      })}
    </div>
  );
}
