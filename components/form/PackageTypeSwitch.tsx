import { BedDouble, Map, Plane } from "lucide-react";
import type { PackageType } from "@/types";

interface Props {
  value: PackageType;
  onChange: (value: PackageType) => void;
}

const OPTIONS: { id: PackageType; label: string; hint: string; icon: typeof Map }[] = [
  { id: "land", label: "랜드만", hint: "현지 프로그램만 판매", icon: Map },
  { id: "land_hotel", label: "랜드+숙박", hint: "현지 프로그램과 숙소", icon: BedDouble },
  { id: "full", label: "풀패키지", hint: "항공·숙박·현지 프로그램", icon: Plane },
];

export function PackageTypeSwitch({ value, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label="판매 구성" className="grid grid-cols-3 gap-2">
      {OPTIONS.map(({ id, label, hint, icon: Icon }) => {
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(id)}
            className={`rounded-lg border px-2.5 py-2 text-left transition-colors ${
              selected ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500" : "border-slate-200 bg-white hover:border-indigo-300"
            }`}
          >
            <span className={`flex items-center gap-1 text-xs font-semibold ${selected ? "text-indigo-800" : "text-slate-700"}`}>
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {label}
            </span>
            <span className="mt-0.5 block text-[10px] leading-3 text-slate-500">{hint}</span>
          </button>
        );
      })}
    </div>
  );
}
