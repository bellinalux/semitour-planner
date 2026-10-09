import { competitorPriceInOurScope, ourPolicy, POLICY_LABELS } from "@/lib/competitorDiff";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import { documentQuote } from "@/lib/pricing";
import type { CompetitorIncludes, CourseMeta, DayPlan, HotelGrade, QuoteData, TourPolicy, TripInput } from "@/types";

/**
 * 투어 비교표 — 우리 상품과 경쟁 상품을 같은 줄에 놓고 가격(같은 조건으로 맞춘 1인, 2인 1실 기준)·일수·호텔 등급·포함 내역·
 * 쇼핑/옵션·방문지(겹치는 곳)를 비교하고, 경쟁 상품마다 한 줄 판정을 붙인다.
 */

export interface CompareColumn {
  id: string;
  name: string;
  isOurs: boolean;
  /** 우리 상품과 같은 조건(우리가 포함한 항목·현지 지불)으로 맞춘 1인 가격 */
  price: number | null;
  /** 표시 가격 (조건을 맞추기 전) */
  listedPrice: number | null;
  span: string;
  hotelGrade: string;
  includes: CompetitorIncludes;
  shopping: TourPolicy;
  optionTour: TourPolicy;
  places: string[];
  /** 우리 일정과 겹치는 방문지 */
  overlap: string[];
  link?: string;
}

export interface TourCompare {
  columns: CompareColumn[];
  /** 경쟁 상품마다 한 줄 판정 (columns의 경쟁 상품 순서) */
  verdicts: { id: string; text: string; tone: "good" | "bad" | "neutral" }[];
  /** 우리 가격이 경쟁 가격대에서 어디쯤인지 */
  position: string;
  /** 어느 경쟁 상품에도 없는 우리만의 방문지 */
  onlyOurs: string[];
}

const INCLUDE_LABELS: Record<keyof CompetitorIncludes, string> = {
  flight: "항공",
  hotel: "숙박",
  vehicle: "차량",
  guide: "가이드",
  meals: "식사",
  admission: "입장료",
};
export const INCLUDE_KEYS = Object.keys(INCLUDE_LABELS) as (keyof CompetitorIncludes)[];
export const includeLabel = (k: keyof CompetitorIncludes) => INCLUDE_LABELS[k];

/** 방문지 이름 비교용 (괄호·공백·기호를 뺀다) */
export function placeKey(name: string): string {
  return name
    .replace(/\(.*?\)/g, "")
    .replace(/[\s·・,./\-_'"]/g, "")
    .toLowerCase();
}

/** 두 이름이 같은 곳으로 보이는지 (한쪽이 다른 쪽을 포함하면 같다고 본다: "바나힐" ⊂ "바나힐 테마파크") */
export function samePlace(a: string, b: string): boolean {
  const x = placeKey(a);
  const y = placeKey(b);
  if (x.length < 2 || y.length < 2) return false;
  return x.includes(y) || y.includes(x);
}

/** 우리 일정의 방문지 (식사·이동·숙소·항공·자유시간 제외) */
export function ourPlaces(days: DayPlan[], pmChoice: PmChoice): string[] {
  const skip = new Set(["meal", "transfer", "hotel", "flight", "free_time"]);
  const names = days
    .flatMap((d) => dayItems(d, pmChoice))
    .filter((i) => !skip.has(i.type ?? "sightseeing"))
    .map((i) => i.name.trim());
  return [...new Set(names)].filter(Boolean);
}

const GRADE_NUM: Record<HotelGrade, number | null> = {
  any: null,
  "3": 3,
  "4": 4,
  "5": 5,
  resort: 5,
};
const gradeOf = (text: string): number | null => {
  const m = /([345])\s*성/.exec(text);
  if (m) return Number(m[1]);
  return /리조트|resort/i.test(text) ? 5 : null;
};

export function buildTourCompare(input: TripInput, days: DayPlan[], pmChoice: PmChoice, quote: QuoteData, meta: CourseMeta | null): TourCompare | null {
  const competitors = input.competitors.slice(0, 4);
  if (competitors.length === 0) return null;
  const policy = ourPolicy(days, pmChoice, input, meta);
  // 고객에게 보이는 우리 가격: 선택한 판매 채널의 소비자가 (도매가면 거래처 권장 소비자가)
  const customer = documentQuote(quote, input);
  const ourPrice = quote.partnerConsumerPrice ?? customer.scenario.pricePerPerson;
  const forCompare: QuoteData = {
    ...customer,
    scenario: { ...customer.scenario, pricePerPerson: ourPrice },
  };
  const places = ourPlaces(days, pmChoice);
  const ourGradeText =
    input.packageType === "land"
      ? "숙박 없음"
      : input.lodgingType === "resort"
        ? "리조트"
        : GRADE_NUM[input.hotelGrade]
          ? `${GRADE_NUM[input.hotelGrade]}성급`
          : "";

  const ours: CompareColumn = {
    id: "ours",
    name: "우리 상품",
    isOurs: true,
    price: ourPrice,
    listedPrice: ourPrice,
    span: `${input.nights}박 ${input.days}일`,
    hotelGrade: [ourGradeText, Object.values(input.selectedHotels)[0]?.name].filter(Boolean).join(" · "),
    includes: quote.ourIncludes,
    shopping: policy.shopping,
    optionTour: policy.optionTour,
    places,
    overlap: [],
  };

  const columns: CompareColumn[] = [ours];
  const verdicts: TourCompare["verdicts"] = [];
  competitors.forEach((c) => {
    const scoped = competitorPriceInOurScope(c, forCompare, input, policy);
    const theirPlaces = c.places ?? [];
    const overlap = places.filter((p) => theirPlaces.some((t) => samePlace(p, t)));
    columns.push({
      id: c.id,
      name: c.name,
      isOurs: false,
      price: scoped,
      listedPrice: c.price > 0 ? c.price : null,
      span: c.nights && c.days ? `${c.nights}박 ${c.days}일` : "",
      hotelGrade: c.hotelGrade ?? "",
      includes: c.includes,
      shopping: c.shopping,
      optionTour: c.optionTour,
      places: theirPlaces,
      overlap,
      link: c.source?.url,
    });

    // 판정: 같은 조건 가격 차이 + 우리가 나은 점 / 경쟁사가 나은 점
    const parts: string[] = [];
    let tone: "good" | "bad" | "neutral" = "neutral";
    if (scoped !== null) {
      const diff = Math.round(scoped - ourPrice);
      if (Math.abs(diff) < Math.max(1, ourPrice * 0.03)) parts.push("가격 비슷");
      else if (diff > 0) {
        parts.push(`우리가 1인 ${diff.toLocaleString("ko-KR")} 저렴`);
        tone = "good";
      } else {
        parts.push(`우리가 1인 ${(-diff).toLocaleString("ko-KR")} 비쌈`);
        tone = "bad";
      }
    } else parts.push("경쟁 가격 모름");
    const plus: string[] = [];
    const minus: string[] = [];
    const og = input.packageType === "land" ? null : input.lodgingType === "resort" ? 5 : GRADE_NUM[input.hotelGrade];
    const tg = gradeOf(c.hotelGrade ?? "");
    if (og && tg) {
      if (og > tg) plus.push(`호텔 등급 높음(${og}성 vs ${tg}성)`);
      if (og < tg) minus.push(`호텔 등급 낮음(${og}성 vs ${tg}성)`);
    }
    for (const k of INCLUDE_KEYS) {
      if (quote.ourIncludes[k] && !c.includes[k]) plus.push(`${INCLUDE_LABELS[k]} 포함`);
      if (!quote.ourIncludes[k] && c.includes[k]) minus.push(`${INCLUDE_LABELS[k]} 미포함`);
    }
    if (policy.shopping === "none" && c.shopping === "some") plus.push("쇼핑 없음");
    if (policy.shopping === "some" && c.shopping === "none") minus.push("쇼핑 있음");
    if (policy.optionTour === "none" && c.optionTour === "some") plus.push("선택관광 없음");
    if (plus.length) parts.push(`우리 강점: ${plus.join(", ")}`);
    if (minus.length) parts.push(`약점: ${minus.join(", ")}`);
    if (theirPlaces.length > 0) parts.push(`방문지 ${overlap.length}곳 겹침`);
    if (tone === "bad" && plus.length > 0) tone = "neutral"; // 비싸도 이유가 있으면 판단 보류
    verdicts.push({ id: c.id, text: parts.join(" · "), tone });
  });

  const priced = columns.filter((c) => !c.isOurs && c.price !== null).map((c) => c.price!);
  let position = "경쟁 가격을 아직 모릅니다";
  if (priced.length > 0 && ours.price !== null) {
    const cheaper = priced.filter((p) => p < ours.price!).length;
    const total = priced.length;
    position =
      cheaper === 0
        ? `경쟁 상품 ${total}개보다 모두 저렴합니다`
        : cheaper === total
          ? `경쟁 상품 ${total}개보다 모두 비쌉니다`
          : `경쟁 상품 ${total}개 중 ${cheaper}개보다 비싸고 ${total - cheaper}개보다 저렴합니다 (가운데 가격대)`;
  }
  const onlyOurs = places.filter((p) => !competitors.some((c) => (c.places ?? []).some((t) => samePlace(p, t))));

  return {
    columns,
    verdicts,
    position,
    onlyOurs: competitors.some((c) => (c.places ?? []).length > 0) ? onlyOurs : [],
  };
}

export const policyLabel = (p: TourPolicy) => POLICY_LABELS[p];
