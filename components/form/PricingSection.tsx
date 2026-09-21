import { Percent } from "lucide-react";
import { NumberField } from "@/components/ui/NumberField";
import { SectionCard } from "@/components/ui/SectionCard";
import type { SectionProps } from "./types";

export function PricingSection({ input, onChange }: SectionProps) {
  return (
    <SectionCard
      title="가격 정책"
      description="판매가 = 원가 ÷ (1 − 마진율)로 역산합니다"
      icon={Percent}
    >
      <div className="space-y-4">
        <NumberField
          id="targetMarginRate"
          label="목표 마진율 (판매가 대비)"
          value={input.targetMarginRate}
          suffix="%"
          min={0}
          max={90}
          hint="원가에 %를 더하는 마크업과 다릅니다. 마진율 25% = 판매가의 25%가 이익"
          onChange={(targetMarginRate) => onChange({ targetMarginRate })}
        />
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            id="contingencyRate"
            label="예비비"
            value={input.contingencyRate}
            suffix="%"
            max={50}
            hint="변동 원가 대비"
            onChange={(contingencyRate) => onChange({ contingencyRate })}
          />
          <NumberField
            id="cardFeeRate"
            label="카드 수수료"
            value={input.cardFeeRate}
            suffix="%"
            max={20}
            hint="판매가 대비"
            onChange={(cardFeeRate) => onChange({ cardFeeRate })}
          />
        </div>
      </div>
    </SectionCard>
  );
}
