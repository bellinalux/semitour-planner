import type { PriceScenarioSnapshot, QuoteData, TripInput } from "@/types";

/** 가격안을 저장·복원할 때 다루는 입력 항목. 일정(기간·도시)은 건드리지 않고 가격에 영향을 주는 값만 담는다. */
const SNAPSHOT_KEYS = [
  "travelers",
  "targetMarginRate",
  "minMarginRate",
  "contingencyRate",
  "cardFeeRate",
  "pricingMode",
  "fixedPricePerPerson",
  "packageType",
  "vehicleCostPerDay",
  "guideCostPerDay",
  "otherFixedCost",
  "groundDaysOverride",
  "lodgingType",
  "lodgingRatePerNight",
  "lodgingCityRates",
  "guestsPerUnit",
  "cleaningFeePerUnit",
  "cityTaxPerPersonPerNight",
  "flightPricePerPerson",
  "tipPerPerson",
  "insurancePerPerson",
  "exchangeRateToKrw",
  "fxBufferRate",
  "channels",
  "channelPriceMode",
] as const satisfies readonly (keyof TripInput)[];

/** 지금 입력과 계산 결과를 이름을 붙여 저장할 가격안으로 만든다 */
export function makeSnapshot(name: string, input: TripInput, quote: QuoteData): PriceScenarioSnapshot {
  const inputs: Record<string, unknown> = {};
  for (const key of SNAPSHOT_KEYS) inputs[key] = structuredClone(input[key]);
  return {
    id: crypto.randomUUID(),
    name: name.trim() || "가격안",
    savedAt: new Date().toISOString(),
    inputs: inputs as Partial<TripInput>,
    summary: {
      travelers: quote.travelers,
      pricePerPerson: quote.scenario.pricePerPerson,
      totalPrice: quote.scenario.totalPrice,
      costPerPerson: quote.scenario.costPerPerson,
      profit: quote.scenario.profit,
      marginRate: quote.scenario.actualMarginRate,
      breakEvenTravelers: quote.breakEvenTravelers,
      currency: input.currency,
    },
  };
}

/** 저장한 가격안의 입력값을 되돌릴 패치 */
export function snapshotPatch(snapshot: PriceScenarioSnapshot): Partial<TripInput> {
  return structuredClone(snapshot.inputs);
}
