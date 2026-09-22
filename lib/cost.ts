import { formatMoney } from "@/lib/currency";
import { dayItems, groundDays, overnightNights, type PmChoice } from "@/lib/itinerary";
import { lodgingCostPerUnit, lodgingSegments } from "@/lib/lodging";
import type {
  CostKey,
  CostLine,
  CurrencyCode,
  DayPlan,
  ItineraryItem,
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
/** 손익분기 인원을 찾을 때 확인하는 최대 인원 */
const MAX_SEARCH_TRAVELERS = 100;

export function roundUpPrice(value: number, currency: CurrencyCode): number {
  const unit = ROUND_UNIT[currency] ?? 1;
  return Math.ceil(value / unit - 1e-9) * unit;
}

/** 실제로 진행되는 일정 항목: 세미투어는 오전 전체 + 선택한 오후 옵션, 업체 코스는 전체 */
function activeItems(days: DayPlan[], pmChoice: PmChoice): ItineraryItem[] {
  return days.flatMap((day) => dayItems(day, pmChoice));
}

/** 일정에 따른 1인당 변동비(입장료, 식대). 고객이 현지에서 직접 내는 항목은 판매가에 포함되지 않으므로 뺀다. */
export function sumItineraryCosts(days: DayPlan[], pmChoice: PmChoice) {
  const items = activeItems(days, pmChoice).filter((i) => i.payment !== "local");
  return {
    admissionPerPerson: items.reduce((sum, i) => sum + i.entryFee, 0),
    mealPerPerson: items.reduce((sum, i) => sum + i.mealCost, 0),
  };
}

/** 인원에 맞는 방/유닛 수 */
export function lodgingUnitsFor(travelers: number, guestsPerUnit: number): number {
  return Math.ceil(travelers / Math.max(1, Math.round(guestsPerUnit)));
}

interface Context {
  input: TripInput;
  /** 일정에서 센 도시별 숙박 수 (도시별 숙박 요금 계산용) */
  lodgingStays: { city: string; nights: number }[];
  tourDays: number;
  admissionPerPerson: number;
  mealPerPerson: number;
  includeLodging: boolean;
  includeFlight: boolean;
  contingency: number;
  cardFee: number;
  margin: number;
}

/** 특정 인원에서의 비용 항목. 미정 항목은 excluded로 표시만 하고 금액은 그대로 둔다. */
function buildLines(n: number, ctx: Context): CostLine[] {
  const { input } = ctx;
  const money = (v: number) => formatMoney(v, input.currency);
  const statusOf = (key: CostKey) => input.costStatus[key] ?? "confirmed";
  const withStatus = (key: CostKey, line: Omit<CostLine, "status" | "excluded">): CostLine => ({
    ...line,
    status: statusOf(key),
    excluded: statusOf(key) === "undecided",
  });

  const variablePerPerson =
    ctx.admissionPerPerson + ctx.mealPerPerson + input.tipPerPerson + input.insurancePerPerson;

  const lines: CostLine[] = [
    withStatus("vehicle", {
      key: "vehicle",
      label: "차량비",
      amount: ctx.tourDays * input.vehicleCostPerDay,
      note: `${ctx.tourDays}일 × ${money(input.vehicleCostPerDay)}`,
    }),
    withStatus("guide", {
      key: "guide",
      label: "가이드비",
      amount: ctx.tourDays * input.guideCostPerDay,
      note: `${ctx.tourDays}일 × ${money(input.guideCostPerDay)}`,
    }),
    withStatus("other", { key: "other", label: "기타 고정비", amount: input.otherFixedCost }),
  ];

  if (ctx.includeLodging) {
    const units = lodgingUnitsFor(n, input.guestsPerUnit);
    const unitLabel = input.lodgingType === "bnb" ? "유닛" : "실";
    const segments = lodgingSegments(input, ctx.lodgingStays);
    const first = segments[0];
    const note =
      segments.length === 1 && first
        ? `${units}${unitLabel} × ${first.nights}박 × ${money(first.rate)}`
        : `${units}${unitLabel} × (${segments.map((sg) => `${sg.city || "기타"} ${sg.nights}박 × ${money(sg.rate)}`).join(" + ")})`;
    lines.push(
      withStatus("lodging", {
        key: "lodging",
        label: input.lodgingType === "bnb" ? "숙박비 (BnB)" : "숙박비 (호텔)",
        amount: units * lodgingCostPerUnit(segments),
        note,
      }),
    );
    if (input.lodgingType === "bnb" && input.cleaningFeePerUnit > 0) {
      lines.push(
        withStatus("lodging", {
          key: "lodging-cleaning",
          label: "청소비",
          amount: units * input.cleaningFeePerUnit,
          note: `${units}유닛 × ${money(input.cleaningFeePerUnit)}`,
        }),
      );
    }
    if (input.cityTaxPerPersonPerNight > 0) {
      lines.push(
        withStatus("lodging", {
          key: "lodging-tax",
          label: "숙박세",
          amount: n * input.cityTaxPerPersonPerNight * input.nights,
          note: `${n}명 × ${input.nights}박 × ${money(input.cityTaxPerPersonPerNight)}`,
        }),
      );
    }
  }

  if (ctx.includeFlight) {
    lines.push(
      withStatus("flight", {
        key: "flight",
        label: "항공료",
        amount: n * input.flightPricePerPerson,
        note: `1인 ${money(input.flightPricePerPerson)} × ${n}명`,
      }),
    );
  }

  lines.push(
    {
      key: "admission",
      label: "입장·체험료",
      amount: ctx.admissionPerPerson * n,
      note: `1인 ${money(ctx.admissionPerPerson)} × ${n}명`,
    },
    {
      key: "meal",
      label: "식대",
      amount: ctx.mealPerPerson * n,
      note: `1인 ${money(ctx.mealPerPerson)} × ${n}명`,
    },
    { key: "tip", label: "팁", amount: input.tipPerPerson * n },
    { key: "insurance", label: "보험료", amount: input.insurancePerPerson * n },
    {
      key: "contingency",
      label: "예비비",
      amount: variablePerPerson * n * ctx.contingency,
      note: `일정 변동비의 ${input.contingencyRate}%`,
    },
  );

  return lines;
}

function totalCost(lines: CostLine[], includeUndecided: boolean): number {
  return lines.reduce((sum, l) => sum + (l.excluded && !includeUndecided ? 0 : l.amount), 0);
}

/**
 * 원가로 가격 시나리오를 만든다.
 *  - 목표 마진 모드: 판매가 × (1 − 마진율 − 카드수수료율) = 총 원가 로 역산해 통화 단위로 올림
 *  - 판매가 입력 모드: 입력한 1인 판매가 그대로, 실제 마진을 계산
 */
function scenarioFor(n: number, cost: number, ctx: Context): QuoteScenario {
  const pricePerPerson =
    ctx.input.pricingMode === "fixed_price"
      ? ctx.input.fixedPricePerPerson
      : roundUpPrice(cost / (1 - ctx.margin - ctx.cardFee) / n, ctx.input.currency);
  const totalPrice = pricePerPerson * n;
  const cardFee = totalPrice * ctx.cardFee;
  const profit = totalPrice - cardFee - cost;

  return {
    travelers: n,
    baseCost: cost,
    costPerPerson: cost / n,
    cardFee,
    profit,
    totalPrice,
    pricePerPerson,
    actualMarginRate: totalPrice > 0 ? (profit / totalPrice) * 100 : 0,
  };
}

/** 1인 가격 `price`로 팔 때 이익률 `targetMargin`을 달성하는 최소 인원. 달성 불가면 null */
function minTravelersFor(price: number, targetMargin: number, ctx: Context): number | null {
  if (price <= 0) return null;
  for (let n = 1; n <= MAX_SEARCH_TRAVELERS; n++) {
    const revenue = n * price;
    const profit = revenue * (1 - ctx.cardFee) - totalCost(buildLines(n, ctx), false);
    if (profit / revenue >= targetMargin - 1e-9) return n;
  }
  return null;
}

export function calculateQuote(input: TripInput, days: DayPlan[], pmChoice: PmChoice): QuoteResult {
  const margin = input.targetMarginRate / 100;
  const cardFee = input.cardFeeRate / 100;
  const contingency = input.contingencyRate / 100;

  if (margin + cardFee >= 1) {
    return {
      ok: false,
      error: "목표 마진율과 카드 수수료의 합이 100% 이상이라 판매가를 계산할 수 없습니다. 값을 낮춰 주세요.",
    };
  }
  if (input.pricingMode === "fixed_price" && input.fixedPricePerPerson <= 0) {
    return { ok: false, error: "판매가 입력 모드입니다. 왼쪽 '가격 정책'에서 1인 판매가를 입력해 주세요." };
  }

  const travelers = Math.max(1, Math.round(input.travelers));
  const { admissionPerPerson, mealPerPerson } = sumItineraryCosts(days, pmChoice);
  // 차량·가이드는 항공 이동만 있는 날을 뺀 "지상 일정 일수"만큼 든다. 직접 지정하면 그 값을 쓴다.
  const tourDays =
    input.groundDaysOverride > 0
      ? Math.round(input.groundDaysOverride)
      : days.length > 0
        ? groundDays(days, pmChoice)
        : input.days;

  const ctx: Context = {
    input,
    lodgingStays: overnightNights(days),
    tourDays,
    admissionPerPerson,
    mealPerPerson,
    includeLodging: input.packageType !== "land",
    includeFlight: input.packageType === "full",
    contingency,
    cardFee,
    margin,
  };

  const lines = buildLines(travelers, ctx);
  const scenario = scenarioFor(travelers, totalCost(lines, false), ctx);

  // 미정 항목(금액이 있는 것)을 포함했을 때의 가격 — 기본 가격과 함께 범위로 보여준다
  const undecidedLines = lines.filter((l) => l.excluded && l.amount > 0);
  const withUndecided =
    undecidedLines.length > 0 ? scenarioFor(travelers, totalCost(lines, true), ctx) : null;

  const sizes = [...new Set([...MATRIX_SIZES, travelers])].sort((a, b) => a - b);
  const matrix = sizes.map((n) => scenarioFor(n, totalCost(buildLines(n, ctx), false), ctx));

  const warnings: string[] = [];
  if (input.vehicleCostPerDay + input.guideCostPerDay === 0) {
    warnings.push("차량비와 가이드비가 0으로 입력되어 원가가 실제보다 낮게 계산됩니다.");
  }
  if (admissionPerPerson + mealPerPerson === 0 && !activeItems(days, pmChoice).some((i) => i.payment === "local")) {
    warnings.push("일정의 입장료·식대가 모두 0입니다. 일정표에서 금액을 확인해 주세요.");
  }
  if (ctx.includeLodging) {
    const segments = lodgingSegments(input, ctx.lodgingStays);
    const unpriced = segments.filter((sg) => sg.rate === 0);
    if (unpriced.length === 1 && segments.length === 1) {
      warnings.push("숙박이 포함된 구성인데 1박 요금이 0입니다. 숙박 요금을 입력하거나 AI 추정을 사용하세요.");
    } else if (unpriced.length > 0) {
      warnings.push(`도시별 숙박 요금 중 0인 구간(${unpriced.map((sg) => sg.city || "기타").join(", ")})이 있어 숙박비가 실제보다 낮게 계산됩니다.`);
    }
  }
  if (ctx.includeLodging && input.nights === 0) {
    warnings.push("숙박이 포함된 구성인데 박수가 0입니다.");
  }
  if (ctx.includeFlight && input.flightPricePerPerson === 0) {
    warnings.push("풀패키지인데 항공료가 0입니다. 항공료를 입력하거나 AI 추정을 사용하세요.");
  }
  const undecidedZero = lines.filter((l) => l.excluded && l.amount === 0 && l.status === "undecided");
  if (undecidedZero.length > 0 && ctx.includeLodging) {
    // 금액을 아예 모르는 미정 항목은 가격에 반영할 수 없다
    warnings.push(`${[...new Set(undecidedZero.map((l) => l.label))].join(", ")}은(는) 미정이고 금액도 없어 가격에 반영되지 않았습니다.`);
  }
  if (undecidedLines.length > 0) {
    warnings.push(
      `미정 항목(${[...new Set(undecidedLines.map((l) => l.label))].join(", ")})은 기본 가격에서 제외되었습니다. 견적서에서 포함 시 가격을 함께 확인하세요.`,
    );
  }
  if (input.currency !== "KRW" && input.exchangeRateToKrw <= 0) {
    warnings.push("원화 환율이 0이라 원화 환산 금액을 표시하지 않습니다.");
  }

  return {
    ok: true,
    travelers,
    groundDays: tourDays,
    packageType: input.packageType,
    pricingMode: input.pricingMode,
    lodgingUnits: ctx.includeLodging ? lodgingUnitsFor(travelers, input.guestsPerUnit) : 0,
    lines,
    scenario,
    withUndecided,
    undecidedLabels: [...new Set(undecidedLines.map((l) => l.label))],
    matrix,
    breakEvenTravelers: minTravelersFor(scenario.pricePerPerson, 0, ctx),
    targetMarginTravelers: minTravelersFor(scenario.pricePerPerson, margin, ctx),
    ourIncludes: {
      guide: input.guideCostPerDay > 0,
      vehicle: input.vehicleCostPerDay > 0,
      admission: admissionPerPerson > 0,
      meals: mealPerPerson > 0,
      hotel: ctx.includeLodging,
      flight: ctx.includeFlight,
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
