import { FX_CODES } from "@/lib/fxCodes";
import type { ParsedSupplierQuote } from "@/lib/schemas/course";
import type { CompetitorIncludes, CourseMeta, CurrencyCode, HotelGrade, PackageType, SupplierQuote, TripInput } from "@/types";

/**
 * 업체 견적서에서 읽은 금액을 앱 통화로 바꾸고, 지금 인원에 맞는 1인 요금을 고른다.
 * 통화를 바꾸지 못하면(환율 조회 실패·모르는 통화) 원문 금액을 그대로 두고 1인 요금은 0으로 둔다 — 사람이 직접 넣는다.
 */

const SUPPORTED = FX_CODES;

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
    minTravelers: raw.minTravelers,
    hotels: raw.hotels,
    suspectPrice: raw.suspectPrice,
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

/** 견적서의 포함·불포함 항목을 찾는 말 */
export const QUOTE_ITEM_PATTERNS = {
  lodging: /호텔|숙박|리조트|hotel|resort|accommodation/i,
  vehicle: /차량|버스|밴|전용차|vehicle|bus|van|transport/i,
  guide: /가이드(?!\s*(팁|경비))|guide(?!\s*tip)/i,
  admission: /입장|관광지|티켓|admission|entrance|ticket/i,
  meal: /식사|중식|석식|meal|lunch|dinner/i,
  tip: /팁|경비|tip|gratuit/i,
  transfer: /픽업|샌딩|공항|pick\s*up|airport|transfer/i,
  insurance: /보험|insurance/i,
  // "제주항공 09:50"처럼 항공사 이름만 있는 것은 포함 항목으로 보지 않는다
  flight: /항공권|항공료|왕복\s*항공|(^|[\s(])항공(\s|$|[),·])|airfare|air\s*ticket|flight/i,
} as const;
export type QuoteItemKey = keyof typeof QUOTE_ITEM_PATTERNS;

/** 견적서에서 이 항목이 포함/불포함/안 적힘인지와, 찾은 문구 */
export function quoteItemState(
  q: Pick<SupplierQuote, "includes" | "excludes">,
  key: QuoteItemKey,
): { state: "included" | "excluded" | "missing"; evidence: string } {
  const re = QUOTE_ITEM_PATTERNS[key];
  const ex = q.excludes.find((x) => re.test(x));
  const inc = q.includes.find((x) => re.test(x));
  // 같은 말이 양쪽에 있으면(예: "가이드" 포함, "가이드 팁" 불포함) 팁은 불포함 쪽을 따른다
  if (ex && (!inc || key === "tip")) return { state: "excluded", evidence: ex };
  if (inc) return { state: "included", evidence: inc };
  return { state: "missing", evidence: "" };
}

/**
 * 업체 공급가로 파는 상품에 무엇이 들어 있는지 — 견적서의 포함·불포함을 따르고, 안 적힌 항목은 fallback(우리 원가 입력 기준)을 쓴다.
 * 경쟁 상품과 같은 조건으로 맞출 때 쓴다.
 */
export function supplierIncludes(q: SupplierQuote, fallback: CompetitorIncludes): CompetitorIncludes {
  const pick = (key: QuoteItemKey, current: boolean) => {
    const s = quoteItemState(q, key).state;
    return s === "included" ? true : s === "excluded" ? false : current;
  };
  return {
    guide: pick("guide", fallback.guide),
    vehicle: pick("vehicle", fallback.vehicle),
    admission: pick("admission", fallback.admission),
    meals: pick("meal", fallback.meals),
    hotel: pick("lodging", fallback.hotel),
    flight: pick("flight", fallback.flight),
  };
}

/** 원문 호텔 표기에서 등급 — 여러 등급이 섞여 있으면(4·5성 중 하나) 낮은 쪽으로 본다 */
export function gradeFromText(text: string): HotelGrade | null {
  const grades = [...text.matchAll(/([345])\s*(?:성|star|\*)/gi)].map((m) => Number(m[1]));
  const mixed = /([345])\s*[·,/~-]\s*([345])\s*성/.exec(text);
  if (mixed) grades.push(Number(mixed[1]), Number(mixed[2]));
  if (grades.length > 0) return String(Math.min(...grades)) as HotelGrade;
  return /리조트|resort/i.test(text) ? "resort" : null;
}

/** 읽은 견적서의 포함 항목으로 판매 구성(랜드·숙박·항공)을 맞춘다. 알 수 없으면 null */
export function packageFromQuote(q: Pick<SupplierQuote, "includes" | "excludes" | "hotels">): PackageType | null {
  const hotel = quoteItemState(q, "lodging").state;
  const flight = quoteItemState(q, "flight").state;
  if (flight === "included") return "full";
  if (hotel === "included" || (hotel === "missing" && (q.hotels ?? "").trim() !== "")) return "land_hotel";
  if (hotel === "excluded") return "land";
  return null;
}

/**
 * 읽은 업체 견적을 입력에 넣는 값 — 인원에 맞는 1인 요금을 공급가로 넣고 "업체 공급가에서 시작"으로 바꾼다.
 * 요금이 없거나 통화를 바꾸지 못했으면 견적 방식은 그대로 두고 견적서 내용만 남긴다(검증표·질문은 보이고, 공급가는 사람이 넣는다).
 * 견적서의 포함 항목·호텔 등급으로 판매 구성과 숙소 등급도 맞춘다.
 */
export async function supplierQuotePatch(
  raw: ParsedSupplierQuote,
  input: TripInput,
  fetchRate = krwPerUnit,
  meta: CourseMeta | null = null,
): Promise<Partial<TripInput>> {
  const rate = raw.pricePerPerson > 0 || raw.tiers.length > 0 || raw.singleSupplement > 0 ? await conversionRate(raw.currency, input.currency, fetchRate) : 1;
  const quote = toAppQuote(raw, rate, new Date().toISOString());
  const { price } = quotePriceFor(quote, input.travelers);
  const wasPrice = input.pricingMode === "fixed_price" ? input.fixedPricePerPerson : 0;
  const packageType = packageFromQuote(quote);
  const grade = gradeFromText([quote.hotels, meta?.hotelGrade].filter(Boolean).join(" "));
  return {
    supplierQuote: quote,
    supplierCutIds: null,
    ...(price > 0 ? { pricingMode: "supplier" as const, supplierPricePerPerson: Math.round(price) } : {}),
    ...(input.supplierTargetPrice <= 0 && wasPrice > 0 ? { supplierTargetPrice: wasPrice } : {}),
    ...(packageType ? { packageType, ...(packageType === "full" ? { includesFlights: true } : {}) } : {}),
    ...(grade && (packageType ?? input.packageType) !== "land" ? { hotelGrade: grade, ...(grade === "resort" ? { lodgingType: "resort" as const } : {}) } : {}),
  };
}
