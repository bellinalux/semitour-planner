import type { TripInput } from "@/types";

/**
 * 환율 변동 — 외화 업체 견적(HKD·USD 등)은 받을 때 환율로 앱 통화 공급가를 만든다.
 * 보낸 뒤 환율이 오르면 같은 외화 요금이 더 비싸져 마진이 줄어드므로(환차손), 지금 환율과 견줘 알리고 다시 계산한다.
 */

/** 이만큼(%) 넘게 바뀌면 알린다 */
export const FX_ALERT_PCT = 2;

export interface FxDrift {
  code: string;
  /** 견적 받을 때 환율 (원문 통화 1 = 앱 통화 몇) */
  quoted: number;
  current: number;
  /** 변화율 % (+면 올라 원가가 늘어남) */
  changePct: number;
  /** 지금 공급가 (1인, 앱 통화)와 지금 환율로 바꾼 공급가 */
  priceThen: number;
  priceNow: number;
  readAt: string;
}

/** 외화 업체 견적이고 환율을 아는 경우에만 */
export function fxDrift(input: TripInput, current: number | null): FxDrift | null {
  const q = input.supplierQuote;
  if (!q || input.pricingMode !== "supplier" || !q.rate || q.rate <= 0 || !current || current <= 0) return null;
  if (q.originalCurrency.toUpperCase() === input.currency) return null;
  const ratio = current / q.rate;
  return {
    code: q.originalCurrency.toUpperCase(),
    quoted: q.rate,
    current,
    changePct: Math.round((ratio - 1) * 1000) / 10,
    priceThen: input.supplierPricePerPerson,
    priceNow: Math.round(input.supplierPricePerPerson * ratio),
    readAt: q.readAt,
  };
}

/** 지금 환율로 업체 공급가·요일별 요금·옵션 요금을 다시 바꾼다 */
export function applyFxPatch(input: TripInput, current: number): Partial<TripInput> {
  const q = input.supplierQuote;
  if (!q || !q.rate || q.rate <= 0 || current <= 0) return {};
  const f = current / q.rate;
  const r = (v: number) => Math.round(v * f);
  return {
    supplierPricePerPerson: r(input.supplierPricePerPerson),
    supplierQuote: {
      ...q,
      rate: current,
      pricePerPerson: r(q.pricePerPerson),
      tiers: q.tiers.map((t) => ({ ...t, pricePerPerson: r(t.pricePerPerson) })),
      singleSupplement: r(q.singleSupplement),
      ...(q.datePrices ? { datePrices: q.datePrices.map((d) => ({ ...d, pricePerPerson: r(d.pricePerPerson) })) } : {}),
      ...(q.picked ? { picked: { ...q.picked, price: r(q.picked.price) } } : {}),
      ...(q.optionPrices ? { optionPrices: q.optionPrices.map((o) => ({ ...o, pricePerPerson: r(o.pricePerPerson) })) } : {}),
    },
  };
}
