import { competitorPriceInOurScope, ourPolicy } from "@/lib/competitorDiff";
import { dayMeals } from "@/lib/documents";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import { samePlace } from "@/lib/places";
import { documentQuote } from "@/lib/pricing";
import { gradeMid, gradeRangeOfText, gradeText } from "@/lib/itemTypes";
import { extraRegionsOf, ourGradeRange } from "@/lib/tourCompare";
import type { CompetitorIncludes, CourseMeta, DayPlan, QuoteData, TourPolicy, TripInput } from "@/types";

/**
 * 상품 비교 보기 — 우리 상품과 경쟁 상품을 한 화면에서 코스(날짜별 방문지)부터 금액·포함 내역까지 견준다.
 * 경쟁 상품의 날짜별 일정은 '경쟁 상품 일정 가져오기'로 판매 페이지에서 읽은 것을 쓰고, 없으면 주요 방문지만 쓴다.
 */

export type PlaceMark = "shared" | "only";

export interface CompareDay {
  day: number;
  places: { name: string; mark: PlaceMark }[];
  meals: { breakfast: string; lunch: string; dinner: string };
  free: boolean;
  otherRegion: string;
}

export interface CompareProduct {
  id: string;
  name: string;
  isOurs: boolean;
  link?: string;
  /** 표시 가격 · 같은 조건(우리 범위로 맞춘) 가격 · 우리와 차이(+면 경쟁이 비쌈) */
  listedPrice: number | null;
  scopedPrice: number | null;
  diff: number | null;
  /** 같은 조건으로 맞추며 더하고 뺀 것 (예: 항공 −445,000) */
  adjustNote: string;
  span: string;
  hotel: string;
  includes: CompetitorIncludes;
  shopping: TourPolicy;
  optionTour: TourPolicy;
  /** 포함 식사 횟수(조식 제외), 모르면 null */
  mealCount: number | null;
  freeDays: number | null;
  tipNote: string;
  /** 선택관광 목록 (이름·가격). 경쟁 상품 일정을 안 가져왔으면 null */
  optionTours: { name: string; price: string }[] | null;
  otherRegions: string[];
  /** 날짜별 코스 — 경쟁 상품 일정을 못 가져왔으면 null (주요 방문지만 places에) */
  days: CompareDay[] | null;
  places: { name: string; mark: PlaceMark }[];
  itineraryState: "ours" | "found" | "missing" | "notFetched";
  /** 그 상품과 견준 정리 — 우리가 나은 점 / 그 상품이 나은 점 / 가격 차이 이유 */
  ourBetter: string[];
  theirBetter: string[];
  priceReason: string;
}

export interface ProductCompare {
  products: CompareProduct[];
  maxDays: number;
  /** 한 줄 결론 */
  conclusion: string;
}

const SKIP = new Set(["meal", "transfer", "hotel", "flight", "free_time"]);
const won = (v: number) => Math.round(v).toLocaleString("ko-KR");
const INCLUDE_NAMES: Partial<Record<keyof CompetitorIncludes, string>> = { guide: "가이드", vehicle: "차량", meals: "식사", admission: "입장료" };

export function buildProductCompare(input: TripInput, days: DayPlan[], pmChoice: PmChoice, quote: QuoteData, meta: CourseMeta | null): ProductCompare | null {
  if (input.competitors.length === 0) return null;
  const policy = ourPolicy(days, pmChoice, input, meta);
  const customer = documentQuote(quote, input);
  const ourPrice = quote.partnerConsumerPrice ?? customer.scenario.pricePerPerson;
  const forCompare: QuoteData = { ...customer, scenario: { ...customer.scenario, pricePerPerson: ourPrice } };

  // 우리 날짜별 코스
  const ourDays = days.map((d, i) => {
    const items = dayItems(d, pmChoice);
    const meals = dayMeals(days, i, pmChoice, input);
    return {
      day: d.day,
      names: items.filter((x) => !SKIP.has(x.type ?? "sightseeing")).map((x) => x.name.trim()),
      meals: { breakfast: meals.breakfast.mark, lunch: meals.lunch.mark, dinner: meals.dinner.mark },
      free: items.length > 0 && items.every((x) => ["free_time", "hotel", "flight", "transfer"].includes(x.type ?? "")) && items.some((x) => x.type === "free_time"),
    };
  });
  const ourAll = ourDays.flatMap((d) => d.names);
  const ourMeals = ourDays.reduce((s, d) => s + (d.meals.lunch !== "불포함" ? 1 : 0) + (d.meals.dinner !== "불포함" ? 1 : 0), 0);
  const ourFree = ourDays.filter((d) => d.free).length;
  const theirAll = input.competitors.flatMap((c) => [...(c.places ?? []), ...(c.itinerary?.found ? c.itinerary.days.flatMap((d) => d.places) : [])]);
  const markOurs = (name: string): PlaceMark => (theirAll.some((t) => samePlace(name, t)) ? "shared" : "only");
  const markTheirs = (name: string): PlaceMark => (ourAll.some((o) => samePlace(o, name)) ? "shared" : "only");
  const ourGrade = ourGradeRange(input);
  const rt = (r: [number, number]) => (r[0] === r[1] ? `${r[0]}성` : `${r[0]}~${r[1]}성`);

  const ours: CompareProduct = {
    id: "ours",
    name: meta?.packageName?.trim() || "우리 상품",
    isOurs: true,
    listedPrice: ourPrice,
    scopedPrice: ourPrice,
    diff: 0,
    adjustNote: "",
    span: `${input.nights}박 ${input.days}일`,
    hotel: [input.packageType === "land" ? "" : input.lodgingType === "resort" ? "리조트" : gradeText(input.hotelGrade), Object.values(input.selectedHotels)[0]?.name ?? input.supplierQuote?.hotels ?? ""].filter(Boolean).join(" · "),
    includes: quote.ourIncludes,
    shopping: policy.shopping,
    optionTour: policy.optionTour,
    mealCount: ourMeals,
    freeDays: ourFree,
    tipNote: input.tipPerPerson > 0 ? `팁 1인 ${won(input.tipPerPerson)} 포함` : "",
    optionTours: input.options.map((o) => ({ name: o.name, price: o.pricePerPerson > 0 ? `1인 ${won(o.pricePerPerson)}` : "" })),
    otherRegions: [],
    days: ourDays.map((d) => ({ day: d.day, places: d.names.map((n) => ({ name: n, mark: markOurs(n) })), meals: d.meals, free: d.free, otherRegion: "" })),
    places: ourAll.map((n) => ({ name: n, mark: markOurs(n) })),
    itineraryState: "ours",
    ourBetter: [],
    theirBetter: [],
    priceReason: "",
  };

  const products: CompareProduct[] = [ours];
  for (const c of input.competitors) {
    const scoped = competitorPriceInOurScope(c, forCompare, input, policy);
    const it = c.itinerary;
    const itDays = it?.found ? it.days : null;
    const otherRegions = [...new Set([...extraRegionsOf(c.name, input.destination), ...(itDays ?? []).map((d) => d.otherRegion).filter(Boolean)])];
    const adjust: string[] = [];
    if (c.includes.flight !== quote.ourIncludes.flight)
      adjust.push(input.flightPricePerPerson > 0 ? `항공 ${c.includes.flight ? "−" : "+"}${won(input.flightPricePerPerson)}` : "항공료 몰라 맞추지 못함");
    if (c.includes.hotel !== quote.ourIncludes.hotel) adjust.push(`숙박 ${c.includes.hotel ? "빼고" : "더해"} 맞춤`);
    if ((c.localPayPerPerson ?? 0) > 0) adjust.push(`현지 경비 +${won(c.localPayPerPerson ?? 0)}`);
    const theirMeals = itDays ? it!.mealCount || itDays.reduce((s, d) => s + (/포함|식|특식/.test(d.meals.lunch) && !/불포함|자유/.test(d.meals.lunch) ? 1 : 0) + (/포함|식|특식/.test(d.meals.dinner) && !/불포함|자유/.test(d.meals.dinner) ? 1 : 0), 0) : null;
    const theirFree = itDays ? itDays.filter((d) => d.free).length : null;
    const theirGrade = gradeRangeOfText(c.hotelGrade ?? "");
    const diff = scoped !== null ? Math.round(scoped - ourPrice) : null;

    const ourBetter: string[] = [];
    const theirBetter: string[] = [];
    for (const [k, label] of Object.entries(INCLUDE_NAMES) as [keyof CompetitorIncludes, string][]) {
      if (quote.ourIncludes[k] && !c.includes[k]) ourBetter.push(`${label} 포함`);
      if (!quote.ourIncludes[k] && c.includes[k]) theirBetter.push(`${label} 포함`);
    }
    if (policy.shopping === "none" && c.shopping === "some") ourBetter.push("노쇼핑");
    if (policy.shopping === "some" && c.shopping === "none") theirBetter.push("노쇼핑");
    const theirOptions = it?.found ? (it.optionTours ?? []) : [];
    if (policy.optionTour === "none" && (c.optionTour === "some" || theirOptions.length > 0))
      ourBetter.push(theirOptions.length > 0 ? `노옵션 (그 상품 선택관광 ${theirOptions.length}개)` : "노옵션");
    if (policy.optionTour === "some" && c.optionTour === "none") theirBetter.push("노옵션");
    if (ourGrade && theirGrade) {
      if (gradeMid(ourGrade) - gradeMid(theirGrade) >= 0.5) ourBetter.push(`호텔 ${rt(ourGrade)} (그 상품 ${rt(theirGrade)})`);
      if (gradeMid(theirGrade) - gradeMid(ourGrade) >= 0.5) theirBetter.push(`호텔 ${rt(theirGrade)} (우리 ${rt(ourGrade)})`);
    }
    if (theirMeals !== null) {
      if (ourMeals >= theirMeals + 2) ourBetter.push(`식사 ${ourMeals - theirMeals}회 더 포함 (우리 ${ourMeals}회, 그 상품 ${theirMeals}회)`);
      if (theirMeals >= ourMeals + 2) theirBetter.push(`식사 ${theirMeals - ourMeals}회 더 포함 (그 상품 ${theirMeals}회, 우리 ${ourMeals}회)`);
    }
    const theirPlaces = itDays ? itDays.filter((d) => !d.otherRegion).flatMap((d) => d.places) : (c.places ?? []);
    const onlyOurs = ourAll.filter((o) => !theirPlaces.some((t) => samePlace(o, t)));
    const onlyTheirs = theirPlaces.filter((t) => !ourAll.some((o) => samePlace(o, t)));
    if (itDays && onlyOurs.length > 0) ourBetter.push(`그 상품에 없는 방문지 ${onlyOurs.length}곳 (${onlyOurs.slice(0, 3).join(", ")}${onlyOurs.length > 3 ? " 등" : ""})`);
    if (onlyTheirs.length > 0) theirBetter.push(`우리에게 없는 방문지 ${onlyTheirs.length}곳 (${onlyTheirs.slice(0, 3).join(", ")}${onlyTheirs.length > 3 ? " 등" : ""})`);

    const reasonParts = [
      c.price > 0 ? `표시 ${won(c.price)}` : "가격 모름",
      ...(adjust.length > 0 ? [adjust.join(" · ")] : []),
      scoped !== null ? `같은 조건 ${won(scoped)}` : "",
      diff === null ? "" : Math.abs(diff) < ourPrice * 0.03 ? "우리와 비슷" : diff > 0 ? `우리가 ${won(diff)} 저렴` : `우리가 ${won(-diff)} 비쌈`,
    ].filter(Boolean);
    const why: string[] = [];
    if (diff !== null && diff < -ourPrice * 0.03) {
      // 우리가 비싼 이유가 될 만한 것
      why.push(...ourBetter.slice(0, 2));
      if (theirFree !== null && theirFree > ourFree) why.push(`그 상품은 자유일 ${theirFree}일 (가이드·차량 날이 적음)`);
      if (otherRegions.length > 0) why.push(`${otherRegions.join("·")} 일정 포함 상품이라 범위가 다름`);
    }

    products.push({
      id: c.id,
      name: c.name,
      isOurs: false,
      link: c.source?.url,
      listedPrice: c.price > 0 ? c.price : null,
      scopedPrice: scoped,
      diff,
      adjustNote: adjust.join(" · "),
      span: c.nights && c.days ? `${c.nights}박 ${c.days}일` : "",
      hotel: c.hotelGrade ?? "",
      includes: c.includes,
      shopping: c.shopping,
      // 일정표에서 선택관광 목록을 찾았으면 그걸 따른다
      optionTour: it?.found && it.optionTours && it.optionTours.length > 0 ? "some" : c.optionTour,
      mealCount: theirMeals,
      freeDays: theirFree,
      tipNote: it?.tipNote ?? "",
      optionTours: it?.found && it.optionTours ? it.optionTours.map((o) => ({ name: o.name, price: o.priceText })) : null,
      otherRegions,
      days: itDays
        ? itDays.map((d) => ({ day: d.day, places: d.places.map((n) => ({ name: n, mark: markTheirs(n) })), meals: d.meals, free: d.free, otherRegion: d.otherRegion }))
        : null,
      places: (c.places ?? []).map((n) => ({ name: n, mark: markTheirs(n) })),
      itineraryState: it ? (it.found ? "found" : "missing") : "notFetched",
      ourBetter,
      theirBetter,
      priceReason: [reasonParts.join(" → "), why.length > 0 ? `가격 차이 이유: ${why.join(", ")}` : ""].filter(Boolean).join(" · "),
    });
  }

  // 결론: 같은 범위(다른 지역 일정 없는) 상품 중 같은 조건 가격 순위와 코스 범위
  const same = products.filter((p) => !p.isOurs && p.otherRegions.length === 0 && p.scopedPrice !== null);
  const rank = [...same.map((p) => p.scopedPrice!), ourPrice].sort((a, b) => a - b).indexOf(ourPrice) + 1;
  const conclusion =
    same.length === 0
      ? "같은 범위로 견줄 경쟁 상품 가격이 없습니다 — 경쟁 상품을 더 찾거나 항공료를 채워 주세요"
      : `같은 조건 가격은 ${same.length + 1}개 중 ${rank}번째로 ${rank === 1 ? "가장 저렴" : rank === same.length + 1 ? "가장 비쌈" : "중간"}, 우리 방문지 ${ourAll.length}곳 중 경쟁 상품에 없는 곳 ${ours.places.filter((p) => p.mark === "only").length}곳`;

  return { products, maxDays: Math.max(...products.map((p) => p.days?.length ?? 0), days.length), conclusion };
}

/** 비교 내용을 엑셀에서 열 수 있는 CSV로 (한글이 깨지지 않게 BOM을 붙인다) */
export function productCompareCsv(cmp: ProductCompare): string {
  const esc = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["상품", "표시 가격", "같은 조건 가격", "우리와 차이", "조정", "일정", "호텔", "식사(회)", "자유일", "쇼핑", "선택관광", "선택관광 내용", "팁", "다른 지역"];
  for (let d = 1; d <= cmp.maxDays; d += 1) head.push(`DAY ${d}`);
  head.push("우리가 나은 점", "그 상품이 나은 점", "가격 차이");
  const policy = (p: TourPolicy) => (p === "none" ? "없음" : p === "some" ? "있음" : "모름");
  const rows = cmp.products.map((p) => {
    const cells: (string | number | null)[] = [
      p.name,
      p.listedPrice,
      p.scopedPrice,
      p.isOurs ? "기준" : p.diff,
      p.adjustNote,
      p.span,
      p.hotel,
      p.mealCount,
      p.freeDays,
      policy(p.shopping),
      policy(p.optionTour),
      p.optionTours ? p.optionTours.map((o) => [o.name, o.price].filter(Boolean).join(" ")).join(" / ") : "",
      p.tipNote,
      p.otherRegions.join("·"),
    ];
    for (let d = 1; d <= cmp.maxDays; d += 1) {
      const day = p.days?.find((x) => x.day === d);
      cells.push(day ? [day.free ? "[자유]" : "", day.otherRegion ? `[${day.otherRegion}]` : "", day.places.map((x) => x.name).join(", ")].filter(Boolean).join(" ") : d === 1 && !p.days ? p.places.map((x) => x.name).join(", ") : "");
    }
    cells.push(p.ourBetter.join(" / "), p.theirBetter.join(" / "), p.priceReason);
    return cells.map(esc).join(",");
  });
  return "﻿" + [head.map(esc).join(","), ...rows, "", esc(cmp.conclusion)].join("\n");
}
