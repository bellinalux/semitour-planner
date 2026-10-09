import { Boxes } from "lucide-react";
import { Disclosure } from "@/components/ui/Disclosure";
import { SectionCard } from "@/components/ui/SectionCard";
import type { PackageType } from "@/types";
import { FlightFields } from "./FlightFields";
import { HotelFinder } from "./HotelFinder";
import { LodgingFields } from "./LodgingFields";
import { TravelEstimatePanel } from "./TravelEstimatePanel";
import type { SectionProps } from "./types";

const PACKAGE_SUMMARY: Record<PackageType, string> = {
  land: "랜드만 판매 (숙박·항공 불포함)",
  land_hotel: "랜드 + 숙박",
  full: "풀패키지 (항공·숙박·랜드)",
};

export function PackageSection({
  input,
  onChange,
  stays,
  openSignal,
}: SectionProps & { stays: { city: string; nights: number }[] }) {
  return (
    <SectionCard
      title="숙박 · 항공 원가"
      description="숙박 요금·방 배정(2인 1실)·호텔 찾기·항공료를 넣습니다. 판매 구성은 입력 화면의 '판매 구성 · 견적 방식'에서 고릅니다"
      icon={Boxes}
      collapsible
      nested
      defaultOpen={false}
      anchorId="settings-package"
      openSignal={openSignal}
      summary={PACKAGE_SUMMARY[input.packageType]}
    >
      <div className="space-y-4">
        {input.packageType === "land" ? (
          <p className="text-[11px] leading-4 text-slate-500">
            랜드만 판매하면 숙박과 항공은 견적에 넣지 않고, 고객용 안내에는 &quot;불포함&quot;으로 표시됩니다.
          </p>
        ) : (
          <>
            <LodgingFields input={input} onChange={onChange} stays={stays} />
            <Disclosure label={input.lodgingType === "bnb" ? "숙소 찾기 (웹 검색)" : "호텔 찾기 (웹 검색)"} summary={Object.keys(input.selectedHotels).length > 0 ? `선택한 숙소 ${Object.keys(input.selectedHotels).length}곳` : "지역별로 호텔 후보를 찾아 고릅니다"}>
              <HotelFinder input={input} onChange={onChange} stays={stays} />
            </Disclosure>
            <FlightFields input={input} onChange={onChange} />
            <TravelEstimatePanel input={input} onChange={onChange} />
          </>
        )}
      </div>
    </SectionCard>
  );
}
