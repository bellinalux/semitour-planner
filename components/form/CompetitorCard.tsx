import { Trash2 } from "lucide-react";
import { NumberField } from "@/components/ui/NumberField";
import { TextField } from "@/components/ui/TextField";
import { currencySymbol } from "@/lib/currency";
import { POLICY_LABELS } from "@/lib/competitorDiff";
import type { Competitor, CompetitorIncludes, CurrencyCode, TourPolicy } from "@/types";

const POLICIES: TourPolicy[] = ["none", "some", "unknown"];

const INCLUDE_OPTIONS: { key: keyof CompetitorIncludes; label: string }[] = [
  { key: "guide", label: "가이드" },
  { key: "meals", label: "식사" },
  { key: "admission", label: "입장료" },
  { key: "vehicle", label: "차량" },
  { key: "hotel", label: "숙박" },
  { key: "flight", label: "항공" },
];

interface Props {
  index: number;
  competitor: Competitor;
  currency: CurrencyCode;
  onChange: (next: Competitor) => void;
  onRemove: () => void;
}

export function CompetitorCard({ index, competitor, currency, onChange, onRemove }: Props) {
  const id = `competitor-${competitor.id}`;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-600">경쟁사 {index + 1}</span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`경쟁사 ${index + 1} 삭제`}
          className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <TextField
            id={`${id}-name`}
            label="상품/업체명"
            value={competitor.name}
            placeholder="예) A투어 시내 일주"
            onChange={(name) => onChange({ ...competitor, name })}
          />
          <NumberField
            id={`${id}-price`}
            label="1인 판매가"
            value={competitor.price}
            prefix={currencySymbol(currency)}
            onChange={(price) => onChange({ ...competitor, price })}
          />
        </div>

        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-slate-700">포함 항목</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {INCLUDE_OPTIONS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-1.5 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={!!competitor.includes[key]}
                  onChange={(e) =>
                    onChange({
                      ...competitor,
                      includes: { ...competitor.includes, [key]: e.target.checked },
                    })
                  }
                  className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          {(
            [
              { key: "shopping", label: "쇼핑 일정" },
              { key: "optionTour", label: "선택관광(옵션)" },
            ] as const
          ).map(({ key, label }) => (
            <div key={key}>
              <span className="mb-1.5 block text-xs font-medium text-slate-700">{label}</span>
              <div role="radiogroup" aria-label={label} className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white">
                {POLICIES.map((policy) => (
                  <button
                    key={policy}
                    type="button"
                    role="radio"
                    aria-checked={competitor[key] === policy}
                    onClick={() => onChange({ ...competitor, [key]: policy })}
                    className={`px-2 py-1 text-[11px] font-medium ${
                      competitor[key] === policy ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {POLICY_LABELS[policy]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <TextField
          id={`${id}-note`}
          label="특징/메모"
          value={competitor.note}
          placeholder="예) 쇼핑센터 2회 방문, 영어 가이드"
          onChange={(note) => onChange({ ...competitor, note })}
        />
      </div>
    </div>
  );
}
