import { Wallet } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { NumberField } from "@/components/ui/NumberField";
import { SectionCard } from "@/components/ui/SectionCard";
import { CURRENCIES, currencySymbol, formatMoney } from "@/lib/currency";
import type { CurrencyCode } from "@/types";
import type { SectionProps } from "./types";

export function CostSection({ input, onChange }: SectionProps) {
  const symbol = currencySymbol(input.currency);
  const fixedTotal =
    input.days * (input.vehicleCostPerDay + input.guideCostPerDay) + input.otherFixedCost;

  return (
    <SectionCard
      title="고정비용"
      description="입력한 통화 기준으로 견적이 계산됩니다"
      icon={Wallet}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field htmlFor="currency" label="견적 통화">
            <select
              id="currency"
              value={input.currency}
              onChange={(e) => onChange({ currency: e.target.value as CurrencyCode })}
              className={inputClass}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </Field>
          {input.currency !== "KRW" && (
            <NumberField
              id="exchangeRate"
              label="원화 환율"
              value={input.exchangeRateToKrw}
              prefix="₩"
              hint={`1 ${input.currency} 당`}
              onChange={(exchangeRateToKrw) => onChange({ exchangeRateToKrw })}
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <NumberField
            id="vehicleCostPerDay"
            label="차량비 (1일)"
            value={input.vehicleCostPerDay}
            prefix={symbol}
            onChange={(vehicleCostPerDay) => onChange({ vehicleCostPerDay })}
          />
          <NumberField
            id="guideCostPerDay"
            label="가이드비 (1일)"
            value={input.guideCostPerDay}
            prefix={symbol}
            onChange={(guideCostPerDay) => onChange({ guideCostPerDay })}
          />
        </div>
        <NumberField
          id="otherFixedCost"
          label="기타 고정비 (총액)"
          value={input.otherFixedCost}
          prefix={symbol}
          hint="예) 전세 버스 주차료, 단체 보험, 행사 준비비"
          onChange={(otherFixedCost) => onChange({ otherFixedCost })}
        />

        <div className="grid grid-cols-2 gap-3">
          <NumberField
            id="tipPerPerson"
            label="팁 (1인)"
            value={input.tipPerPerson}
            prefix={symbol}
            onChange={(tipPerPerson) => onChange({ tipPerPerson })}
          />
          <NumberField
            id="insurancePerPerson"
            label="보험료 (1인)"
            value={input.insurancePerPerson}
            prefix={symbol}
            onChange={(insurancePerPerson) => onChange({ insurancePerPerson })}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 text-xs">
          <span className="text-slate-500">
            고정비 합계 ({input.days}일 × 차량+가이드 + 기타)
          </span>
          <span className="font-semibold tabular-nums text-slate-900">
            {formatMoney(fixedTotal, input.currency)}
          </span>
        </div>
      </div>
    </SectionCard>
  );
}
