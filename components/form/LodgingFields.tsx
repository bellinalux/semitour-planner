import { NumberField } from "@/components/ui/NumberField";
import { lodgingRoomsFor } from "@/lib/cost";
import { currencySymbol } from "@/lib/currency";
import type { LodgingType, OddRoomPolicy } from "@/types";
import { CostField } from "./CostField";
import { HotelWebSearchPanel } from "./HotelWebSearchPanel";
import type { SectionProps } from "./types";

interface Props extends SectionProps {
  /** 일정에서 센 도시별 숙박 수. 2곳 이상이면 도시별 요금을 입력할 수 있다 */
  stays: { city: string; nights: number }[];
}

const ODD_POLICIES: { id: OddRoomPolicy; label: string; hint: string }[] = [
  { id: "single", label: "싱글차지 따로", hint: "남는 1명은 1인실, 추가요금을 그 사람에게" },
  { id: "triple", label: "3인 1실", hint: "엑스트라베드 요금을 원가에" },
  { id: "share", label: "모두 나눠 반영", hint: "남는 방값을 전체 1인 요금에" },
];

const TYPES: { id: LodgingType; label: string }[] = [
  { id: "hotel", label: "호텔" },
  { id: "resort", label: "리조트" },
  { id: "bnb", label: "BnB·아파트" },
];

export function LodgingFields({ input, onChange, stays }: Props) {
  const symbol = currencySymbol(input.currency);
  const isBnb = input.lodgingType === "bnb";
  const unitLabel = isBnb ? "유닛" : "실";
  const rooms = lodgingRoomsFor(input.travelers, input);
  const odd = !isBnb && input.guestsPerUnit >= 2 && input.travelers % Math.round(input.guestsPerUnit) !== 0;

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-700">숙박 ({input.nights}박)</span>
        <div role="radiogroup" aria-label="숙소 유형" className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white">
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={input.lodgingType === t.id}
              onClick={() =>
                // 유형을 바꾸면 1실당 인원 기본값도 함께 바꾼다 (호텔 2인, BnB 4인)
                onChange({ lodgingType: t.id, guestsPerUnit: t.id === "bnb" ? 4 : 2 })
              }
              className={`px-2.5 py-1 text-[11px] font-medium ${
                input.lodgingType === t.id ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-600">
        <input
          type="checkbox"
          checked={input.breakfastIncluded}
          onChange={(e) => onChange({ breakfastIncluded: e.target.checked })}
          className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        />
        숙박 다음날 호텔 조식 포함 (일정표의 &quot;조식&quot; 표시에 반영됩니다)
      </label>

      <div className="grid grid-cols-2 gap-3">
        <CostField
          id="lodgingRatePerNight"
          label={`1${unitLabel} 1박 요금`}
          costKey="lodging"
          input={input}
          value={input.lodgingRatePerNight}
          prefix={symbol}
          onValueChange={(lodgingRatePerNight) => onChange({ lodgingRatePerNight })}
          onChange={onChange}
        />
        <NumberField
          id="guestsPerUnit"
          label={`1${unitLabel}당 인원`}
          value={input.guestsPerUnit}
          min={1}
          max={20}
          step={1}
          suffix="명"
          hint={`예상 ${input.travelers}명 → ${rooms.bookedRooms}${unitLabel}${rooms.singles > 0 ? ` (1인실 ${rooms.singles})` : ""}${rooms.extraBeds > 0 ? ` (3인 1실 ${rooms.extraBeds})` : ""}${isBnb ? "" : " · 1인 요금은 2인 1실 기준"}`}
          onChange={(guestsPerUnit) => onChange({ guestsPerUnit })}
        />
        {isBnb && (
          <NumberField
            id="cleaningFeePerUnit"
            label="청소비 (유닛당 1회)"
            value={input.cleaningFeePerUnit}
            prefix={symbol}
            onChange={(cleaningFeePerUnit) => onChange({ cleaningFeePerUnit })}
          />
        )}
        <NumberField
          id="cityTaxPerPersonPerNight"
          label="숙박세 (1인 1박)"
          value={input.cityTaxPerPersonPerNight}
          prefix={symbol}
          hint="없으면 0"
          onChange={(cityTaxPerPersonPerNight) => onChange({ cityTaxPerPersonPerNight })}
        />
      </div>

      {!isBnb && input.guestsPerUnit >= 2 && (
        <div className="space-y-1.5">
          <span className="text-[11px] font-medium text-slate-600">
            홀수 인원으로 남는 방 {odd ? <span className="text-amber-700">(지금 {input.travelers}명 — 1명 남음)</span> : <span className="text-slate-400">(지금은 짝수)</span>}
          </span>
          <div role="radiogroup" aria-label="홀수 인원 방 처리" className="grid grid-cols-3 gap-1.5">
            {ODD_POLICIES.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={input.oddRoomPolicy === p.id}
                onClick={() => onChange({ oddRoomPolicy: p.id })}
                title={p.hint}
                className={`rounded-md border px-2 py-1.5 text-left text-[11px] leading-4 ${
                  input.oddRoomPolicy === p.id ? "border-indigo-500 bg-indigo-50 font-semibold text-indigo-800" : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300"
                }`}
              >
                {p.label}
                <span className="block text-[10px] font-normal text-slate-500">{p.hint}</span>
              </button>
            ))}
          </div>
          {input.oddRoomPolicy === "triple" && (
            <NumberField
              id="extraBedPerNight"
              label="엑스트라베드 1박 요금"
              value={input.extraBedPerNight}
              prefix={symbol}
              hint="호텔마다 다릅니다. 0이면 반영하지 않습니다"
              onChange={(extraBedPerNight) => onChange({ extraBedPerNight })}
            />
          )}
        </div>
      )}

      <HotelWebSearchPanel input={input} onChange={onChange} />

      {stays.length >= 2 && (
        <div className="space-y-2 border-t border-slate-200 pt-3">
          <p className="text-xs font-semibold text-slate-700">도시별 1{unitLabel} 1박 요금</p>
          <p className="text-[11px] leading-4 text-slate-500">
            도시마다 숙박 요금이 다르면 입력하세요. 비워 두거나 0이면 위의 기본 요금을 씁니다.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {stays.map((stay, i) => (
              <NumberField
                key={stay.city}
                id={`lodgingCityRate-${i}`}
                label={`${stay.city} (${stay.nights}박)`}
                value={input.lodgingCityRates[stay.city] ?? 0}
                prefix={symbol}
                onChange={(rate) => onChange({ lodgingCityRates: { ...input.lodgingCityRates, [stay.city]: rate } })}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
