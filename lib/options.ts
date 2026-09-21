import { roundUpPrice } from "@/lib/cost";
import { midpoint } from "@/lib/travelEstimate";
import type { TourCandidate, TourOption, TripInput } from "@/types";

export const DEFAULT_PARTICIPATION_RATE = 30;
export const DEFAULT_MIN_PARTICIPANTS = 2;

/** 옵션 원가에서 목표 마진과 카드 수수료를 반영한 권장 옵션 요금 (기본 상품과 같은 계산 방식) */
export function suggestOptionPrice(
  cost: number,
  input: Pick<TripInput, "targetMarginRate" | "cardFeeRate" | "currency">,
): number {
  const denominator = 1 - input.targetMarginRate / 100 - input.cardFeeRate / 100;
  if (cost <= 0 || denominator <= 0) return roundUpPrice(Math.max(0, cost), input.currency);
  return roundUpPrice(cost / denominator, input.currency);
}

/**
 * 카탈로그 투어를 선택 옵션으로 바꾼다.
 *  - 웹 검색/AI 추정 요금: 그 요금을 원가로 보고, 요금은 권장가로 시작한다.
 *  - Viator 판매가: 이미 소비자가 사는 정가이므로 그 가격을 옵션 요금으로 두고,
 *    원가는 목표 마진과 카드 수수료를 뺀 가정값으로 채운다 (실제 매입가는 직접 고쳐야 한다).
 */
export function tourToOption(
  tour: TourCandidate,
  dayNo: number,
  input: Pick<TripInput, "targetMarginRate" | "cardFeeRate" | "currency">,
): TourOption {
  const market = tour.priceBasis === "market";
  const listed = midpoint(tour.priceLow, tour.priceHigh);
  const keepRate = Math.max(0, 1 - input.targetMarginRate / 100 - input.cardFeeRate / 100);
  const cost = market ? Math.floor(listed * keepRate) : listed;
  const price = market ? listed : suggestOptionPrice(cost, input);
  const note = market
    ? ["Viator 판매가를 옵션 요금으로 넣었습니다. 원가는 목표 마진을 뺀 가정값이니 실제 매입가로 고치세요", tour.booking].filter(Boolean).join(" · ")
    : tour.booking;
  return {
    id: `opt-${crypto.randomUUID().slice(0, 8)}`,
    name: tour.name,
    description: [tour.description, tour.includes ? `포함: ${tour.includes}` : ""].filter(Boolean).join(" · "),
    category: tour.category,
    durationMinutes: tour.durationMinutes,
    dayNo,
    costPerPerson: cost,
    pricePerPerson: price,
    minParticipants: DEFAULT_MIN_PARTICIPANTS,
    participationRate: DEFAULT_PARTICIPATION_RATE,
    link: tour.searchUrl,
    note,
  };
}

export function newManualOption(): TourOption {
  return {
    id: `opt-${crypto.randomUUID().slice(0, 8)}`,
    name: "새 옵션",
    description: "",
    durationMinutes: 0,
    dayNo: 0,
    costPerPerson: 0,
    pricePerPerson: 0,
    minParticipants: DEFAULT_MIN_PARTICIPANTS,
    participationRate: DEFAULT_PARTICIPATION_RATE,
    note: "",
  };
}

export interface OptionResult {
  option: TourOption;
  /** 예상 신청 인원 = 전체 인원 × 참여율 (반올림) */
  participants: number;
  /** 최소 인원을 채워 진행되는지 */
  runs: boolean;
  revenue: number;
  cost: number;
  cardFee: number;
  profit: number;
}

export interface OptionSimulation {
  rows: OptionResult[];
  revenue: number;
  cost: number;
  cardFee: number;
  profit: number;
  /** 옵션 매출 대비 이익률 (%). 매출이 없으면 0 */
  marginRate: number;
  /** 진행되지 않는(최소 인원 미달) 옵션 수 */
  notRunning: number;
}

/**
 * 선택 옵션 매출 시뮬레이션. 최소 인원에 못 미치면 그 옵션은 진행되지 않아 매출도 원가도 없다.
 * rateOverride를 주면 모든 옵션에 그 참여율(%)을 적용한다 (민감도 표용).
 */
export function simulateOptions(
  options: TourOption[],
  travelers: number,
  cardFeeRate: number,
  rateOverride?: number,
): OptionSimulation {
  const rows: OptionResult[] = options.map((option) => {
    const rate = rateOverride ?? option.participationRate;
    const participants = Math.min(travelers, Math.max(0, Math.round((travelers * rate) / 100)));
    const runs = participants > 0 && participants >= Math.max(1, option.minParticipants);
    const revenue = runs ? participants * option.pricePerPerson : 0;
    const cost = runs ? participants * option.costPerPerson : 0;
    const cardFee = revenue * (cardFeeRate / 100);
    return { option, participants, runs, revenue, cost, cardFee, profit: revenue - cardFee - cost };
  });

  const revenue = rows.reduce((s, r) => s + r.revenue, 0);
  const cost = rows.reduce((s, r) => s + r.cost, 0);
  const cardFee = rows.reduce((s, r) => s + r.cardFee, 0);
  const profit = revenue - cardFee - cost;

  return {
    rows,
    revenue,
    cost,
    cardFee,
    profit,
    marginRate: revenue > 0 ? (profit / revenue) * 100 : 0,
    notRunning: rows.filter((r) => !r.runs).length,
  };
}

/** 옵션 1인 요금이 원가보다 낮은(손해) 옵션 */
export function isLossMaking(option: TourOption): boolean {
  return option.pricePerPerson > 0 && option.pricePerPerson < option.costPerPerson;
}
