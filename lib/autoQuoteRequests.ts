import { vehicleClassFor } from "@/lib/autoBuild";
import { quoteItemState } from "@/lib/supplierQuote";
import type { TripInput } from "@/types";

/**
 * 자동 견적이 서버에 보내는 조사 요청. 미리 조회(코스를 만드는 동안 시세를 먼저 받아 두기)와
 * 자동 견적이 똑같은 요청을 보내야 서버 캐시를 그대로 다시 쓸 수 있어 한곳에서 만든다.
 */
export function groundRequest(input: TripInput) {
  return {
    destination: input.destination.trim(),
    travelers: Math.min(60, Math.max(1, input.travelers)),
    currency: input.currency,
    tripScope: input.tripScope,
    vehicleClass: vehicleClassFor(input.travelers),
    days: Math.min(60, Math.max(1, input.days)),
  };
}

export function travelRequest(input: TripInput) {
  return {
    origin: input.originCity.trim() || "인천",
    destination: input.destination.trim(),
    currency: input.currency,
    nights: input.nights,
    hotelGrade: input.hotelGrade,
  };
}

/** 숙박 요금이 비어 있어 시세가 필요한지 */
export const needsLodging = (input: TripInput) => input.packageType !== "land" && input.lodgingRatePerNight === 0 && !Object.values(input.lodgingCityRates).some((v) => v > 0);
/** 항공료가 비어 있어 시세가 필요한지 */
export const needsFlight = (input: TripInput) => input.packageType === "full" && input.flightPricePerPerson === 0;
/** 차량·가이드 요금이 비어 있는지 */
export const needsGround = (input: TripInput) => input.vehicleCostPerDay + input.guideCostPerDay === 0;
/** 가이드·기사 팁이 비어 있고 넣을 만한지 — 국내 여행이거나, 업체 견적서가 팁을 포함·불포함으로 따로 적었으면(현지 지불) 넣지 않는다 */
export const needsTip = (input: TripInput) =>
  input.tipPerPerson === 0 &&
  input.tripScope !== "domestic" &&
  !(input.supplierQuote && quoteItemState(input.supplierQuote, "tip").state !== "missing");
/** 여행자보험이 비어 있는지 — 업체 견적서에 보험 포함이면 넣지 않는다 */
export const needsInsurance = (input: TripInput) =>
  input.insurancePerPerson === 0 && !(input.supplierQuote && quoteItemState(input.supplierQuote, "insurance").state === "included");

/**
 * 코스를 만드는 동안(1분 남짓) 비어 있는 차량·가이드·숙박·항공 시세를 미리 조회해 서버 캐시에 넣어 둔다.
 * 결과는 쓰지 않는다 — 나중에 자동 견적이 같은 요청을 보내면 캐시에서 바로 받는다. 실패해도 조용히 넘어간다.
 */
export function prewarmEstimates(input: TripInput): void {
  if (!input.destination.trim()) return;
  const post = (url: string, body: unknown) =>
    void fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => undefined);
  if (needsGround(input) || needsTip(input) || needsInsurance(input)) post("/api/estimate-ground", groundRequest(input));
  if (needsLodging(input) || needsFlight(input)) post("/api/estimate-travel", travelRequest(input));
}
