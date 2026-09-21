import type { CostKey, TravelEstimate, TripInput } from "@/types";

/** 범위의 중간값을 보기 좋은 단위로 반올림한다 */
export function midpoint(low: number, high: number): number {
  const mid = (low + high) / 2;
  if (mid >= 10000) return Math.round(mid / 1000) * 1000;
  if (mid >= 1000) return Math.round(mid / 100) * 100;
  return Math.round(mid);
}

/**
 * AI 시세 추정을 입력값으로 옮긴다.
 * 사용자가 직접 확정한 금액(확정 + 0이 아님)은 덮어쓰지 않고, 반영한 항목은 "추정"으로 표시한다.
 */
export function estimateToPatch(input: TripInput, estimate: TravelEstimate): { patch: Partial<TripInput>; applied: string[] } {
  const patch: Partial<TripInput> = {};
  const applied: string[] = [];
  const costStatus = { ...input.costStatus };
  const writable = (key: CostKey, current: number) => current === 0 || input.costStatus[key] !== "confirmed";

  if (input.packageType === "full" && writable("flight", input.flightPricePerPerson)) {
    patch.flightPricePerPerson = midpoint(estimate.flight.roundTripLow, estimate.flight.roundTripHigh);
    costStatus.flight = "estimated";
    applied.push("항공료");
  }

  if (input.packageType !== "land" && writable("lodging", input.lodgingRatePerNight)) {
    const [low, high] =
      input.lodgingType === "bnb"
        ? [estimate.lodging.bnbLow, estimate.lodging.bnbHigh]
        : [estimate.lodging.hotelLow, estimate.lodging.hotelHigh];
    patch.lodgingRatePerNight = midpoint(low, high);
    costStatus.lodging = "estimated";
    applied.push("1박 요금");
  }

  if (input.packageType !== "land" && input.cityTaxPerPersonPerNight === 0 && estimate.lodging.cityTaxPerPersonPerNight > 0) {
    patch.cityTaxPerPersonPerNight = estimate.lodging.cityTaxPerPersonPerNight;
    applied.push("숙박세");
  }

  patch.costStatus = costStatus;
  return { patch, applied };
}
