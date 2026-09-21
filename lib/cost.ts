import { formatMoney } from "@/lib/currency";
import type {
  CostLine,
  CurrencyCode,
  DayPlan,
  ItineraryItem,
  PmFreeOption,
  QuoteResult,
  QuoteScenario,
  TripInput,
} from "@/types";

/** 판매가를 올림할 단위 (통화별로 통용되는 가격 끊김) */
const ROUND_UNIT: Partial<Record<CurrencyCode, number>> = {
  KRW: 1000,
  JPY: 100,
  VND: 10000,
  THB: 10,
};

const MATRIX_SIZES = [2, 4, 6, 8, 10];

export function roundUpPrice(value: number, currency: CurrencyCode): number {
  const unit = ROUND_UNIT[currency] ?? 1;
  return Math.ceil(value / unit - 1e-9) * unit;
}

/** 실제로 진행되는 일정 항목: 오전 전체 + 선택한 오후 옵션 */
function activeItems(days: DayPlan[], pmChoice: Record<number, PmFreeOption["id"]>): ItineraryItem[] {
  return days.flatMap((day) => {
    const pm = day.pmFreeOptions.find((o) => o.id === pmChoice[day.day]) ?? day.pmFreeOptions[0];
    return [...day.amGuided, ...(pm?.items ?? [])];
  });
}

/** 일정에 따른 1인당 변동비(입장료, 식대) */
export function sumItineraryCosts(days: DayPlan[], pmChoice: Record<number, PmFreeOption["id"]>) {
  const items = activeItems(days, pmChoice);
  return {
    admissionPerPerson: items.reduce((sum, i) => sum + i.entryFee, 0),
    mealPerPerson: items.reduce((sum, i) => sum + i.mealCost, 0),
  };
}

interface Context {
  currency: CurrencyCode;
  fixedTotal: number;
  /** 1인당 변동비 (입장료 + 식대 + 팁 + 보험) */
  variablePerPerson: number;
  contingency: number;
  cardFee: number;
  margin: number;
}

function baseCostAt(n: number, ctx: Context): number {
  return ctx.fixedTotal + n * ctx.variablePerPerson * (1 + ctx.contingency);
}

/**
 * 목표 마진율(판매가 대비)과 카드 수수료(판매가 대비)를 모두 만족하는 가격을 역산한다.
 *   판매가 × (1 − 마진율 − 카드수수료율) = 총 원가
 */
function scenarioAt(n: number, ctx: Context): QuoteScenario {
  const baseCost = baseCostAt(n, ctx);
  const exactPrice = baseCost / (1 - ctx.margin - ctx.cardFee);
  const pricePerPerson = roundUpPrice(exactPrice / n, ctx.currency);
  const totalPrice = pricePerPerson * n;
  const cardFee = totalPrice * ctx.cardFee;
  const profit = totalPrice - cardFee - baseCost;

  return {
    travelers: n,
    baseCost,
    costPerPerson: baseCost / n,
    cardFee,
    profit,
    totalPrice,
    pricePerPerson,
    actualMarginRate: totalPrice > 0 ? (profit / totalPrice) * 100 : 0,
  };
}

/** 1인 가격 `price`로 팔 때, 이익률 `targetMargin`을 달성하는 최소 인원. 달성 불가면 null */
function minTravelersFor(price: number, targetMargin: number, ctx: Context): number | null {
  const contributionPerPerson =
    price * (1 - ctx.cardFee - targetMargin) - ctx.variablePerPerson * (1 + ctx.contingency);
  if (contributionPerPerson <= 0) return null;
  return Math.max(1, Math.ceil(ctx.fixedTotal / contributionPerPerson - 1e-9));
}

export function calculateQuote(
  input: TripInput,
  days: DayPlan[],
  pmChoice: Record<number, PmFreeOption["id"]>,
): QuoteResult {
  const margin = input.targetMarginRate / 100;
  const cardFee = input.cardFeeRate / 100;
  const contingency = input.contingencyRate / 100;

  if (margin + cardFee >= 1) {
    return {
      ok: false,
      error: "목표 마진율과 카드 수수료의 합이 100% 이상이라 판매가를 계산할 수 없습니다. 값을 낮춰 주세요.",
    };
  }

  const travelers = Math.max(1, Math.round(input.travelers));
  const { admissionPerPerson, mealPerPerson } = sumItineraryCosts(days, pmChoice);
  const fixedTotal =
    input.days * (input.vehicleCostPerDay + input.guideCostPerDay) + input.otherFixedCost;
  const variablePerPerson =
    admissionPerPerson + mealPerPerson + input.tipPerPerson + input.insurancePerPerson;

  const ctx: Context = {
    currency: input.currency,
    fixedTotal,
    variablePerPerson,
    contingency,
    cardFee,
    margin,
  };

  const money = (v: number) => formatMoney(v, input.currency);
  const lines: CostLine[] = [
    {
      key: "vehicle",
      label: "차량비",
      amount: input.days * input.vehicleCostPerDay,
      note: `${input.days}일 × ${money(input.vehicleCostPerDay)}`,
    },
    {
      key: "guide",
      label: "가이드비",
      amount: input.days * input.guideCostPerDay,
      note: `${input.days}일 × ${money(input.guideCostPerDay)}`,
    },
    { key: "other", label: "기타 고정비", amount: input.otherFixedCost },
    {
      key: "admission",
      label: "입장료",
      amount: admissionPerPerson * travelers,
      note: `1인 ${money(admissionPerPerson)} × ${travelers}명`,
    },
    {
      key: "meal",
      label: "식대",
      amount: mealPerPerson * travelers,
      note: `1인 ${money(mealPerPerson)} × ${travelers}명`,
    },
    { key: "tip", label: "팁", amount: input.tipPerPerson * travelers },
    { key: "insurance", label: "보험료", amount: input.insurancePerPerson * travelers },
    {
      key: "contingency",
      label: "예비비",
      amount: variablePerPerson * travelers * contingency,
      note: `변동비의 ${input.contingencyRate}%`,
    },
  ];

  const scenario = scenarioAt(travelers, ctx);

  const sizes = [...new Set([...MATRIX_SIZES, travelers])].sort((a, b) => a - b);
  const matrix = sizes.map((n) => scenarioAt(n, ctx));

  const warnings: string[] = [];
  if (input.vehicleCostPerDay + input.guideCostPerDay === 0) {
    warnings.push("차량비와 가이드비가 0으로 입력되어 원가가 실제보다 낮게 계산됩니다.");
  }
  if (admissionPerPerson + mealPerPerson === 0) {
    warnings.push("일정의 입장료·식대가 모두 0입니다. 일정표에서 금액을 확인해 주세요.");
  }
  if (input.currency !== "KRW" && input.exchangeRateToKrw <= 0) {
    warnings.push("원화 환율이 0이라 원화 환산 금액을 표시하지 않습니다.");
  }

  return {
    ok: true,
    travelers,
    lines,
    scenario,
    matrix,
    breakEvenTravelers: minTravelersFor(scenario.pricePerPerson, 0, ctx),
    targetMarginTravelers: minTravelersFor(scenario.pricePerPerson, margin, ctx),
    ourIncludes: {
      guide: input.guideCostPerDay > 0,
      vehicle: input.vehicleCostPerDay > 0,
      admission: admissionPerPerson > 0,
      meals: mealPerPerson > 0,
    },
    warnings,
  };
}

export interface CompetitorComparison {
  id: string;
  /** 경쟁사 가격 − 우리 권장가. 양수면 우리가 저렴 */
  diff: number | null;
  /** 경쟁사 가격 대비 차이(%) */
  diffRate: number | null;
}

export function compareWithCompetitors(
  competitors: TripInput["competitors"],
  ourPricePerPerson: number,
): CompetitorComparison[] {
  return competitors.map((c) =>
    c.price > 0
      ? { id: c.id, diff: c.price - ourPricePerPerson, diffRate: ((c.price - ourPricePerPerson) / c.price) * 100 }
      : { id: c.id, diff: null, diffRate: null },
  );
}
