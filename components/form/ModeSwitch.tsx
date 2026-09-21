import { ClipboardPaste, Sparkles } from "lucide-react";
import type { PlannerMode } from "@/types";

interface Props {
  value: PlannerMode;
  onChange: (mode: PlannerMode) => void;
}

const OPTIONS: { id: PlannerMode; label: string; hint: string; icon: typeof Sparkles }[] = [
  { id: "ai", label: "AI가 만들기", hint: "여행지·기간으로 세미투어 생성", icon: Sparkles },
  { id: "paste", label: "내 코스 붙여넣기", hint: "업체 코스를 구조화", icon: ClipboardPaste },
];

export function ModeSwitch({ value, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label="입력 방식" className="grid grid-cols-2 gap-2">
      {OPTIONS.map(({ id, label, hint, icon: Icon }) => {
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(id)}
            className={`rounded-lg border px-3 py-2 text-left transition-colors ${
              selected
                ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
                : "border-slate-200 bg-white hover:border-indigo-300"
            }`}
          >
            <span className={`flex items-center gap-1.5 text-xs font-semibold ${selected ? "text-indigo-800" : "text-slate-700"}`}>
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </span>
            <span className="mt-0.5 block text-[11px] text-slate-500">{hint}</span>
          </button>
        );
      })}
    </div>
  );
}
