import type { CurrencyCode } from "@/types";

/** 판매가를 올림할 단위 (통화별로 통용되는 가격 끊김) */
const ROUND_UNIT: Partial<Record<CurrencyCode, number>> = {
  KRW: 1000,
  JPY: 100,
  VND: 10000,
  THB: 10,
};

export function roundUnit(currency: CurrencyCode): number {
  return ROUND_UNIT[currency] ?? 1;
}

export function roundUpPrice(value: number, currency: CurrencyCode): number {
  const unit = roundUnit(currency);
  return Math.ceil(value / unit - 1e-9) * unit;
}

export function roundDownPrice(value: number, currency: CurrencyCode): number {
  const unit = roundUnit(currency);
  return Math.floor(value / unit + 1e-9) * unit;
}
