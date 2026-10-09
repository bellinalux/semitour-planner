import { Percent } from "lucide-react";
import { Disclosure } from "@/components/ui/Disclosure";
import { NumberField } from "@/components/ui/NumberField";
import { SectionCard } from "@/components/ui/SectionCard";
import { priceIsGiven } from "@/lib/channels";
import { PRICE_START_MODES, PriceStartFields } from "./PriceStartFields";
import type { SectionProps } from "./types";

export function PricingSection({ input, onChange, openSignal }: SectionProps) {
  const isFixed = priceIsGiven(input.pricingMode);
  const mode = PRICE_START_MODES.find((m) => m.id === input.pricingMode);

  return (
    <SectionCard
      title="가격 정책"
      description="견적 시작 방법(원가·판매가·B2B 도매가·랜드사 공급가)과 회사 수익·수수료를 정합니다. 모든 1인 가격은 2인 1실 기준"
      icon={Percent}
      collapsible
      defaultOpen={false}
      anchorId="settings-pricing"
      openSignal={openSignal}
      summary={`${mode?.label ?? ""} · 회사 수익 ${input.targetMarginRate}% · 카드 수수료 ${input.cardFeeRate}%`}
    >
      <div className="space-y-4">
        <PriceStartFields input={input} onChange={onChange} />

        <NumberField
          id="targetMarginRate"
          label={isFixed ? "회사 수익 (판매가 대비 %)" : "목표 마진율 (판매가 대비)"}
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
            hint="판매가 대비 (직판)"
            onChange={(cardFeeRate) => onChange({ cardFeeRate })}
          />
        </div>

        {input.currency !== "KRW" && (
          <NumberField
            id="fxBufferRate"
            label="환율 변동 버퍼"
            value={input.fxBufferRate}
            suffix="%"
            max={30}
            hint="현지 통화 원가를 원화로 파는 상품은 환율이 오르면 마진이 줄어듭니다. 원가에 이 비율을 미리 더합니다 (0이면 반영 안 함)"
            onChange={(fxBufferRate) => onChange({ fxBufferRate })}
          />
        )}

        <Disclosure
          label="아동·유아 요금"
          summary={
            input.childCount + input.childNoBedCount + input.infantCount > 0
              ? `아동 ${input.childCount}명 · 노베드 아동 ${input.childNoBedCount}명 · 유아 ${input.infantCount}명`
              : "아동·유아가 있을 때만 펼쳐서 입력"
          }
          defaultOpen={input.childCount + input.childNoBedCount + input.infantCount > 0}
        >
          <p className="text-[11px] leading-4 text-slate-500">
            성인 요금 대비 비율입니다. 상품·항공사·숙소 정책에 따라 다르니 판매 조건에 맞게 고치세요. 인원을 넣으면 견적서에서 구성별 총액과 이익을 계산합니다.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              id="childPriceRate"
              label="아동 요금 (침대 사용)"
              value={input.childPriceRate}
              suffix="%"
              max={100}
              hint="성인 요금 대비"
              onChange={(childPriceRate) => onChange({ childPriceRate })}
            />
            <NumberField
              id="childNoBedPriceRate"
              label="아동 요금 (노베드)"
              value={input.childNoBedPriceRate}
              suffix="%"
              max={100}
              hint="침대 없이 부모와 같은 방"
              onChange={(childNoBedPriceRate) => onChange({ childNoBedPriceRate })}
            />
            <NumberField
              id="infantPriceRate"
              label="유아 요금"
              value={input.infantPriceRate}
              suffix="%"
              max={100}
              hint="성인 요금 대비"
              onChange={(infantPriceRate) => onChange({ infantPriceRate })}
            />
            <NumberField
              id="childCount"
              label="아동 인원 (침대 사용)"
              value={input.childCount}
              suffix="명"
              step={1}
              max={Math.max(0, input.travelers)}
              hint="예상 인원에 포함"
              onChange={(childCount) => onChange({ childCount })}
            />
            <NumberField
              id="childNoBedCount"
              label="아동 인원 (노베드)"
              value={input.childNoBedCount}
              suffix="명"
              step={1}
              max={Math.max(0, input.travelers - input.childCount)}
              hint="예상 인원에 포함, 방 인원에서 빠짐"
              onChange={(childNoBedCount) => onChange({ childNoBedCount })}
            />
            <NumberField
              id="infantCount"
              label="유아 인원"
              value={input.infantCount}
              suffix="명"
              step={1}
              max={20}
              hint="예상 인원과 별도 (좌석·식사·숙박 원가 없음으로 계산)"
              onChange={(infantCount) => onChange({ infantCount })}
            />
          </div>
        </Disclosure>
      </div>
    </SectionCard>
  );
}
