import { DIRECT_CHANNEL_ID, feeRows } from "@/lib/channels";
import { roundUpPrice } from "@/lib/priceRound";
import type { QuoteData, TripInput } from "@/types";

/**
 * 원가 예산 — 판매가(또는 B2B 도매가)를 먼저 정하고 거꾸로 계산한다.
 *   1인 판매가 − 플랫폼(채널)·카드 수수료 − 회사 수익(목표 마진) = 1인 원가 예산 (2인 1실 기준)
 * 그 예산을 항공·숙박·차량·가이드·입장·식사로 나눠, 숙소 1실 1박 상한처럼 "이 안에서 고르라"는 기준을 만든다.
 * 이미 아는 비용(입력한 항공료·차량·가이드비·숙박 요금)은 그대로 두고, 모르는 항목에만 남은 예산을 나눈다.
 */

export type BudgetKey = "flight" | "lodging" | "ground" | "admission" | "meal" | "etc";

export interface BudgetCategory {
  key: BudgetKey;
  label: string;
  /** 1인 예산 */
  budget: number;
  /** 지금 견적의 1인 원가 (견적이 없으면 null) */
  actual: number | null;
  /** 입력한 값을 그대로 쓴 항목 (예산을 나누지 않음) */
  known: boolean;
}

export interface BudgetPlan {
  mode: "fixed_price" | "wholesale";
  /** 1인 판매가 또는 도매가 (2인 1실 기준) */
  pricePerPerson: number;
  /** 판매 플랫폼(채널) 이름 — 도매가는 "거래처(B2B)" */
  channelName: string;
  /** 수수료율 (0~1, 결제 수수료 포함) */
  feeRate: number;
  feePerPerson: number;
  marginRate: number;
  profitPerPerson: number;
  /** 1인 원가 예산 */
  budgetPerPerson: number;
  categories: BudgetCategory[];
  /** 예산 안에서 고를 기준 */
  caps: {
    /** 숙소 1실 1박 상한 (2인 1실). 숙박이 없거나 이미 요금을 정했으면 null */
    roomPerNight: number | null;
    /** 1인 입장·체험료(투어 포함) 상한 */
    admissionPerPerson: number;
    /** 1인 식사 상한 */
    mealPerPerson: number;
  };
  /** 지금 견적의 1인 원가 */
  actualPerPerson: number | null;
  /** 예산 − 지금 원가 (양수면 남음, 음수면 초과) */
  gap: number | null;
  /** 예산을 넘었을 때, 목표 마진을 지키려면 필요한 최소 1인 판매가 */
  minPriceNeeded: number | null;
}

/** 아직 모르는 항목에 남은 예산을 나누는 비율 (패키지 원가에서 흔한 비중을 참고한 기본값) */
const WEIGHTS: Record<Exclude<BudgetKey, "etc">, number> = { flight: 35, lodging: 30, ground: 15, admission: 12, meal: 8 };

const LABELS: Record<BudgetKey, string> = {
  flight: "항공",
  lodging: "숙박 (2인 1실)",
  ground: "차량·가이드",
  admission: "입장·체험·투어",
  meal: "식사",
  etc: "팁·보험·예비비 등",
};

const LINE_GROUP: Record<string, BudgetKey> = {
  flight: "flight",
  lodging: "lodging",
  "lodging-cleaning": "lodging",
  "lodging-tax": "lodging",
  "lodging-extrabed": "lodging",
  vehicle: "ground",
  guide: "ground",
  admission: "admission",
  meal: "meal",
};

/** 판매가·도매가에서 시작하는 견적이 아니면 null */
export function budgetPlan(input: TripInput, quote: QuoteData | null, tourDays = input.days): BudgetPlan | null {
  if (input.pricingMode !== "fixed_price" && input.pricingMode !== "wholesale") return null;
  const wholesale = input.pricingMode === "wholesale";
  const price = wholesale ? input.wholesalePricePerPerson : input.fixedPricePerPerson;
  if (price <= 0) return null;
  const travelers = Math.max(1, Math.round(input.travelers));

  // 수수료: 도매가는 계좌이체로 보고 0, 판매가는 고른 판매 플랫폼(없으면 직판 카드 수수료)
  const rows = feeRows(input);
  const row = wholesale ? null : (rows.find((r) => r.id === (input.documentChannelId || DIRECT_CHANNEL_ID)) ?? rows[0]);
  const feeRate = row?.rate ?? 0;
  const feePerPerson = price * feeRate + (row?.fixedPerPerson ?? 0);
  const marginRate = input.targetMarginRate / 100;
  const profitPerPerson = price * marginRate;
  const budgetPerPerson = Math.max(0, price - feePerPerson - profitPerPerson);

  const includeLodging = input.packageType !== "land" && input.nights > 0;
  const includeFlight = input.packageType === "full";
  const guests = Math.max(1, Math.round(input.guestsPerUnit));

  // 이미 아는 1인 비용
  const known: Partial<Record<BudgetKey, number>> = {};
  if (includeFlight && input.flightPricePerPerson > 0) known.flight = input.flightPricePerPerson;
  if (input.vehicleCostPerDay + input.guideCostPerDay > 0) known.ground = ((input.vehicleCostPerDay + input.guideCostPerDay) * Math.max(0, tourDays)) / travelers;
  if (includeLodging && input.lodgingRatePerNight > 0) known.lodging = (input.lodgingRatePerNight * input.nights) / guests + input.cityTaxPerPersonPerNight * input.nights;
  const etc = input.tipPerPerson + input.insurancePerPerson + input.otherFixedCost / travelers;

  const keys: Exclude<BudgetKey, "etc">[] = ["flight", "lodging", "ground", "admission", "meal"];
  const included = keys.filter((k) => (k === "flight" ? includeFlight : k === "lodging" ? includeLodging : true));
  const unknown = included.filter((k) => known[k] === undefined);
  const knownTotal = included.reduce((sum, k) => sum + (known[k] ?? 0), 0) + etc;
  // 예비비는 모르는 항목 예산에서 비율만큼 남겨 둔다
  const remaining = Math.max(0, budgetPerPerson - knownTotal) / (1 + input.contingencyRate / 100);
  const weightSum = unknown.reduce((sum, k) => sum + WEIGHTS[k], 0);

  const actualOf = (key: BudgetKey): number | null => {
    if (!quote) return null;
    const lines = quote.lines.filter((l) => !l.excluded && (LINE_GROUP[l.key] ?? "etc") === key);
    return lines.reduce((sum, l) => sum + l.amount, 0) / quote.travelers;
  };

  const categories: BudgetCategory[] = included.map((key) => ({
    key,
    label: LABELS[key],
    budget: known[key] ?? (weightSum > 0 ? (remaining * WEIGHTS[key]) / weightSum : 0),
    actual: actualOf(key),
    known: known[key] !== undefined,
  }));
  const reserve = Math.max(0, budgetPerPerson - knownTotal) - remaining;
  categories.push({ key: "etc", label: LABELS.etc, budget: etc + reserve, actual: actualOf("etc"), known: true });

  const lodging = categories.find((c) => c.key === "lodging");
  const roomPerNight = lodging && !lodging.known && input.nights > 0 ? Math.floor((lodging.budget * guests) / input.nights) : null;

  const actualPerPerson = quote ? quote.scenario.costPerPerson : null;
  const gap = actualPerPerson === null ? null : budgetPerPerson - actualPerPerson;
  const denominator = 1 - feeRate - marginRate;
  const minPriceNeeded =
    gap !== null && gap < 0 && actualPerPerson !== null && denominator > 1e-9 ? roundUpPrice((actualPerPerson + (row?.fixedPerPerson ?? 0)) / denominator, input.currency) : null;

  return {
    mode: wholesale ? "wholesale" : "fixed_price",
    pricePerPerson: price,
    channelName: wholesale ? "거래처(B2B)" : (row?.name ?? "직판"),
    feeRate,
    feePerPerson,
    marginRate,
    profitPerPerson,
    budgetPerPerson,
    categories,
    caps: {
      roomPerNight,
      admissionPerPerson: categories.find((c) => c.key === "admission")?.budget ?? 0,
      mealPerPerson: categories.find((c) => c.key === "meal")?.budget ?? 0,
    },
    actualPerPerson,
    gap,
    minPriceNeeded,
  };
}
