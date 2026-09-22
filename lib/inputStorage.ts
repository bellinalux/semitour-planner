import { DEFAULT_INPUT, TRAVEL_TYPES } from "@/lib/defaults";
import type { TripInput } from "@/types";

const TRAVEL_TYPE_IDS: Set<string> = new Set(TRAVEL_TYPES.map((t) => t.id));

/**
 * 저장된(또는 파일에서 읽은) 입력값을 현재 TripInput 형태로 맞춘다.
 * 이전 버전에 없던 키는 기본값으로 채운다.
 */
export function normalizeInput(saved: unknown): TripInput {
  if (typeof saved !== "object" || saved === null || Array.isArray(saved)) return DEFAULT_INPUT;
  const s = saved as Partial<TripInput>;
  const merged: TripInput = {
    ...DEFAULT_INPUT,
    ...s,
    // 중첩 객체는 이전에 저장된 값에 새 키가 없을 수 있어 기본값과 합친다
    costStatus: { ...DEFAULT_INPUT.costStatus, ...s.costStatus },
    lodgingCityRates:
      typeof s.lodgingCityRates === "object" && s.lodgingCityRates !== null && !Array.isArray(s.lodgingCityRates)
        ? s.lodgingCityRates
        : DEFAULT_INPUT.lodgingCityRates,
    // 이전 버전은 숙소를 하나만(selectedHotel) 저장했다. 그 형태가 남아 있으면 무시하고 빈 값으로 시작한다.
    selectedHotels:
      typeof s.selectedHotels === "object" && s.selectedHotels !== null && !Array.isArray(s.selectedHotels)
        ? s.selectedHotels
        : DEFAULT_INPUT.selectedHotels,
    options: Array.isArray(s.options) ? s.options : DEFAULT_INPUT.options,
    travelAlert: typeof s.travelAlert === "object" && s.travelAlert !== null ? s.travelAlert : null,
    travelType: typeof s.travelType === "string" && TRAVEL_TYPE_IDS.has(s.travelType) ? s.travelType : DEFAULT_INPUT.travelType,
    regionPlan: typeof s.regionPlan === "string" ? s.regionPlan : DEFAULT_INPUT.regionPlan,
    pickupNote: typeof s.pickupNote === "string" ? s.pickupNote : DEFAULT_INPUT.pickupNote,
    sendingNote: typeof s.sendingNote === "string" ? s.sendingNote : DEFAULT_INPUT.sendingNote,
    breakfastIncluded: typeof s.breakfastIncluded === "boolean" ? s.breakfastIncluded : DEFAULT_INPUT.breakfastIncluded,
    travelerNames: Array.isArray(s.travelerNames) ? s.travelerNames.filter((n): n is string => typeof n === "string") : DEFAULT_INPUT.travelerNames,
    competitors: Array.isArray(s.competitors)
      ? s.competitors.map((c) => ({ ...c, shopping: c.shopping ?? "unknown", optionTour: c.optionTour ?? "unknown" }))
      : DEFAULT_INPUT.competitors,
    themes: Array.isArray(s.themes) ? s.themes : DEFAULT_INPUT.themes,
  };
  // 박수가 없던 이전 저장값은 "일수 − 1"로 채운다
  if (s.nights === undefined) merged.nights = Math.max(0, merged.days - 1);
  return merged;
}
