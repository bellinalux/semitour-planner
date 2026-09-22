import { Boxes } from "lucide-react";
import { SectionCard } from "@/components/ui/SectionCard";
import type { PackageType } from "@/types";
import { FlightFields } from "./FlightFields";
import { HotelFinder } from "./HotelFinder";
import { LodgingFields } from "./LodgingFields";
import { PackageTypeSwitch } from "./PackageTypeSwitch";
import { TravelEstimatePanel } from "./TravelEstimatePanel";
import type { SectionProps } from "./types";

export function PackageSection({ input, onChange, stays }: SectionProps & { stays: { city: string; nights: number }[] }) {
  // 항공까지 파는 풀패키지는 첫날/마지막 날이 이동일이므로 일정 구조도 함께 맞춘다
  const changePackage = (packageType: PackageType) =>
    onChange(packageType === "full" ? { packageType, includesFlights: true } : { packageType });

  return (
    <SectionCard
      title="패키지 구성 · 숙박 · 항공"
      description="무엇을 묶어서 파는지 정하고, 숙박·항공 원가를 넣습니다"
      icon={Boxes}
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
            <HotelFinder input={input} onChange={onChange} />
            <FlightFields input={input} onChange={onChange} />
            <TravelEstimatePanel input={input} onChange={onChange} />
          </>
        )}
      </div>
    </SectionCard>
  );
}
