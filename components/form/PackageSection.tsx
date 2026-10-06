import { Boxes } from "lucide-react";
import { Disclosure } from "@/components/ui/Disclosure";
import { SectionCard } from "@/components/ui/SectionCard";
import type { FlightOption, PackageType } from "@/types";
import { FlightFields } from "./FlightFields";
import { HotelFinder } from "./HotelFinder";
import { LodgingFields } from "./LodgingFields";
import { PackageTypeSwitch } from "./PackageTypeSwitch";
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
  onApplyFlight,
  openSignal,
}: SectionProps & { stays: { city: string; nights: number }[]; onApplyFlight: (flight: FlightOption) => void }) {
  // 항공까지 파는 풀패키지는 첫날/마지막 날이 이동일이므로 일정 구조도 함께 맞춘다
  const changePackage = (packageType: PackageType) =>
    onChange(packageType === "full" ? { packageType, includesFlights: true } : { packageType });

  return (
    <SectionCard
      title="패키지 구성 · 숙박 · 항공"
      description="무엇을 묶어서 파는지 정하고, 숙박·항공 원가를 넣습니다"
      icon={Boxes}
      collapsible
      defaultOpen={false}
      anchorId="settings-package"
      openSignal={openSignal}
      summary={PACKAGE_SUMMARY[input.packageType]}
    >
      <div className="space-y-4">
        <PackageTypeSwitch value={input.packageType} onChange={changePackage} />

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
            <FlightFields input={input} onChange={onChange} onApplyFlight={onApplyFlight} />
            <TravelEstimatePanel input={input} onChange={onChange} />
          </>
        )}
      </div>
    </SectionCard>
  );
}
