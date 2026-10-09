import { competitorPriceInOurScope, ourPolicy, POLICY_LABELS } from "@/lib/competitorDiff";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import { samePlace } from "@/lib/places";
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
  /** 이 경쟁 상품에만 있고 우리 일정에 없는 방문지 */
  theirOnly: string[];
  /** 상품 특징 한 줄 */
  highlight?: string;
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
  /** 경쟁 상품 여러 곳이 가는데 우리 일정에 없는 방문지 (가는 곳 수 많은 순) */
  missingPopular: { name: string; count: number }[];
  /** 경쟁 상품 전체와 견준 정리 — 우리가 나은 점 / 경쟁 상품이 나은 점 */
  summary: { strengths: string[]; weaknesses: string[] };
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
    theirOnly: [],
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
      theirOnly: theirPlaces.filter((t) => !places.some((p) => samePlace(p, t))),
      ...(c.highlight ? { highlight: c.highlight } : {}),
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

  const knowPlaces = competitors.some((c) => (c.places ?? []).length > 0);
  // 경쟁 상품 여러 곳(1~2곳 비교면 1곳, 그 이상이면 절반 이상)이 가는데 우리에겐 없는 곳
  const rivals = columns.filter((c) => !c.isOurs);
  const popular: { name: string; count: number }[] = [];
  for (const c of rivals)
    for (const t of c.theirOnly) {
      const hit = popular.find((p) => samePlace(p.name, t));
      if (hit) hit.count += 1;
      else popular.push({ name: t, count: 1 });
    }
  const need = rivals.length <= 2 ? 1 : Math.ceil(rivals.length / 2);
  const missingPopular = popular.filter((p) => p.count >= need).sort((a, b) => b.count - a.count).slice(0, 6);

  return {
    columns,
    verdicts,
    position,
    onlyOurs: knowPlaces ? onlyOurs : [],
    missingPopular,
    summary: summarize(input, quote.ourIncludes, policy, ours, rivals, knowPlaces ? onlyOurs : [], missingPopular),
  };
}

/** 경쟁 상품 전체와 견준 우리 강점·약점 (몇 곳 대비인지 함께) */
function summarize(
  input: TripInput,
  ourIncludes: CompetitorIncludes,
  policy: ReturnType<typeof ourPolicy>,
  ours: CompareColumn,
  rivals: CompareColumn[],
  onlyOurs: string[],
  missingPopular: { name: string; count: number }[],
): TourCompare["summary"] {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const n = rivals.length;
  const of = (k: number) => (k === n ? `${n}곳 모두` : `${n}곳 중 ${k}곳`);
  /** "2곳 모두 …" / "3곳 중 1곳은 …" (주어로 쓸 때) */
  const who = (k: number) => (k === n ? `${n}곳 모두` : `${n}곳 중 ${k}곳은`);

  const priced = rivals.filter((c) => c.price !== null);
  if (ours.price !== null && priced.length > 0) {
    const cheaper = priced.filter((c) => c.price! > ours.price! * 1.03).length;
    const pricier = priced.filter((c) => c.price! < ours.price! * 0.97).length;
    const lo = Math.min(...priced.map((c) => c.price!));
    const hi = Math.max(...priced.map((c) => c.price!));
    const range = `경쟁 같은 조건 1인 ${Math.round(lo).toLocaleString("ko-KR")}~${Math.round(hi).toLocaleString("ko-KR")}`;
    if (cheaper > 0) strengths.push(`가격: ${of(cheaper)}보다 저렴 (${range})`);
    if (pricier > 0) weaknesses.push(`가격: ${of(pricier)}보다 비쌈 (${range})`);
  }

  const og = input.packageType === "land" ? null : input.lodgingType === "resort" ? 5 : GRADE_NUM[input.hotelGrade];
  if (og) {
    const grades = rivals.map((c) => gradeOf(c.hotelGrade)).filter((g): g is number => g !== null);
    const lower = grades.filter((g) => g < og).length;
    const higher = grades.filter((g) => g > og).length;
    if (lower > 0) strengths.push(`호텔: ${og}성으로 ${of(lower)}보다 등급 높음`);
    if (higher > 0) weaknesses.push(`호텔: ${who(higher)} 더 높은 등급`);
  }

  for (const k of INCLUDE_KEYS) {
    const without = rivals.filter((c) => !c.includes[k]).length;
    const withIt = rivals.filter((c) => c.includes[k]).length;
    if (ourIncludes[k] && without > 0) strengths.push(`${INCLUDE_LABELS[k]} 포함 (${who(without)} 불포함)`);
    if (!ourIncludes[k] && withIt > 0) weaknesses.push(`${INCLUDE_LABELS[k]} 불포함 (${who(withIt)} 포함)`);
  }

  const shopSome = rivals.filter((c) => c.shopping === "some").length;
  const shopNone = rivals.filter((c) => c.shopping === "none").length;
  if (policy.shopping === "none" && shopSome > 0) strengths.push(`노쇼핑 (${who(shopSome)} 쇼핑 있음)`);
  if (policy.shopping === "some" && shopNone > 0) weaknesses.push(`쇼핑 일정 있음 (${who(shopNone)} 노쇼핑)`);
  const optSome = rivals.filter((c) => c.optionTour === "some").length;
  const optNone = rivals.filter((c) => c.optionTour === "none").length;
  if (policy.optionTour === "none" && optSome > 0) strengths.push(`노옵션 (${who(optSome)} 선택관광 있음)`);
  if (policy.optionTour === "some" && optNone > 0) weaknesses.push(`선택관광 있음 (${who(optNone)} 노옵션)`);

  const withPlaces = rivals.filter((c) => c.places.length > 0);
  if (withPlaces.length > 0) {
    const avg = withPlaces.reduce((s, c) => s + c.places.length, 0) / withPlaces.length;
    if (ours.places.length >= avg + 2) strengths.push(`방문지가 더 많음 (우리 ${ours.places.length}곳, 경쟁 평균 ${Math.round(avg)}곳)`);
    if (ours.places.length <= avg - 2) weaknesses.push(`방문지가 적음 (우리 ${ours.places.length}곳, 경쟁 평균 ${Math.round(avg)}곳)`);
  }
  if (onlyOurs.length > 0) strengths.push(`우리만 가는 곳: ${onlyOurs.slice(0, 5).join(", ")}${onlyOurs.length > 5 ? ` 외 ${onlyOurs.length - 5}곳` : ""}`);
  if (missingPopular.length > 0)
    weaknesses.push(`경쟁 상품은 가는데 우리에겐 없는 곳: ${missingPopular.map((p) => `${p.name}(${p.count}곳)`).join(", ")}`);

  const longer = rivals.filter((c) => c.span && Number(/(\d+)\s*박/.exec(c.span)?.[1] ?? 0) > input.nights).length;
  if (longer > 0) weaknesses.push(`일정 길이: ${who(longer)} 더 긴 일정 (같은 가격대면 하루 더 머무는 상품)`);

  return { strengths, weaknesses };
}

export const policyLabel = (p: TourPolicy) => POLICY_LABELS[p];
