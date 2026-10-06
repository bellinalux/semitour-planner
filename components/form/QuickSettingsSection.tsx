import { Field, inputClass } from "@/components/ui/Field";
import { NumberField } from "@/components/ui/NumberField";
import { SectionCard } from "@/components/ui/SectionCard";
import { CalendarClock } from "lucide-react";
import { CURRENCIES } from "@/lib/currency";
import { TextField } from "@/components/ui/TextField";
import type { CurrencyCode, FlightOption } from "@/types";
import { FlightQuickPick } from "./FlightQuickPick";
import { FxRateButton } from "./FxRateButton";
import type { SectionProps } from "./types";

/** 통화를 바꾸면 오늘 환율을 자동으로 가져온다. 실패하면 조용히 넘어가고 사용자가 직접 입력·조회할 수 있다. */
async function fetchKrwRate(code: CurrencyCode): Promise<number | null> {
  try {
    const res = await fetch(`/api/fx?code=${code}`);
    const data = (await res.json().catch(() => null)) as { krwPerUnit?: number } | null;
    return res.ok && data?.krwPerUnit ? Math.round(data.krwPerUnit * 100) / 100 : null;
  } catch {
    return null;
  }
}

/**
 * 코스를 만들기 전에 정해야 하는 견적 기본값. 견적 통화는 AI가 입장료·식대를 이 통화로 만들고,
 * 출발일은 항공 검색과 요일별 영업시간 확인에 쓰인다. 나머지 원가·가격 설정은 코스를 만든 뒤 오른쪽 설정에서 한다.
 */
export function QuickSettingsSection({ input, onChange, onApplyFlight }: SectionProps & { onApplyFlight: (flight: FlightOption) => void }) {
  const changeCurrency = async (currency: CurrencyCode) => {
    onChange({ currency });
    if (currency === "KRW") return;
    const rate = await fetchKrwRate(currency);
    if (rate) onChange({ exchangeRateToKrw: rate });
  };

  return (
    <SectionCard title="견적 통화 · 출발일 · 항공편" description="통화를 고르면 환율을 자동으로 가져오고, 항공편을 고르면 일수·숙박 수가 맞춰집니다" icon={CalendarClock}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field htmlFor="currency" label="견적 통화">
            <select
              id="currency"
              value={input.currency}
              onChange={(e) => void changeCurrency(e.target.value as CurrencyCode)}
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
        {input.tripScope === "overseas" && (
          <>
            <TextField id="quickOriginCity" label="출발지 (항공)" value={input.originCity} placeholder="예) 인천" onChange={(originCity) => onChange({ originCity })} />
            <FlightQuickPick input={input} onApplyFlight={onApplyFlight} />
          </>
        )}
      </div>
    </SectionCard>
  );
}
