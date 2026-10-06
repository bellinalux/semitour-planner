import { roundUpPrice } from "@/lib/priceRound";
import type { ChannelPriceMode, ChannelResult, CurrencyCode, PricingMode, SalesChannel, TripInput } from "@/types";

/** 직판(자사 카드결제)의 채널 id */
export const DIRECT_CHANNEL_ID = "direct";

/** 수수료율(율 + 정액)이 계산에 쓰는 형태. rate는 0~1 */
export interface FeeRow {
  id: string;
  name: string;
  isDirect: boolean;
  /** 판매가 대비 수수료율 (0~1, 결제 수수료 포함) */
  rate: number;
  fixedPerPerson: number;
  /** 예상 판매 비중 (%) */
  share: number;
}

export interface PriceParams {
  /** 목표 마진율 (0~1) */
  margin: number;
  currency: CurrencyCode;
  pricingMode: PricingMode;
  fixedPrice: number;
  channelPriceMode: ChannelPriceMode;
}

export function priceParamsOf(input: TripInput): PriceParams {
  return {
    margin: input.targetMarginRate / 100,
    currency: input.currency,
    pricingMode: input.pricingMode,
    fixedPrice: input.fixedPricePerPerson,
    channelPriceMode: input.channelPriceMode,
  };
}

function channelFeeRate(channel: SalesChannel, cardFeeRate: number): number {
  const base = Math.max(0, channel.commissionRate);
  return (base + (channel.paymentFeeSeparate ? Math.max(0, cardFeeRate) : 0)) / 100;
}

/** 직판을 맨 앞에 두고 입력한 채널을 이어 붙인다. 직판 비중은 채널 비중 합계를 뺀 나머지 */
export function feeRows(input: Pick<TripInput, "channels" | "cardFeeRate">): FeeRow[] {
  const channels = input.channels.filter((c) => c.name.trim() !== "" || c.commissionRate > 0 || c.fixedFeePerPerson > 0);
  const channelShare = channels.reduce((sum, c) => sum + Math.max(0, c.share), 0);
  return [
    {
      id: DIRECT_CHANNEL_ID,
      name: "직판 (자사·카드결제)",
      isDirect: true,
      rate: Math.max(0, input.cardFeeRate) / 100,
      fixedPerPerson: 0,
      share: Math.max(0, 100 - channelShare),
    },
    ...channels.map((c) => ({
      id: c.id,
      name: c.name.trim() || "이름 없는 채널",
      isDirect: false,
      rate: channelFeeRate(c, input.cardFeeRate),
      fixedPerPerson: Math.max(0, c.fixedFeePerPerson),
      share: Math.max(0, c.share),
    })),
  ];
}

/** 목표 마진을 맞추는 1인 판매가. 수수료와 마진의 합이 100% 이상이면 null */
export function requiredPricePerPerson(
  totalCost: number,
  travelers: number,
  row: Pick<FeeRow, "rate" | "fixedPerPerson">,
  margin: number,
  currency: CurrencyCode,
): number | null {
  const denominator = 1 - margin - row.rate;
  if (travelers <= 0 || denominator <= 1e-9) return null;
  return roundUpPrice((totalCost / travelers + row.fixedPerPerson) / denominator, currency);
}

/**
 * 채널별 소비자가(1인).
 *  - 판매가 직접 입력 모드: 모든 채널이 입력한 가격
 *  - 동일가(parity): 수수료 때문에 가장 비싸야 하는 채널 기준 가격을 모든 채널에 적용
 *  - 채널별 가격: 채널마다 목표 마진에 맞춘 가격
 * 마진을 맞출 수 없는 채널은 0.
 */
export function consumerPrices(rows: FeeRow[], travelers: number, totalCost: number, params: PriceParams): Map<string, number> {
  const prices = new Map<string, number>();
  if (params.pricingMode === "fixed_price") {
    for (const row of rows) prices.set(row.id, params.fixedPrice);
    return prices;
  }
  const required = rows.map((row) => ({ row, price: requiredPricePerPerson(totalCost, travelers, row, params.margin, params.currency) }));
  if (params.channelPriceMode === "parity") {
    const highest = Math.max(0, ...required.map((r) => r.price ?? 0));
    for (const row of rows) prices.set(row.id, highest);
    return prices;
  }
  for (const { row, price } of required) prices.set(row.id, price ?? 0);
  return prices;
}

/** 이 인원·가격으로 팔 때 이익 (채널 수수료와 정액 수수료를 뺀 뒤) */
export function profitAt(totalCost: number, travelers: number, pricePerPerson: number, row: Pick<FeeRow, "rate" | "fixedPerPerson">): number {
  const revenue = travelers * pricePerPerson;
  return revenue * (1 - row.rate) - row.fixedPerPerson * travelers - totalCost;
}

const MAX_SEARCH_TRAVELERS = 100;

/** 채널 가격이 고정일 때, 이익률이 targetMargin 이상이 되는 최소 인원. 달성 불가면 null */
function minTravelersFor(
  row: Pick<FeeRow, "rate" | "fixedPerPerson">,
  pricePerPerson: number,
  targetMargin: number,
  costAt: (travelers: number) => number,
): number | null {
  if (pricePerPerson <= 0) return null;
  for (let n = 1; n <= MAX_SEARCH_TRAVELERS; n++) {
    const revenue = n * pricePerPerson;
    if (profitAt(costAt(n), n, pricePerPerson, row) / revenue >= targetMargin - 1e-9) return n;
  }
  return null;
}

/** 현재 인원 기준 채널별 정산·이익 (직판 포함). 손익분기·목표 마진 인원은 채널 수수료가 달라 채널마다 따로 구한다. */
export function buildChannelResults(
  rows: FeeRow[],
  travelers: number,
  costAt: (travelers: number) => number,
  params: PriceParams,
): ChannelResult[] {
  const cost = costAt(travelers);
  const prices = consumerPrices(rows, travelers, cost, params);

  return rows.map((row) => {
    const pricePerPerson = prices.get(row.id) ?? 0;
    const totalPrice = pricePerPerson * travelers;
    const feeAmount = totalPrice * row.rate + row.fixedPerPerson * travelers;
    const profit = totalPrice - feeAmount - cost;
    return {
      id: row.id,
      name: row.name,
      isDirect: row.isDirect,
      feeRate: row.rate * 100,
      fixedFeePerPerson: row.fixedPerPerson,
      share: row.share,
      pricePerPerson,
      totalPrice,
      feeAmount,
      settlement: totalPrice - feeAmount,
      profit,
      marginRate: totalPrice > 0 ? (profit / totalPrice) * 100 : 0,
      requiredPrice: requiredPricePerPerson(cost, travelers, row, params.margin, params.currency),
      breakEvenPrice: requiredPricePerPerson(cost, travelers, row, 0, params.currency),
      breakEvenTravelers: minTravelersFor(row, pricePerPerson, 0, costAt),
      targetMarginTravelers: minTravelersFor(row, pricePerPerson, params.margin, costAt),
    };
  });
}

export interface ChannelMix {
  /** 판매 비중 가중평균 수수료율 (%) */
  weightedFeeRate: number;
  /** 비중대로 팔렸을 때 총 이익 (원가는 한 번만 뺀다) */
  totalProfit: number;
  profitPerPerson: number;
  /** 총 이익 ÷ 총 소비자 결제액 (%) */
  marginRate: number;
  /** 비중 합계 (직판 포함, 항상 100 이하로 맞춰 계산) */
  totalShare: number;
}

/** 채널 판매 비중대로 팔렸을 때의 평균 수수료율과 이익. 채널이 직판뿐이면 null */
export function channelMix(results: ChannelResult[], travelers: number, cost: number): ChannelMix | null {
  if (results.length <= 1 || travelers <= 0) return null;
  const totalShare = results.reduce((sum, r) => sum + r.share, 0);
  if (totalShare <= 0) return null;

  let revenue = 0;
  let net = 0;
  let weightedFee = 0;
  for (const r of results) {
    const weight = r.share / totalShare;
    revenue += r.totalPrice * weight;
    net += r.settlement * weight;
    weightedFee += r.feeRate * weight;
  }
  const totalProfit = net - cost;
  return {
    weightedFeeRate: weightedFee,
    totalProfit,
    profitPerPerson: totalProfit / travelers,
    marginRate: revenue > 0 ? (totalProfit / revenue) * 100 : 0,
    totalShare,
  };
}

/** 소비자 결제가를 discountRate(%) 깎았을 때의 이익 (수수료는 깎은 뒤 결제액에 붙는다고 본다) */
export function discountOutcome(
  result: Pick<ChannelResult, "totalPrice" | "feeRate" | "fixedFeePerPerson">,
  travelers: number,
  cost: number,
  discountRate: number,
): { paid: number; profit: number; marginRate: number } {
  const paid = result.totalPrice * (1 - Math.min(100, Math.max(0, discountRate)) / 100);
  const profit = paid * (1 - result.feeRate / 100) - result.fixedFeePerPerson * travelers - cost;
  return { paid, profit, marginRate: paid > 0 ? (profit / paid) * 100 : 0 };
}

/**
 * 이익률이 targetMargin(0~1) 밑으로 내려가지 않는 최대 할인율(%).
 * 정가에서도 이미 그 마진을 못 내면 0, 계산할 수 없으면(수수료+마진 100% 이상) null.
 */
export function maxDiscountRate(
  result: Pick<ChannelResult, "totalPrice" | "feeRate" | "fixedFeePerPerson">,
  travelers: number,
  cost: number,
  targetMargin: number,
): number | null {
  const denominator = 1 - result.feeRate / 100 - targetMargin;
  if (result.totalPrice <= 0 || denominator <= 1e-9) return null;
  const minPaid = (cost + result.fixedFeePerPerson * travelers) / denominator;
  return Math.max(0, Math.min(100, (1 - minPaid / result.totalPrice) * 100));
}
