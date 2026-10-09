import { localPayRows } from "@/lib/fees";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import type { Competitor, CompetitorIncludes, CourseMeta, DayPlan, QuoteData, TourPolicy, TripInput } from "@/types";

export const POLICY_LABELS: Record<TourPolicy, string> = {
  none: "없음",
  some: "있음",
  unknown: "확인 안 됨",
};

const INCLUDE_LABELS: Record<keyof CompetitorIncludes, string> = {
  flight: "왕복 항공",
  hotel: "숙박",
  meals: "식사",
  vehicle: "전용 차량",
  guide: "가이드",
  admission: "입장료",
};

/** 우리 상품의 쇼핑·선택관광 정책 */
export interface OurPolicy {
  shopping: TourPolicy;
  /** 일정에 들어 있는 쇼핑 성격 항목 수 */
  shoppingCount: number;
  optionTour: TourPolicy;
  /** 판매가에 포함되지 않고 현지에서 따로 내는 경비(현지 지불 항목) 1인 합계 */
  localPayPerPerson: number;
}

/**
 * 우리 상품의 쇼핑·옵션 정책을 일정과 입력에서 읽는다.
 * 붙여넣은 코스가 "노쇼핑"을 명시했으면 그 표기를 따르고, 아니면 일정의 쇼핑 항목 수로 판단한다.
 */
export function ourPolicy(days: DayPlan[], pmChoice: PmChoice, input: TripInput, meta: CourseMeta | null): OurPolicy {
  const shoppingItems = days.flatMap((day) => dayItems(day, pmChoice)).filter((item) => item.type === "shopping");
  const shopping: TourPolicy = meta?.noShopping ? "none" : shoppingItems.length > 0 ? "some" : "none";
  return {
    shopping,
    shoppingCount: shoppingItems.length,
    optionTour: input.options.length > 0 ? "some" : "none",
    localPayPerPerson: localPayRows(days, pmChoice).perPerson,
  };
}

/** 비교를 같은 조건으로 맞추기 위해 한쪽 가격에 더하거나 뺀 항목 */
export interface Adjustment {
  label: string;
  /** 더하면 양수, 빼면 음수 */
  amount: number;
  /** 어느 쪽 가격을 조정했는지 */
  side: "ours" | "theirs";
}

export interface DiffReason {
  /** premium: 우리가 비쌀 만한 이유 / gap: 경쟁사가 앞서는 점 / info: 참고 */
  kind: "premium" | "gap" | "info";
  text: string;
}

export interface CompetitorDiff {
  competitor: Competitor;
  /** 경쟁사 가격 − 우리 가격. 양수면 우리가 저렴. 가격 미입력이면 null */
  rawDiff: number | null;
  /** 같은 조건으로 맞춘 우리 1인 가격 */
  adjustedOurPrice: number;
  /** 같은 조건으로 맞춘 경쟁사 1인 가격 */
  adjustedCompetitorPrice: number;
  adjustments: Adjustment[];
  /** 금액을 몰라 맞추지 못한 항목 이름 */
  unpriced: string[];
  /** 조건을 맞춘 뒤의 차이. 양수면 우리가 저렴 */
  adjustedDiff: number | null;
  reasons: DiffReason[];
}

/** 견적에서 1인당 숙박비를 뽑는다 (숙박이 포함된 구성일 때만) */
function lodgingPerPerson(quote: QuoteData): number {
  const total = quote.lines.filter((line) => line.key.startsWith("lodging")).reduce((sum, line) => sum + line.amount, 0);
  return quote.travelers > 0 ? Math.round(total / quote.travelers) : 0;
}

/**
 * 경쟁사 한 곳과의 차이를 분석한다.
 * 비교 기준(input.compareBasis)에 따라 항공·숙박을 같은 범위로 맞춘 뒤 차이를 다시 계산하고,
 * 그래도 우리가 비싸면 그 이유가 될 만한 항목을 모은다.
 *  - total(총액): 한쪽에만 들어 있는 항공·숙박을 다른 쪽에도 더해 같은 범위로 맞춘다
 *  - land(랜드): 항공·숙박은 들어 있는 쪽에서 빼서 지상 일정만 비교한다
 * 표시 가격 밖에서 현지에 내는 경비(가이드 경비 등)는 양쪽 모두 실지출 기준으로 더한다.
 */
export function analyzeCompetitor(
  competitor: Competitor,
  quote: QuoteData,
  input: TripInput,
  policy: OurPolicy,
): CompetitorDiff {
  const our = quote.scenario.pricePerPerson;
  const rawDiff = competitor.price > 0 ? competitor.price - our : null;

  const adjustments: Adjustment[] = [];
  const unpriced: string[] = [];
  const basis = input.compareBasis;

  // 항공·숙박은 우리 원가 기준 금액으로 더하거나 뺀다 (금액을 모르면 맞추지 못하고 참고로만 표시)
  const parts: { key: "flight" | "hotel"; label: string; amount: number }[] = [
    { key: "flight", label: "왕복 항공", amount: input.flightPricePerPerson },
    { key: "hotel", label: "숙박", amount: lodgingPerPerson(quote) },
  ];
  for (const part of parts) {
    const ourIn = quote.ourIncludes[part.key];
    const theirIn = competitor.includes[part.key];
    const push = (side: "ours" | "theirs", sign: 1 | -1) => {
      if (part.amount > 0) adjustments.push({ label: part.label, amount: sign * part.amount, side });
      else if (!unpriced.includes(part.label)) unpriced.push(part.label);
    };
    if (basis === "total") {
      if (theirIn && !ourIn) push("ours", 1);
      if (ourIn && !theirIn) push("theirs", 1);
    } else {
      if (ourIn) push("ours", -1);
      if (theirIn) push("theirs", -1);
    }
  }

  if (policy.localPayPerPerson > 0) adjustments.push({ label: "현지 지불(우리)", amount: policy.localPayPerPerson, side: "ours" });
  if ((competitor.localPayPerPerson ?? 0) > 0) {
    adjustments.push({ label: "현지 지불(경쟁사)", amount: competitor.localPayPerPerson ?? 0, side: "theirs" });
  }

  const sumFor = (side: "ours" | "theirs") => adjustments.filter((a) => a.side === side).reduce((sum, a) => sum + a.amount, 0);
  const adjustedOurPrice = Math.max(0, our + sumFor("ours"));
  const adjustedCompetitorPrice = Math.max(0, competitor.price + sumFor("theirs"));
  const adjustedDiff = competitor.price > 0 ? adjustedCompetitorPrice - adjustedOurPrice : null;

  const reasons: DiffReason[] = [];
  const keys = Object.keys(INCLUDE_LABELS) as (keyof CompetitorIncludes)[];

  const onlyOurs = keys.filter((k) => quote.ourIncludes[k] && !competitor.includes[k]).map((k) => INCLUDE_LABELS[k]);
  const onlyTheirs = keys.filter((k) => !quote.ourIncludes[k] && competitor.includes[k]).map((k) => INCLUDE_LABELS[k]);

  if (onlyOurs.length > 0) reasons.push({ kind: "premium", text: `우리만 포함: ${onlyOurs.join(", ")}` });
  if (onlyTheirs.length > 0) reasons.push({ kind: "gap", text: `경쟁사만 포함: ${onlyTheirs.join(", ")}` });

  if (policy.shopping === "none" && competitor.shopping === "some") {
    reasons.push({
      kind: "premium",
      text: "우리는 쇼핑 일정이 없고 경쟁사는 있습니다. 쇼핑 수수료로 요금을 낮춘 구조라면 표시 가격만 싸 보일 수 있습니다.",
    });
  }
  if (policy.shopping === "some" && competitor.shopping === "none") {
    reasons.push({ kind: "gap", text: `경쟁사는 노쇼핑인데 우리 일정에는 쇼핑 성격 항목이 ${policy.shoppingCount}개 있습니다.` });
  }
  if (policy.optionTour === "none" && competitor.optionTour === "some") {
    reasons.push({
      kind: "premium",
      text: "우리는 선택관광이 없고 경쟁사는 있습니다. 경쟁사 표시 가격에는 현지 옵션비가 빠져 있어 실제 지출은 더 클 수 있습니다.",
    });
  }
  if (policy.optionTour === "some" && competitor.optionTour === "none") {
    reasons.push({ kind: "gap", text: "경쟁사는 노옵션인데 우리 상품에는 선택 옵션이 있습니다." });
  }
  if (competitor.shopping === "unknown" || competitor.optionTour === "unknown") {
    reasons.push({ kind: "info", text: "경쟁사의 쇼핑·선택관광 여부가 확인되지 않았습니다. 판매 페이지에서 확인해 주세요." });
  }
  if (competitor.localPayPerPerson === undefined) {
    reasons.push({
      kind: "info",
      text: "경쟁사 현지 지불 경비(가이드 경비·팁 등)는 입력되지 않아 0으로 계산했습니다. 상품 페이지에 따로 내는 경비가 있으면 경쟁사 카드에 입력하세요.",
    });
  }

  if (unpriced.length > 0) {
    reasons.push({ kind: "info", text: `${unpriced.join(", ")} 금액을 몰라 같은 조건으로 맞추지 못했습니다.` });
  }
  if (quote.travelers > 0 && quote.travelers <= 8) {
    reasons.push({
      kind: "info",
      text: `우리는 ${quote.travelers}명 기준이라 차량·가이드 고정비가 1인당 크게 붙습니다. 대형사 모객 상품과는 원가 구조가 다릅니다.`,
    });
  }

  return { competitor, rawDiff, adjustedOurPrice, adjustedCompetitorPrice, adjustments, unpriced, adjustedDiff, reasons };
}

export function analyzeCompetitors(
  competitors: Competitor[],
  quote: QuoteData,
  input: TripInput,
  policy: OurPolicy,
): CompetitorDiff[] {
  return competitors.map((c) => analyzeCompetitor(c, quote, input, policy));
}

/**
 * 경쟁사 가격을 "우리 상품과 같은 범위(우리가 포함한 항목만)"로 환산한다. 추천 판매가(경쟁력 가격)를 정할 때 쓴다.
 * 우리만 포함한 항공·숙박은 더하고 경쟁사만 포함한 것은 빼며, 현지 지불 경비 차이도 맞춘다.
 * 가격이 없거나, 맞춰야 할 항공료를 모르면(예: 우리는 랜드인데 경쟁 상품은 항공 포함, 항공료 시세 없음) null — 범위가 다른 가격을 그대로 견주지 않는다.
 */
export function competitorPriceInOurScope(competitor: Competitor, quote: QuoteData, input: TripInput, policy: OurPolicy): number | null {
  if (competitor.price <= 0) return null;
  let price = competitor.price;
  const parts: { key: "flight" | "hotel"; amount: number }[] = [
    { key: "flight", amount: input.flightPricePerPerson },
    { key: "hotel", amount: lodgingPerPerson(quote) },
  ];
  for (const part of parts) {
    const ourIn = quote.ourIncludes[part.key];
    const theirIn = competitor.includes[part.key];
    if (ourIn === theirIn) continue;
    // 항공은 늘 돈이 드는데 금액을 모르면 맞출 수 없다 (숙박 0은 당일 일정일 수 있어 그대로)
    if (part.key === "flight" && part.amount <= 0) return null;
    if (ourIn && !theirIn) price += part.amount;
    if (theirIn && !ourIn) price -= part.amount;
  }
  price += (competitor.localPayPerPerson ?? 0) - policy.localPayPerPerson;
  return Math.max(0, price);
}

/** 가격이 입력된 경쟁사 중 가장 싼 곳과의 조건 보정 차이 (요약 문구용) */
export function cheapestGap(diffs: CompetitorDiff[]): CompetitorDiff | null {
  const priced = diffs.filter((d) => d.adjustedDiff !== null);
  if (priced.length === 0) return null;
  return priced.reduce((best, d) => ((d.adjustedDiff ?? 0) < (best.adjustedDiff ?? 0) ? d : best));
}
