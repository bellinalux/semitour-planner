import { Field, inputClass } from "@/components/ui/Field";
import { NumberField } from "@/components/ui/NumberField";
import { SectionCard } from "@/components/ui/SectionCard";
import { CalendarClock } from "lucide-react";
import { CURRENCIES } from "@/lib/currency";
import type { CurrencyCode } from "@/types";
import { FxRateButton } from "./FxRateButton";
import type { SectionProps } from "./types";

/**
 * 코스를 만들기 전에 정해야 하는 견적 기본값. 견적 통화는 AI가 입장료·식대를 이 통화로 만들고,
 * 출발일은 항공 검색과 요일별 영업시간 확인에 쓰인다. 나머지 원가·가격 설정은 코스를 만든 뒤 오른쪽 설정에서 한다.
 */
export function QuickSettingsSection({ input, onChange }: SectionProps) {
  return (
    <SectionCard title="견적 통화 · 출발일" description="코스를 만들 때 금액 단위와 요일 기준으로 쓰입니다" icon={CalendarClock}>
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
          <Field htmlFor="departureDate" label="출발일" hint="비우면 문서에 '미정'으로 표시됩니다">
            <input
              id="departureDate"
              type="date"
              value={input.departureDate}
              onChange={(e) => onChange({ departureDate: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>
        {input.currency !== "KRW" && (
          <>
            <NumberField
              id="exchangeRate"
              label="원화 환율"
              value={input.exchangeRateToKrw}
              prefix="₩"
              hint={`1 ${input.currency} 당`}
              onChange={(exchangeRateToKrw) => onChange({ exchangeRateToKrw })}
            />
            <FxRateButton currency={input.currency} onRate={(exchangeRateToKrw) => onChange({ exchangeRateToKrw })} />
          </>
        )}
      </div>
    </SectionCard>
  );
}
