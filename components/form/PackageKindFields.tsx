"use client";

import { Field } from "@/components/ui/Field";
import { OPERATING_MODELS, PRODUCT_TIERS } from "@/lib/packageRules";
import type { OperatingModel, TripInput } from "@/types";

/** 운영 방식에 맞는 '일반 고객' 여행 유형 — 세미·배낭·에어텔은 세미투어, 나머지는 패키지투어 */
export const generalTravelType = (m: OperatingModel): TripInput["travelType"] => (m === "semi" || m === "backpack" || m === "airtel" ? "semi" : "package");

/**
 * 상품 구성 — 패키지 규칙표의 두 축 (① 운영 방식 ② 등급). 고객 유형(시니어·신혼 등)은 상세 조건에서.
 * 고른 값으로 AI 일정 지시문·일정 카드 점검·상품 규칙 점검이 달라진다.
 */
export function PackageKindFields({ input, onChange }: { input: TripInput; onChange: (patch: Partial<TripInput>) => void }) {
  const general = input.travelType === "semi" || input.travelType === "package";
  const card = (on: boolean) => `rounded-md border px-2.5 py-1.5 text-left transition-colors ${on ? "border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600" : "border-slate-200 bg-white hover:border-indigo-300"}`;
  return (
    <div className="space-y-3">
      <Field htmlFor="operatingModel" label="운영 방식" hint="가이드·차량이 얼마나 붙는지 — 하루 구성·미팅·자유시간 기준이 달라집니다">
        <div id="operatingModel" role="radiogroup" aria-label="운영 방식" className="grid grid-cols-2 gap-1.5">
          {OPERATING_MODELS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={input.operatingModel === m.id}
              title={m.hint}
              onClick={() => onChange({ operatingModel: m.id, ...(general ? { travelType: generalTravelType(m.id) } : {}) })}
              className={card(input.operatingModel === m.id)}
            >
              <span className="block text-xs font-semibold text-slate-800">{m.label}</span>
              <span className="mt-0.5 line-clamp-2 block text-pretty text-[10.5px] leading-4 text-slate-500">{m.hint}</span>
            </button>
          ))}
        </div>
      </Field>
      {input.operatingModel !== "airtel" && (
        <Field htmlFor="productTier" label="상품 등급" hint="쇼핑·선택관광·가이드 경비, 호텔·특식·연박, 일정 여유가 달라집니다 (대형 여행사 등급 기준)">
          <div id="productTier" role="radiogroup" aria-label="상품 등급" className="grid grid-cols-2 gap-1.5">
            {PRODUCT_TIERS.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={input.productTier === t.id} title={t.hint} onClick={() => onChange({ productTier: t.id })} className={card(input.productTier === t.id)}>
                <span className="block text-xs font-semibold text-slate-800">{t.label}</span>
                <span className="mt-0.5 line-clamp-2 block text-pretty text-[10.5px] leading-4 text-slate-500">{t.hint}</span>
              </button>
            ))}
          </div>
        </Field>
      )}
    </div>
  );
}
