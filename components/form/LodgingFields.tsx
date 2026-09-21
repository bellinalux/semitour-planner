import { NumberField } from "@/components/ui/NumberField";
import { lodgingUnitsFor } from "@/lib/cost";
import { currencySymbol } from "@/lib/currency";
import type { LodgingType } from "@/types";
import { CostField } from "./CostField";
import type { SectionProps } from "./types";

const TYPES: { id: LodgingType; label: string }[] = [
  { id: "hotel", label: "호텔" },
  { id: "bnb", label: "BnB·아파트" },
];

export function LodgingFields({ input, onChange }: SectionProps) {
  const symbol = currencySymbol(input.currency);
  const isBnb = input.lodgingType === "bnb";
  const unitLabel = isBnb ? "유닛" : "실";
  const units = lodgingUnitsFor(input.travelers, input.guestsPerUnit);

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-700">숙박 ({input.nights}박)</span>
        <div role="radiogroup" aria-label="숙소 유형" className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white">
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={input.lodgingType === t.id}
              onClick={() =>
                // 유형을 바꾸면 1실당 인원 기본값도 함께 바꾼다 (호텔 2인, BnB 4인)
                onChange({ lodgingType: t.id, guestsPerUnit: t.id === "bnb" ? 4 : 2 })
              }
              className={`px-2.5 py-1 text-[11px] font-medium ${
                input.lodgingType === t.id ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <CostField
          id="lodgingRatePerNight"
          label={`1${unitLabel} 1박 요금`}
          costKey="lodging"
          input={input}
          value={input.lodgingRatePerNight}
          prefix={symbol}
          onValueChange={(lodgingRatePerNight) => onChange({ lodgingRatePerNight })}
          onChange={onChange}
        />
        <NumberField
          id="guestsPerUnit"
          label={`1${unitLabel}당 인원`}
          value={input.guestsPerUnit}
          min={1}
          max={20}
          step={1}
          suffix="명"
          hint={`예상 ${input.travelers}명 → ${units}${unitLabel} 필요`}
          onChange={(guestsPerUnit) => onChange({ guestsPerUnit })}
        />
        {isBnb && (
          <NumberField
            id="cleaningFeePerUnit"
            label="청소비 (유닛당 1회)"
            value={input.cleaningFeePerUnit}
            prefix={symbol}
            onChange={(cleaningFeePerUnit) => onChange({ cleaningFeePerUnit })}
          />
        )}
        <NumberField
          id="cityTaxPerPersonPerNight"
          label="숙박세 (1인 1박)"
          value={input.cityTaxPerPersonPerNight}
          prefix={symbol}
          hint="없으면 0"
          onChange={(cityTaxPerPersonPerNight) => onChange({ cityTaxPerPersonPerNight })}
        />
      </div>
    </div>
  );
}
