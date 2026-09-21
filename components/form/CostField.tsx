import { NumberField } from "@/components/ui/NumberField";
import { StatusToggle } from "@/components/ui/StatusToggle";
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

/** 금액 입력 + 그 항목의 확정도(확정/추정/미정) 토글 */
export function CostField({ id, label, costKey, input, value, prefix, hint, suffix, onValueChange, onChange }: Props) {
  const status: Certainty = input.costStatus[costKey] ?? "confirmed";

  return (
    <div>
      <NumberField id={id} label={label} value={value} prefix={prefix} suffix={suffix} hint={hint} onChange={onValueChange} />
      <div className="mt-1.5">
        <StatusToggle
          label={`${label} 확정도`}
          value={status}
          onChange={(next) => onChange({ costStatus: { ...input.costStatus, [costKey]: next } })}
        />
      </div>
    </div>
  );
}
