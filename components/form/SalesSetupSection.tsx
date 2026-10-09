import { Store } from "lucide-react";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { SectionCard } from "@/components/ui/SectionCard";
import { HOTEL_GRADES } from "@/lib/itemTypes";
import type { HotelGrade, LodgingType, PackageType } from "@/types";
import { PackageTypeSwitch } from "./PackageTypeSwitch";
import { PriceStartFields } from "./PriceStartFields";
import type { SectionProps } from "./types";

const LODGING: { id: LodgingType; label: string }[] = [
  { id: "hotel", label: "호텔" },
  { id: "resort", label: "리조트" },
  { id: "bnb", label: "BnB·아파트" },
];

/** 항공까지 파는 풀패키지는 첫날·마지막 날이 이동일이므로 일정 구조도 함께 맞춘다 */
export const packagePatch = (packageType: PackageType) => (packageType === "full" ? { packageType, includesFlights: true } : { packageType });

/**
 * 입력 화면의 "무엇을, 어떤 가격 기준으로 팔지" — 판매 구성(랜드·숙박·항공), 숙소 종류·등급, 견적 시작 방법(원가·판매가·B2B·공급가).
 * 자동 구성이 이 값으로 숙소를 찾고 예산을 나누므로 코스를 만들기 전에 정한다.
 */
export function SalesSetupSection({ input, onChange }: SectionProps) {
  const hasLodging = input.packageType !== "land";
  return (
    <SectionCard title="판매 구성 · 견적 방식" description="무엇을 묶어 팔지, 가격을 어디서부터 정할지 고릅니다 (1인 요금은 2인 1실 기준)" icon={Store}>
      <div className="space-y-4">
        <PackageTypeSwitch value={input.packageType} onChange={(packageType) => onChange(packagePatch(packageType))} />

        {hasLodging && (
          <div className="flex flex-wrap items-end gap-3">
            <ChoiceGroup
              name="salesLodgingType"
              label="숙소 종류"
              variant="segmented"
              value={input.lodgingType}
              options={LODGING}
              onChange={(lodgingType) => onChange({ lodgingType, guestsPerUnit: lodgingType === "bnb" ? 4 : 2 })}
            />
            {input.lodgingType !== "bnb" && (
              <label className="grid gap-1 text-[11px] text-slate-500">
                등급
                <select
                  value={input.hotelGrade}
                  onChange={(e) => onChange({ hotelGrade: e.target.value as HotelGrade })}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900"
                >
                  {HOTEL_GRADES.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

        <PriceStartFields input={input} onChange={onChange} />
      </div>
    </SectionCard>
  );
}
