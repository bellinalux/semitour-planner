import { TRIP_SCOPES } from "@/lib/defaults";
import type { TripScope } from "@/types";

interface Props {
  value: TripScope;
  onChange: (scope: TripScope) => void;
}

export function TripScopeSwitch({ value, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label="국내여행·해외여행" className="grid grid-cols-2 gap-2">
      {TRIP_SCOPES.map(({ id, label }) => {
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(id)}
            className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors ${
              selected ? "border-indigo-500 bg-indigo-50 text-indigo-800 ring-1 ring-indigo-500" : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
