import { buildChannelResults, consumerPrices, DIRECT_CHANNEL_ID, feeRows, priceParamsOf, type FeeRow, type PriceParams } from "@/lib/channels";
import { formatMoney } from "@/lib/currency";
import { dayItems, groundDays, overnightNights, type PmChoice } from "@/lib/itinerary";
import { lodgingCostPerUnit, lodgingSegments } from "@/lib/lodging";
import { roundUpPrice } from "@/lib/priceRound";
import type {
  CostKey,
  CostLine,
  DayPlan,
  ItineraryItem,
  QuoteResult,
  QuoteScenario,
  TripInput,
} from "@/types";

export { roundUpPrice };

const MATRIX_SIZES = [2, 4, 6, 8, 10];
/** 손익분기 인원을 찾을 때 확인하는 최대 인원 */
const MAX_SEARCH_TRAVELERS = 100;

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

export interface LodgingRooms {
  /** 숙박 원가에 넣는 방 수 (2인 1실 기준이면 홀수 인원에서 0.5실처럼 나뉠 수 있다) */
  costRooms: number;
  /** 실제로 예약할 방 수 */
  bookedRooms: number;
  /** 1인실을 쓰는 인원 (싱글차지 대상) */
  singles: number;
  /** 3인 1실로 넣는 엑스트라베드 수 */
  extraBeds: number;
}

/**
 * 숙박 원가에 넣는 방 수 — 패키지 1인 요금은 "2인 1실 기준"이 표준이라, 호텔·리조트는 인원 ÷ 2실로 나눈다.
 * 홀수 인원으로 남는 1명은 정책에 따라:
 *  - single(기본): 1인 요금에는 반 실만 넣고(모두 같은 2인 1실 요금), 남는 반 실은 싱글차지로 따로 받는다
 *  - triple: 3인 1실로 넣고 엑스트라베드 요금을 더한다
 *  - share: 남는 방값을 전체 인원이 나눠 낸다 (방 수 = 올림)
 * BnB(유닛)·1실 1인 기준은 올림 그대로.
 */
export function lodgingRoomsFor(lodgers: number, input: Pick<TripInput, "guestsPerUnit" | "lodgingType" | "oddRoomPolicy">): LodgingRooms {
  const g = Math.max(1, Math.round(input.guestsPerUnit));
  const people = Math.max(0, Math.round(lodgers));
  const ceil = Math.ceil(people / g);
  const rem = people % g;
  if (input.lodgingType === "bnb" || g < 2 || rem === 0 || input.oddRoomPolicy === "share") {
    return { costRooms: ceil, bookedRooms: ceil, singles: 0, extraBeds: 0 };
  }
  const full = Math.floor(people / g);
  if (input.oddRoomPolicy === "triple" && g === 2 && full > 0) {
    return { costRooms: full, bookedRooms: full, singles: 0, extraBeds: rem };
  }
  return { costRooms: people / g, bookedRooms: ceil, singles: rem, extraBeds: 0 };
}

/** 인원에 맞는 방/유닛 수 (올림) */
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
  /** 직판을 맨 앞에 둔 판매 채널별 수수료 */
  rows: FeeRow[];
  priceParams: PriceParams;
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
    source: input.costSource?.[key],
  });

  const variablePerPerson =
    ctx.admissionPerPerson + ctx.mealPerPerson + input.tipPerPerson + input.insurancePerPerson;

  // 랜드사 공급가로 시작하면 숙박·차량·가이드·입장료·식대가 공급가에 들어 있다고 보고 공급가 한 줄로 계산한다
  if (input.pricingMode === "supplier") return supplierLines(n, ctx, withStatus, money);

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
    const rooms = lodgingRoomsFor(n, input);
    const units = rooms.costRooms;
    const unitLabel = input.lodgingType === "bnb" ? "유닛" : "실";
    const segments = lodgingSegments(input, ctx.lodgingStays);
    const first = segments[0];
    const roomsText = Number.isInteger(units) ? `${units}${unitLabel}` : `${units.toFixed(1)}${unitLabel}분`;
    const basis =
      input.lodgingType !== "bnb" && input.guestsPerUnit >= 2
        ? ` (${Math.round(input.guestsPerUnit)}인 1실 기준${rooms.singles > 0 ? ` · ${rooms.singles}명 싱글차지 별도` : ""}${rooms.extraBeds > 0 ? ` · 3인 1실 ${rooms.extraBeds}실` : ""})`
        : "";
    const note =
      (segments.length === 1 && first
        ? `${roomsText} × ${first.nights}박 × ${money(first.rate)}`
        : `${roomsText} × (${segments.map((sg) => `${sg.city || "기타"} ${sg.nights}박 × ${money(sg.rate)}`).join(" + ")})`) + basis;
    lines.push(
      withStatus("lodging", {
        key: "lodging",
        label: input.lodgingType === "bnb" ? "숙박비 (BnB)" : "숙박비 (호텔)",
        amount: units * lodgingCostPerUnit(segments),
        note,
      }),
    );
    if (rooms.extraBeds > 0 && input.extraBedPerNight > 0) {
      lines.push(
        withStatus("lodging", {
          key: "lodging-extrabed",
          label: "엑스트라베드",
          amount: rooms.extraBeds * input.extraBedPerNight * input.nights,
          note: `${rooms.extraBeds}개 × ${input.nights}박 × ${money(input.extraBedPerNight)}`,
        }),
      );
    }
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

  // 현지 통화 원가를 원화로 바꿔 파는 상품은 환율이 오르면 마진이 줄어든다. 그 위험을 원가에 미리 얹는다.
  if (input.currency !== "KRW" && input.fxBufferRate > 0) {
    const base = totalCost(lines, false);
    lines.push({
      key: "fx-buffer",
      label: "환율 변동 버퍼",
      amount: base * (input.fxBufferRate / 100),
      note: `원가 합계의 ${input.fxBufferRate}%`,
    });
  }

  return lines;
}

/** 랜드사 공급가 모드의 원가: 공급가(1인, 2인 1실 기준) + 항공(포함 시) + 팁·보험·기타 고정비 + 환율 버퍼 */
function supplierLines(
  n: number,
  ctx: Context,
  withStatus: (key: CostKey, line: Omit<CostLine, "status" | "excluded">) => CostLine,
  money: (v: number) => string,
): CostLine[] {
  const { input } = ctx;
  const lines: CostLine[] = [
    { key: "supplier", label: "랜드사 공급가", amount: input.supplierPricePerPerson * n, note: `1인 ${money(input.supplierPricePerPerson)} × ${n}명 (2인 1실 기준)`, status: "confirmed" },
  ];
  if (ctx.includeFlight) {
    lines.push(withStatus("flight", { key: "flight", label: "항공료", amount: n * input.flightPricePerPerson, note: `1인 ${money(input.flightPricePerPerson)} × ${n}명` }));
  }
  lines.push(
    withStatus("other", { key: "other", label: "기타 고정비", amount: input.otherFixedCost }),
    { key: "tip", label: "팁", amount: input.tipPerPerson * n },
    { key: "insurance", label: "보험료", amount: input.insurancePerPerson * n },
  );
  if (input.currency !== "KRW" && input.fxBufferRate > 0) {
    const base = totalCost(lines, false);
    lines.push({ key: "fx-buffer", label: "환율 변동 버퍼", amount: base * (input.fxBufferRate / 100), note: `원가 합계의 ${input.fxBufferRate}%` });
  }
  return lines;
}

function totalCost(lines: CostLine[], includeUndecided: boolean): number {
  return lines.reduce((sum, l) => sum + (l.excluded && !includeUndecided ? 0 : l.amount), 0);
}

/**
 * 원가로 가격 시나리오를 만든다.
 *  - 목표 마진 모드: 판매가 × (1 − 마진율 − 카드수수료율) = 총 원가 로 역산해 통화 단위로 올림
 *    (채널 가격을 "동일가"로 두면 수수료가 가장 큰 채널 기준 가격이 직판가가 된다)
 *  - 판매가 입력 모드: 입력한 1인 판매가 그대로, 실제 마진을 계산
 */
function scenarioFor(n: number, cost: number, ctx: Context): QuoteScenario {
  const prices = consumerPrices(ctx.rows, n, cost, ctx.priceParams);
  const pricePerPerson = prices.get(DIRECT_CHANNEL_ID) ?? 0;
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
    channelPrices: Object.fromEntries(prices),
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
    return { ok: false, error: "판매가에서 시작하는 견적입니다. '가격 정책'에서 1인 판매가(2인 1실 기준)를 입력해 주세요." };
  }
  if (input.pricingMode === "wholesale" && input.wholesalePricePerPerson <= 0) {
    return { ok: false, error: "B2B 도매가에서 시작하는 견적입니다. '가격 정책'에서 거래처에 넘기는 1인 도매가를 입력해 주세요." };
  }
  if (input.pricingMode === "supplier" && input.supplierPricePerPerson <= 0) {
    return { ok: false, error: "랜드사 공급가에서 시작하는 견적입니다. '가격 정책'에서 1인 공급가(2인 1실 기준)를 입력해 주세요." };
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
    // 도매가(거래처 B2B)는 계좌로 받는다고 보고 카드·플랫폼 수수료를 빼지 않는다
    cardFee: input.pricingMode === "wholesale" ? 0 : cardFee,
    margin,
    rows: input.pricingMode === "wholesale" ? feeRows({ channels: [], cardFeeRate: 0 }) : feeRows(input),
    priceParams: priceParamsOf(input),
  };

  const lines = buildLines(travelers, ctx);
  const scenario = scenarioFor(travelers, totalCost(lines, false), ctx);
  const channels = buildChannelResults(ctx.rows, travelers, (k) => totalCost(buildLines(k, ctx), false), ctx.priceParams);

  // 미정 항목(금액이 있는 것)을 포함했을 때의 가격 — 기본 가격과 함께 범위로 보여준다
  const undecidedLines = lines.filter((l) => l.excluded && l.amount > 0);
  const withUndecided =
    undecidedLines.length > 0 ? scenarioFor(travelers, totalCost(lines, true), ctx) : null;

  const sizes = [...new Set([...MATRIX_SIZES, travelers])].sort((a, b) => a - b);
  const matrix = sizes.map((n) => scenarioFor(n, totalCost(buildLines(n, ctx), false), ctx));

  const warnings: string[] = [];
  if (input.pricingMode !== "supplier" && input.vehicleCostPerDay + input.guideCostPerDay === 0) {
    warnings.push("차량비와 가이드비가 0으로 입력되어 원가가 실제보다 낮게 계산됩니다.");
  }
  if (input.pricingMode !== "supplier" && admissionPerPerson + mealPerPerson === 0 && !activeItems(days, pmChoice).some((i) => i.payment === "local")) {
    warnings.push("일정의 입장료·식대가 모두 0입니다. 일정표에서 금액을 확인해 주세요.");
  }
  if (ctx.includeLodging && input.pricingMode !== "supplier") {
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
  for (const channel of channels) {
    if (channel.isDirect) continue;
    if (channel.requiredPrice === null) {
      warnings.push(`'${channel.name}'은(는) 수수료와 목표 마진의 합이 100% 이상이라 목표 마진을 맞출 판매가가 없습니다.`);
    } else if (channel.profit < 0) {
      warnings.push(`'${channel.name}'에서 지금 가격으로 팔면 손실입니다. 수수료 ${channel.feeRate.toFixed(1)}%를 뺀 정산액이 원가보다 적습니다.`);
    }
  }

  return {
    ok: true,
    travelers,
    groundDays: tourDays,
    packageType: input.packageType,
    pricingMode: input.pricingMode,
    lodgingUnits: ctx.includeLodging && input.pricingMode !== "supplier" ? lodgingRoomsFor(travelers, input).bookedRooms : 0,
    roomCostPerUnit: ctx.includeLodging && input.pricingMode !== "supplier" ? roomCostPerUnit(input, ctx.lodgingStays) : 0,
    singleTravelers: ctx.includeLodging && input.pricingMode !== "supplier" ? lodgingRoomsFor(travelers, input).singles : 0,
    partnerConsumerPrice:
      input.pricingMode === "wholesale" && input.partnerMarginRate < 100
        ? roundUpPrice(input.wholesalePricePerPerson / (1 - Math.max(0, input.partnerMarginRate) / 100), input.currency)
        : null,
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
    channels,
    warnings,
  };
}

/** 1실(유닛)이 전체 숙박 기간 동안 내는 요금 (청소비 포함) */
function roomCostPerUnit(input: TripInput, stays: { city: string; nights: number }[]): number {
  return lodgingCostPerUnit(lodgingSegments(input, stays)) + (input.lodgingType === "bnb" ? input.cleaningFeePerUnit : 0);
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
