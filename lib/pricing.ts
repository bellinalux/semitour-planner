import { requiredPricePerPerson, profitAt, DIRECT_CHANNEL_ID, type FeeRow } from "@/lib/channels";
import { competitorPriceInOurScope, type OurPolicy } from "@/lib/competitorDiff";
import { roundDownPrice, roundUnit } from "@/lib/priceRound";
import type { ChannelResult, FlightDeal, QuoteData, QuoteScenario, TripInput } from "@/types";

/** 수수료 계산에 쓰는 형태로 바꾼다 */
function rowOf(channel: ChannelResult): Pick<FeeRow, "rate" | "fixedPerPerson"> {
  return { rate: channel.feeRate / 100, fixedPerPerson: channel.fixedFeePerPerson };
}

/**
 * 추천 판매가의 기준이 되는 채널.
 * 채널 가격을 동일가로 두면 수수료 때문에 가장 비싸야 하는 채널(그 가격이 모든 채널의 가격이 된다),
 * 채널별 가격이면 직판을 기준으로 한다.
 */
export function bindingChannel(quote: QuoteData, input: Pick<TripInput, "channelPriceMode">): ChannelResult {
  const direct = quote.channels.find((c) => c.id === DIRECT_CHANNEL_ID) ?? quote.channels[0];
  if (input.channelPriceMode !== "parity" || quote.channels.length <= 1) return direct;
  return quote.channels.reduce((best, c) => ((c.requiredPrice ?? 0) > (best.requiredPrice ?? 0) ? c : best), direct);
}

/**
 * 견적서·청구서·계약서처럼 고객에게 나가는 문서용 견적. 선택한 판매 채널의 소비자가로 가격만 바꾼다.
 * (채널 이름·수수료·정산액은 고객 문서에 들어가지 않는다. 원가·마진은 내부 문서에서 원래 견적으로 본다.)
 */
export function documentQuote(quote: QuoteData, input: Pick<TripInput, "documentChannelId">): QuoteData {
  const id = input.documentChannelId;
  if (!id || id === DIRECT_CHANNEL_ID || !quote.channels.some((c) => c.id === id)) return quote;
  const swap = (s: QuoteScenario): QuoteScenario => {
    const price = s.channelPrices?.[id];
    return price === undefined ? s : { ...s, pricePerPerson: price, totalPrice: price * s.travelers };
  };
  return { ...quote, scenario: swap(quote.scenario), matrix: quote.matrix.map(swap), withUndecided: quote.withUndecided ? swap(quote.withUndecided) : null };
}

/** ---------- 추천 판매가 3단계 ---------- */

export interface PriceTier {
  key: "floor" | "recommended" | "competitive";
  label: string;
  /** 1인 판매가. 계산할 수 없으면 null */
  price: number | null;
  /** 이 가격으로 팔 때 이익률 (%) */
  marginRate: number | null;
  note: string;
}

export interface CompetitorStats {
  count: number;
  min: number;
  p25: number;
  median: number;
  max: number;
}

export interface PriceTiers {
  tiers: PriceTier[];
  /** 우리 범위로 환산한 경쟁사 가격 분포. 가격이 입력된 경쟁사가 없으면 null */
  stats: CompetitorStats | null;
  /** 가격 계산 기준 채널 이름 */
  basisName: string;
  /** 경쟁력 가격이 최저 판매가보다 낮아 가격 경쟁이 어려운 경우 */
  competitiveBelowFloor: boolean;
  /** 권장가의 경쟁사 대비 위치 설명 */
  position: string | null;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * 최저 · 권장 · 경쟁력 세 가격대를 제시한다.
 *  - 최저: 최소 마진율(minMarginRate)을 지키는 가격. 이 밑으로는 팔지 않는다.
 *  - 권장: 목표 마진율을 맞추는 가격 (기준 채널의 수수료 반영)
 *  - 경쟁력: 우리 범위로 환산한 경쟁사 가격의 하위 25% 지점. 이 가격에서 마진이 남는지 함께 보여준다.
 */
export function buildPriceTiers(quote: QuoteData, input: TripInput, policy: OurPolicy): PriceTiers {
  const binding = bindingChannel(quote, input);
  const row = rowOf(binding);
  const n = quote.travelers;
  const cost = quote.scenario.baseCost;
  const currency = input.currency;
  const marginAt = (price: number | null) =>
    price && price > 0 && n > 0 ? (profitAt(cost, n, price, row) / (price * n)) * 100 : null;

  const floorPrice = requiredPricePerPerson(cost, n, row, input.minMarginRate / 100, currency);
  const recommendedPrice = requiredPricePerPerson(cost, n, row, input.targetMarginRate / 100, currency);

  const scoped = input.competitors
    .map((c) => competitorPriceInOurScope(c, quote, input, policy))
    .filter((p): p is number => p !== null && p > 0)
    .sort((a, b) => a - b);
  const stats: CompetitorStats | null =
    scoped.length === 0
      ? null
      : { count: scoped.length, min: scoped[0], p25: quantile(scoped, 0.25), median: quantile(scoped, 0.5), max: scoped[scoped.length - 1] };

  let competitivePrice: number | null = null;
  let competitiveNote = "경쟁사 가격이 입력되면 계산합니다.";
  if (stats) {
    const target = roundDownPrice(stats.p25, currency);
    if (recommendedPrice !== null && target >= recommendedPrice) {
      competitivePrice = recommendedPrice;
      competitiveNote = "권장가가 이미 경쟁사 하위 25%보다 낮거나 같아, 권장가로 팔아도 가격 경쟁력이 있습니다.";
    } else {
      competitivePrice = target;
      competitiveNote = `경쟁사 ${stats.count}곳을 우리 범위로 환산한 하위 25% 가격입니다.`;
    }
  }
  const competitiveMargin = marginAt(competitivePrice);
  const competitiveBelowFloor = competitivePrice !== null && floorPrice !== null && competitivePrice < floorPrice;

  let position: string | null = null;
  if (stats && recommendedPrice !== null) {
    const cheaper = scoped.filter((p) => p > recommendedPrice).length;
    position = `권장가는 경쟁사 ${stats.count}곳 중 ${cheaper}곳보다 저렴합니다 (경쟁사 최저 ${stats.min.toLocaleString("ko-KR")} · 중앙 ${Math.round(stats.median).toLocaleString("ko-KR")} · 최고 ${stats.max.toLocaleString("ko-KR")}).`;
  }

  return {
    tiers: [
      {
        key: "floor",
        label: "최저 판매가",
        price: floorPrice,
        marginRate: marginAt(floorPrice),
        note: `최소 마진 ${input.minMarginRate}%를 지키는 가격. 이 밑으로는 팔지 않는 선입니다.`,
      },
      {
        key: "recommended",
        label: "권장 판매가",
        price: recommendedPrice,
        marginRate: marginAt(recommendedPrice),
        note: `목표 마진 ${input.targetMarginRate}%를 맞추는 가격${binding.isDirect ? "" : ` ('${binding.name}' 수수료 기준)`}.`,
      },
      { key: "competitive", label: "경쟁력 가격", price: competitivePrice, marginRate: competitiveMargin, note: competitiveNote },
    ],
    stats,
    basisName: binding.name,
    competitiveBelowFloor,
    position,
  };
}

/** ---------- 1인실 추가요금(싱글차지) ---------- */

export interface SingleSupplement {
  /** 1인실을 쓰는 사람에게 더 받을 권장 요금 (1인) */
  price: number;
  /** 원가로 본 추가 비용 (1인) */
  cost: number;
  guestsPerUnit: number;
}

/**
 * 한 방을 나눠 쓰던 숙박비를 혼자 쓰면 늘어나는 비용을 목표 마진과 수수료까지 반영해 추가요금으로 환산한다.
 * 숙박이 없는 구성이거나 1실 인원이 1명 이하면 null.
 */
export function singleSupplement(quote: QuoteData, input: TripInput): SingleSupplement | null {
  const guests = Math.max(1, Math.round(input.guestsPerUnit));
  if (quote.lodgingUnits <= 0 || guests < 2) return null;
  const perUnit = (key: string) => quote.lines.filter((l) => l.key === key).reduce((sum, l) => sum + l.amount, 0) / quote.lodgingUnits;
  const roomCost = perUnit("lodging") + perUnit("lodging-cleaning");
  const cost = roomCost * (1 - 1 / guests);
  if (cost <= 0) return null;

  const binding = bindingChannel(quote, input);
  const denominator = 1 - input.targetMarginRate / 100 - binding.feeRate / 100;
  if (denominator <= 1e-9) return null;
  const unit = roundUnit(input.currency);
  return { price: Math.ceil(cost / denominator / unit - 1e-9) * unit, cost, guestsPerUnit: guests };
}

/** ---------- 아동·유아 요금 ---------- */

export interface Composition {
  adults: number;
  children: number;
  infants: number;
  adultPrice: number;
  childPrice: number;
  infantPrice: number;
  revenue: number;
  cost: number;
  profit: number;
  marginRate: number;
  /** 모두 성인 요금으로 팔았을 때(기본 견적)와의 이익 차이 */
  profitDelta: number;
}

function roundNearest(value: number, unit: number): number {
  return Math.round(value / unit) * unit;
}

/**
 * 성인·아동·유아 구성별 총 판매액과 이익. 아동은 성인과 같은 좌석·식사·숙박 원가가 든다고 보고,
 * 유아는 별도 좌석·식사·숙박이 없다고 보고 원가를 0으로 둔다(실제와 다르면 직접 조정).
 * 아동·유아가 없으면 null.
 */
export function composition(quote: QuoteData, input: TripInput): Composition | null {
  const travelers = quote.travelers;
  const children = Math.min(Math.max(0, Math.round(input.childCount)), travelers);
  const infants = Math.max(0, Math.round(input.infantCount));
  if (children === 0 && infants === 0) return null;

  const unit = roundUnit(input.currency);
  const adultPrice = quote.scenario.pricePerPerson;
  const childPrice = roundNearest((adultPrice * input.childPriceRate) / 100, unit);
  const infantPrice = roundNearest((adultPrice * input.infantPriceRate) / 100, unit);
  const adults = travelers - children;
  const revenue = adults * adultPrice + children * childPrice + infants * infantPrice;
  const cost = travelers * quote.scenario.costPerPerson;
  const profit = revenue * (1 - input.cardFeeRate / 100) - cost;
  return {
    adults,
    children,
    infants,
    adultPrice,
    childPrice,
    infantPrice,
    revenue,
    cost,
    profit,
    marginRate: revenue > 0 ? (profit / revenue) * 100 : 0,
    profitDelta: profit - quote.scenario.profit,
  };
}

/** ---------- 환율 민감도 ---------- */

export interface FxRow {
  /** 환율 변동 (%) */
  shift: number;
  rate: number;
  costKrw: number;
  profitKrw: number;
  marginRate: number;
}

export interface FxSensitivity {
  rows: FxRow[];
  /** 환율이 이만큼(%) 오르면 이익이 0이 된다 */
  breakEvenShift: number;
  /** 환율이 이만큼(%) 오르면 이익률이 목표 마진 밑으로 내려간다 */
  targetShift: number;
  priceKrw: number;
}

const FX_SHIFTS = [-10, -5, 0, 5, 10];

/**
 * 원화로 파는 가격이 정해져 있다고 보고, 현지 통화 원가의 환율이 오르내릴 때 이익이 어떻게 변하는지 계산한다.
 * 견적 통화가 원화이거나 환율이 없으면 null.
 */
export function fxSensitivity(quote: QuoteData, input: TripInput): FxSensitivity | null {
  if (input.currency === "KRW" || input.exchangeRateToKrw <= 0) return null;
  const rate = input.exchangeRateToKrw;
  const priceKrw = quote.scenario.totalPrice * rate;
  const baseCostKrw = quote.scenario.baseCost * rate;
  if (priceKrw <= 0 || baseCostKrw <= 0) return null;
  const fee = input.cardFeeRate / 100;

  const rows = FX_SHIFTS.map((shift) => {
    const costKrw = baseCostKrw * (1 + shift / 100);
    const profitKrw = priceKrw * (1 - fee) - costKrw;
    return { shift, rate: rate * (1 + shift / 100), costKrw, profitKrw, marginRate: (profitKrw / priceKrw) * 100 };
  });
  return {
    rows,
    priceKrw,
    breakEvenShift: ((priceKrw * (1 - fee)) / baseCostKrw - 1) * 100,
    targetShift: ((priceKrw * (1 - fee - input.targetMarginRate / 100)) / baseCostKrw - 1) * 100,
  };
}

/** ---------- 출발일별 권장가 ---------- */

export interface DeparturePrice {
  deal: FlightDeal;
  /** 이 출발일 항공료로 바꿨을 때 1인 원가 */
  costPerPerson: number;
  /** 이 출발일의 권장 판매가 (판매가 직접 입력 모드면 입력한 가격) */
  pricePerPerson: number | null;
  /** 지금 설정한 항공료 기준 권장가와의 차이 */
  deltaFromCurrent: number | null;
  /** 지금 판매가를 그대로 두면 이 출발일의 이익률 (%) */
  marginAtCurrent: number;
}

/**
 * 항공 시세 조회로 찾은 출발일별 요금을 왕복 항공료에 바꿔 넣었을 때의 권장 판매가.
 * 항공이 포함된 풀패키지이고 조회한 요금이 있을 때만 계산한다. 출발일 순서로 돌려준다.
 */
export function departurePrices(quote: QuoteData, input: TripInput): DeparturePrice[] {
  if (input.packageType !== "full" || input.flightDeals.length === 0) return [];
  const n = quote.travelers;
  if (n <= 0) return [];
  const binding = bindingChannel(quote, input);
  const row = rowOf(binding);
  const buffer = input.currency !== "KRW" ? 1 + Math.max(0, input.fxBufferRate) / 100 : 1;
  const seen = new Set<string>();

  return input.flightDeals
    .filter((d) => d.price > 0 && d.departDate && !seen.has(d.departDate) && !!seen.add(d.departDate))
    .sort((a, b) => a.departDate.localeCompare(b.departDate))
    .map((deal) => {
      const cost = quote.scenario.baseCost + n * (deal.price - input.flightPricePerPerson) * buffer;
      const price =
        input.pricingMode === "fixed_price"
          ? input.fixedPricePerPerson
          : requiredPricePerPerson(cost, n, row, input.targetMarginRate / 100, input.currency);
      const current = quote.scenario.pricePerPerson;
      const sellAt = quote.scenario.pricePerPerson;
      return {
        deal,
        costPerPerson: cost / n,
        pricePerPerson: price,
        deltaFromCurrent: price === null ? null : price - current,
        marginAtCurrent: sellAt > 0 ? (profitAt(cost, n, sellAt, row) / (sellAt * n)) * 100 : 0,
      };
    });
}
