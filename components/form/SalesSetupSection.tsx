import { Store } from "lucide-react";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { SectionCard } from "@/components/ui/SectionCard";
import { tourDayCount } from "@/lib/itinerary";
import { HOTEL_GRADES } from "@/lib/itemTypes";
import type { FlightOption, HotelGrade, LodgingType, PackageType } from "@/types";
import { FlightQuickPick } from "./FlightQuickPick";
import { PackageTypeSwitch } from "./PackageTypeSwitch";
import type { SectionProps } from "./types";

const LODGING: { id: LodgingType; label: string }[] = [
  { id: "hotel", label: "호텔" },
  { id: "resort", label: "리조트" },
  { id: "bnb", label: "BnB·아파트" },
];

const PACKAGE_LABELS: Record<PackageType, string> = { land: "랜드만", land_hotel: "랜드 + 숙박", full: "풀패키지 (항공 포함)" };

/** 항공까지 파는 풀패키지는 첫날·마지막 날이 이동일이므로 일정 구조도 함께 맞춘다 */
export const packagePatch = (packageType: PackageType) => (packageType === "full" ? { packageType, includesFlights: true } : { packageType });

/**
 * 폴더 2. 상품 구성 — 무엇을 묶어 팔지(랜드·숙박·항공), 숙소 종류·등급, 항공 이동일과 항공편.
 * 자동 구성이 이 값으로 숙소를 찾으므로 코스를 만들기 전에 정한다. 숙소 종류·등급·항공편은 여기서만 고른다.
 */
export function SalesSetupSection({ input, onChange, onApplyFlight }: SectionProps & { onApplyFlight: (flight: FlightOption) => void }) {
  const hasLodging = input.packageType !== "land";
  const overseas = input.tripScope === "overseas";
  // 등급 무관이면 요약에 등급을 쓰지 않는다
  const grade = input.hotelGrade === "any" ? "" : (HOTEL_GRADES.find((g) => g.id === input.hotelGrade)?.label ?? "");
  const summary = [
    PACKAGE_LABELS[input.packageType],
    hasLodging ? `${LODGING.find((l) => l.id === input.lodgingType)?.label}${input.lodgingType !== "bnb" && grade ? ` ${grade}` : ""}` : "",
    input.selectedFlight ? `항공편 ${input.selectedFlight.airline || "선택됨"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <SectionCard
      title="2. 상품 구성"
      description="무엇을 묶어 팔지와 숙소·항공을 고릅니다 (1인 요금은 2인 1실 기준)"
      icon={Store}
      collapsible
      summary={summary}
    >
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

        {overseas && input.mode !== "paste" && (
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <input
              type="checkbox"
              checked={input.includesFlights}
              onChange={(e) => onChange({ includesFlights: e.target.checked })}
              className="mt-0.5 size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>
              <span className="block text-xs font-medium text-slate-800">항공 이동일 포함 (해외 패키지)</span>
              <span className="mt-0.5 block text-pretty text-[11px] leading-4 text-slate-500">
                첫날(출발·도착)과 마지막 날(귀국)은 이동일로 두고, 그 사이 {tourDayCount(input)}일만 AI가 관광 일정을 만듭니다.
                {input.includesFlights && input.days < 3 && <span className="font-medium text-red-600"> 총 일수는 3일 이상이어야 합니다.</span>}
              </span>
            </span>
          </label>
        )}

        {overseas && <FlightQuickPick input={input} onApplyFlight={onApplyFlight} />}
      </div>
    </SectionCard>
  );
}
