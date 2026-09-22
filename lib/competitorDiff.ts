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
  };
}

/** 비교를 같은 조건으로 맞추기 위해 우리 가격에 더한 항목 */
export interface Adjustment {
  label: string;
  amount: number;
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
  /** 경쟁사에만 포함된 항목의 우리 쪽 비용을 더한 1인 가격 */
  adjustedOurPrice: number;
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
 * 경쟁사에만 들어 있는 항목(항공·숙박)은 우리 쪽 추정 비용을 더해 같은 선에서 비교하고,
 * 그래도 우리가 비싸면 그 이유가 될 만한 항목을 모은다.
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

  // 경쟁사에만 포함된 항목을 우리 가격에 더해 조건을 맞춘다 (금액을 아는 항공·숙박만)
  if (competitor.includes.flight && !quote.ourIncludes.flight) {
    if (input.flightPricePerPerson > 0) adjustments.push({ label: "왕복 항공", amount: input.flightPricePerPerson });
    else unpriced.push("왕복 항공");
  }
  if (competitor.includes.hotel && !quote.ourIncludes.hotel) {
    const lodging = lodgingPerPerson(quote);
    if (lodging > 0) adjustments.push({ label: "숙박", amount: lodging });
    else unpriced.push("숙박");
  }

  const adjustedOurPrice = our + adjustments.reduce((sum, a) => sum + a.amount, 0);
  const adjustedDiff = competitor.price > 0 ? competitor.price - adjustedOurPrice : null;

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

  if (unpriced.length > 0) {
    reasons.push({ kind: "info", text: `${unpriced.join(", ")} 금액을 몰라 같은 조건으로 맞추지 못했습니다.` });
  }
  if (quote.travelers > 0 && quote.travelers <= 8) {
    reasons.push({
      kind: "info",
      text: `우리는 ${quote.travelers}명 기준이라 차량·가이드 고정비가 1인당 크게 붙습니다. 대형사 모객 상품과는 원가 구조가 다릅니다.`,
    });
  }

  return { competitor, rawDiff, adjustedOurPrice, adjustments, unpriced, adjustedDiff, reasons };
}

export function analyzeCompetitors(
  competitors: Competitor[],
  quote: QuoteData,
  input: TripInput,
  policy: OurPolicy,
): CompetitorDiff[] {
  return competitors.map((c) => analyzeCompetitor(c, quote, input, policy));
}

/** 가격이 입력된 경쟁사 중 가장 싼 곳과의 조건 보정 차이 (요약 문구용) */
export function cheapestGap(diffs: CompetitorDiff[]): CompetitorDiff | null {
  const priced = diffs.filter((d) => d.adjustedDiff !== null);
  if (priced.length === 0) return null;
  return priced.reduce((best, d) => ((d.adjustedDiff ?? 0) < (best.adjustedDiff ?? 0) ? d : best));
}
