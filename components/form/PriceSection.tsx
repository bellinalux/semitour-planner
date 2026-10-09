"use client";

import { BadgePercent, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useSession } from "@/components/SessionContext";
import { Field, inputClass } from "@/components/ui/Field";
import { NumberField } from "@/components/ui/NumberField";
import { SectionCard } from "@/components/ui/SectionCard";
import { CURRENCIES } from "@/lib/currency";
import { clearPricingDefaults, DEFAULT_LABELS, pricingDefaultsSavedAt, savePricingDefaults } from "@/lib/pricingDefaults";
import type { CurrencyCode, TripInput } from "@/types";
import { FxRateButton } from "./FxRateButton";
import { PRICE_START_MODES, PriceStartFields } from "./PriceStartFields";
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

/** 지금 가격 설정을 회사 기본값으로 저장해, 새 견적·초기화 때 자동으로 들어가게 한다 (이 브라우저에 저장, 관리자만) */
function DefaultsBar({ input }: { input: TripInput }) {
  const { isAdmin } = useSession();
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    // 저장 시각은 브라우저 저장소에서만 읽을 수 있어 마운트 뒤에 가져온다
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 외부 저장소(localStorage) 값을 처음 한 번 동기화
    setSavedAt(pricingDefaultsSavedAt());
    setLoaded(true);
  }, []);

  return (
    <div className="space-y-1.5 border-t border-slate-100 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!isAdmin}
          title={isAdmin ? undefined : "관리자만 회사 기본값을 바꿀 수 있습니다"}
          onClick={() => {
            savePricingDefaults(input);
            setSavedAt(new Date().toISOString());
          }}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="size-3.5" aria-hidden />
          지금 설정을 회사 기본값으로 저장
        </button>
        {loaded && savedAt && isAdmin && (
          <button
            type="button"
            onClick={() => {
              clearPricingDefaults();
              setSavedAt(null);
            }}
            className="text-[11px] text-slate-500 underline underline-offset-2 hover:text-slate-700"
          >
            기본값 지우기
          </button>
        )}
      </div>
      <p className="text-pretty text-[11px] leading-4 text-slate-500">
        {loaded && savedAt ? `기본값 저장됨 (${savedAt.slice(0, 10)}). ` : ""}
        {DEFAULT_LABELS}을 새 견적과 초기화 때 자동으로 넣습니다.
        {!isAdmin && " 회사 기본값은 관리자만 바꿀 수 있습니다."}
      </p>
    </div>
  );
}

/** 폴더 3. 가격 방식 — 견적 통화, 견적 시작 방법과 그 가격, 판매 플랫폼, 회사 수익률 */
export function PriceSection({ input, onChange, openSignal }: SectionProps) {
  const mode = PRICE_START_MODES.find((m) => m.id === input.pricingMode);
  const changeCurrency = async (currency: CurrencyCode) => {
    onChange({ currency });
    if (currency === "KRW") return;
    const rate = await fetchKrwRate(currency);
    if (rate) onChange({ exchangeRateToKrw: rate });
  };

  return (
    <SectionCard
      title="3. 가격 방식"
      description="가격을 어디서부터 정할지와 회사 수익률을 정합니다. 모르면 '가격 모름 · 자동 견적' 그대로 두세요"
      icon={BadgePercent}
      collapsible
      anchorId="settings-pricing"
      openSignal={openSignal}
      summary={`${mode?.label ?? ""} · 회사 수익 ${input.targetMarginRate}% · ${input.currency}`}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field htmlFor="currency" label="견적 통화">
            <select id="currency" value={input.currency} onChange={(e) => void changeCurrency(e.target.value as CurrencyCode)} className={inputClass}>
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
        {input.currency !== "KRW" && <FxRateButton currency={input.currency} onRate={(exchangeRateToKrw) => onChange({ exchangeRateToKrw })} />}

        <PriceStartFields input={input} onChange={onChange} />
        <DefaultsBar input={input} />
      </div>
    </SectionCard>
  );
}
