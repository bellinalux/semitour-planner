import type { Certainty } from "@/types";

interface Props {
  value: Certainty;
  onChange: (value: Certainty) => void;
  /** 접근성 라벨 (예: "차량비 확정도") */
  label: string;
}

const OPTIONS: { id: Certainty; label: string; title: string; on: string }[] = [
  { id: "confirmed", label: "확정", title: "금액이 정해졌습니다", on: "bg-emerald-600 text-white" },
  { id: "estimated", label: "추정", title: "대략적인 값입니다 (가격에는 포함)", on: "bg-amber-500 text-white" },
  {
    id: "undecided",
    label: "미정",
    title: "아직 모릅니다. 기본 가격에서 빼고, 포함했을 때의 가격을 따로 보여줍니다",
    on: "bg-slate-600 text-white",
  },
];

/** 비용 항목의 확정도를 고르는 작은 3택 토글 */
export function StatusToggle({ value, onChange, label }: Props) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex overflow-hidden rounded-md border border-slate-200 bg-white">
      {OPTIONS.map((option) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.title}
            onClick={() => onChange(option.id)}
            className={`px-2 py-0.5 text-[10px] font-semibold transition-colors ${
              selected ? option.on : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
