import type { ParsedSupplierQuote } from "@/lib/schemas/course";
import type { CurrencyCode, SupplierQuote, TripInput } from "@/types";

/**
 * 업체 견적서에서 읽은 금액을 앱 통화로 바꾸고, 지금 인원에 맞는 1인 요금을 고른다.
 * 통화를 바꾸지 못하면(환율 조회 실패·모르는 통화) 원문 금액을 그대로 두고 1인 요금은 0으로 둔다 — 사람이 직접 넣는다.
 */

const SUPPORTED = new Set(["KRW", "USD", "EUR", "JPY", "GBP", "CNY", "THB", "VND", "SGD", "AUD"]);

/** 원문 통화 1 = 앱 통화 몇. krwPerUnit은 "1 단위가 몇 원"을 돌려준다 (KRW는 1) */
export async function conversionRate(from: string, to: CurrencyCode, krwPerUnit: (code: string) => Promise<number | null>): Promise<number | null> {
  const src = from || to;
  if (src === to) return 1;
  if (!SUPPORTED.has(src)) return null;
  const [a, b] = await Promise.all([src === "KRW" ? 1 : krwPerUnit(src), to === "KRW" ? 1 : krwPerUnit(to)]);
  return a && b ? a / b : null;
}

export function toAppQuote(raw: ParsedSupplierQuote, rate: number | null, readAt: string): SupplierQuote {
  const conv = (v: number) => (rate === null ? v : v * rate);
  return {
    originalPrice: raw.pricePerPerson,
    originalCurrency: raw.currency,
    rate,
    pricePerPerson: rate === null ? 0 : raw.pricePerPerson * rate,
    basisTravelers: raw.basisTravelers,
    roomBasis: raw.roomBasis,
    singleSupplement: conv(raw.singleSupplement),
    tiers: raw.tiers.map((t) => ({ travelers: t.travelers, pricePerPerson: conv(t.pricePerPerson) })),
    lines: raw.lines.map((l) => ({ ...l, amount: conv(l.amount) })),
    includes: raw.includes,
    excludes: raw.excludes,
    shopping: raw.shopping,
    options: raw.options,
    notes: raw.notes,
    readAt,
  };
}

/** 지금 인원에 맞는 1인 요금 — 인원별 요금표가 있으면 인원 이하 중 가장 가까운 칸(없으면 가장 작은 인원 칸) */
export function quotePriceFor(q: SupplierQuote, travelers: number): { price: number; tier: number | null } {
  if (q.rate === null) return { price: 0, tier: null };
  if (q.tiers.length === 0) return { price: q.pricePerPerson, tier: null };
  const sorted = [...q.tiers].sort((a, b) => a.travelers - b.travelers);
  const fit = [...sorted].reverse().find((t) => t.travelers <= travelers) ?? sorted[0];
  return { price: fit.pricePerPerson, tier: fit.travelers };
}

async function krwPerUnit(code: string): Promise<number | null> {
  try {
    const res = await fetch(`/api/fx?code=${code}`);
    const data = (await res.json().catch(() => null)) as { krwPerUnit?: number } | null;
    return res.ok && data?.krwPerUnit ? data.krwPerUnit : null;
  } catch {
    return null;
  }
}

/** 읽은 업체 견적을 입력에 넣는 값 — 업체 공급가 모드로 바꾸고, 인원에 맞는 1인 요금을 공급가로 */
export async function supplierQuotePatch(raw: ParsedSupplierQuote, input: TripInput, fetchRate = krwPerUnit): Promise<Partial<TripInput>> {
  const rate = await conversionRate(raw.currency, input.currency, fetchRate);
  const quote = toAppQuote(raw, rate, new Date().toISOString());
  const { price } = quotePriceFor(quote, input.travelers);
  const wasPrice = input.pricingMode === "fixed_price" ? input.fixedPricePerPerson : 0;
  return {
    supplierQuote: quote,
    pricingMode: "supplier",
    supplierCutIds: null,
    ...(price > 0 ? { supplierPricePerPerson: Math.round(price) } : {}),
    ...(input.supplierTargetPrice <= 0 && wasPrice > 0 ? { supplierTargetPrice: wasPrice } : {}),
  };
}
