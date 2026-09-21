import type { CurrencyCode } from "@/types";

export const CURRENCIES: { code: CurrencyCode; name: string; symbol: string }[] = [
  { code: "KRW", name: "한국 원", symbol: "₩" },
  { code: "USD", name: "미국 달러", symbol: "$" },
  { code: "EUR", name: "유로", symbol: "€" },
  { code: "JPY", name: "일본 엔", symbol: "¥" },
  { code: "GBP", name: "영국 파운드", symbol: "£" },
  { code: "CNY", name: "중국 위안", symbol: "CN¥" },
  { code: "THB", name: "태국 바트", symbol: "฿" },
  { code: "VND", name: "베트남 동", symbol: "₫" },
  { code: "SGD", name: "싱가포르 달러", symbol: "S$" },
  { code: "AUD", name: "호주 달러", symbol: "A$" },
];

const ZERO_DECIMAL: CurrencyCode[] = ["KRW", "JPY", "VND"];

export function currencySymbol(code: CurrencyCode): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}

export function formatMoney(value: number, code: CurrencyCode): string {
  const digits = ZERO_DECIMAL.includes(code) ? 0 : 2;
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: code,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}
