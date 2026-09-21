import { Percent } from "lucide-react";
import { NumberField } from "@/components/ui/NumberField";
import { SectionCard } from "@/components/ui/SectionCard";
import { currencySymbol } from "@/lib/currency";
import type { PricingMode } from "@/types";
import type { SectionProps } from "./types";

const MODES: { id: PricingMode; label: string; hint: string }[] = [
  { id: "target_margin", label: "목표 마진으로 계산", hint: "원가 + 마진율 → 권장 판매가" },
  { id: "fixed_price", label: "판매가 직접 입력", hint: "판매가 → 실제 마진 확인" },
];

export function PricingSection({ input, onChange }: SectionProps) {
  const isFixed = input.pricingMode === "fixed_price";

  return (
    <SectionCard
      title="가격 정책"
      description={isFixed ? "입력한 판매가로 팔 때의 마진을 계산합니다" : "판매가 = 원가 ÷ (1 − 마진율 − 카드 수수료율)로 역산합니다"}
      icon={Percent}
    >
      <div className="space-y-4">
        <div role="radiogroup" aria-label="가격 계산 방식" className="grid grid-cols-2 gap-2">
          {MODES.map((mode) => {
            const selected = input.pricingMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange({ pricingMode: mode.id })}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  selected ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500" : "border-slate-200 bg-white hover:border-indigo-300"
                }`}
              >
                <span className={`block text-xs font-semibold ${selected ? "text-indigo-800" : "text-slate-700"}`}>{mode.label}</span>
                <span className="mt-0.5 block text-[10px] leading-3 text-slate-500">{mode.hint}</span>
              </button>
            );
          })}
        </div>

        {isFixed && (
          <NumberField
            id="fixedPricePerPerson"
            label="1인 판매가"
            value={input.fixedPricePerPerson}
            prefix={currencySymbol(input.currency)}
            hint="패키지 가격이 이미 정해졌다면 입력하세요. 견적서에 실제 이익과 마진율이 나옵니다."
            onChange={(fixedPricePerPerson) => onChange({ fixedPricePerPerson })}
          />
        )}

        <NumberField
          id="targetMarginRate"
          label={isFixed ? "목표 마진율 (달성 최소 인원 계산용)" : "목표 마진율 (판매가 대비)"}
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
            hint="일정 변동비 대비"
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
