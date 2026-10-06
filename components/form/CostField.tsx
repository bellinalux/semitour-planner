import { NumberField } from "@/components/ui/NumberField";
import { StatusToggle } from "@/components/ui/StatusToggle";
import { costSourceLabel, withSource } from "@/lib/costSource";
import type { Certainty, CostKey, TripInput } from "@/types";

interface Props {
  id: string;
  label: string;
  costKey: CostKey;
  input: TripInput;
  value: number;
  prefix: string;
  hint?: string;
  suffix?: string;
  onValueChange: (value: number) => void;
  onChange: (patch: Partial<TripInput>) => void;
}

/** 금액 입력 + 그 항목의 확정도(확정/추정/미정) 토글 + 값의 출처 */
export function CostField({ id, label, costKey, input, value, prefix, hint, suffix, onValueChange, onChange }: Props) {
  const status: Certainty = input.costStatus[costKey] ?? "confirmed";
  const source = costSourceLabel(input.costSource[costKey]);
  // 직접 고치면 출처를 "직접 입력"으로 바꾼다
  const handleValue = (next: number) => {
    onValueChange(next);
    if (input.costSource[costKey]?.kind !== "manual") onChange(withSource(input, costKey, "manual"));
  };

  return (
    <div>
      <NumberField id={id} label={label} value={value} prefix={prefix} suffix={suffix} hint={hint} onChange={handleValue} />
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusToggle
          label={`${label} 확정도`}
          value={status}
          onChange={(next) => onChange({ costStatus: { ...input.costStatus, [costKey]: next } })}
        />
        {source && value > 0 && <span className="text-[10px] text-slate-400">출처: {source}</span>}
      </div>
    </div>
  );
}
