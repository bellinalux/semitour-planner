/**
 * 환율을 조회할 수 있는 통화 — 견적 통화(앱에서 고르는 통화)에 더해, 업체 견적서에 자주 나오는 통화(홍콩·마카오·대만·필리핀 등)도 받는다.
 * 업체 견적 금액을 견적 통화로 바꿀 때 쓴다.
 */
export const FX_CODES = new Set([
  "KRW",
  "USD",
  "EUR",
  "JPY",
  "GBP",
  "CNY",
  "THB",
  "VND",
  "SGD",
  "AUD",
  "HKD",
  "MOP",
  "TWD",
  "PHP",
  "MYR",
  "IDR",
  "NZD",
  "CAD",
  "CHF",
  "INR",
  "AED",
  "MNT",
  "LAK",
  "KHR",
]);
