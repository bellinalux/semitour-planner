import { isSignatureItem } from "@/lib/budgetFit";
import { DIRECT_CHANNEL_ID, feeRows } from "@/lib/channels";
import { competitorPriceInOurScope, ourPolicy } from "@/lib/competitorDiff";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import { samePlace } from "@/lib/places";
import { roundDownPrice } from "@/lib/priceRound";
import type { Competitor, CourseMeta, DayPlan, QuoteData, TripInput } from "@/types";

/**
 * 업체 견적 검증 — 업체(랜드사) 공급가로 시작한 견적에서
 *   목표 1인 판매가 − 플랫폼·카드 수수료 − 회사 수익 − 공급가 밖의 원가(항공·팁·보험 등) = 업체 공급가 상한
 * 을 거꾸로 계산하고, 지금 공급가가 상한을 넘으면 업체에 빼 달라고 할 만한 일정을 고른다.
 * 목표 판매가를 직접 넣지 않으면 경쟁 상품 가격(우리 조건으로 맞춘 값)의 하위 25%를 쓴다.
 */

export interface SupplierTarget {
  targetPrice: number;
  targetSource: "manual" | "competitors";
  channelName: string;
  feePerPerson: number;
  marginRate: number;
  profitPerPerson: number;
  /** 공급가 밖의 1인 원가 (항공·팁·보험·기타 고정비) */
  otherPerPerson: number;
  /** 환율 변동 버퍼 비율 (0~1, 공급가에도 붙는다) */
  fxBufferRate: number;
  /** 업체 공급가 1인 상한 (2인 1실 기준) — 목표 회사 수익을 지키는 선 */
  maxSupplierPerPerson: number;
  /** 손익분기 공급가 — 이보다 비싸면 목표 판매가에 팔아도 적자 */
  breakEvenSupplierPerPerson: number;
  supplierPerPerson: number;
  /** 지금 공급가 − 상한. 양수면 그만큼 낮춰야 한다 */
  over: number;
  /** 지금 공급가로 목표 판매가에 팔 때 회사 수익률 (%, 음수면 적자) */
  marginAtCurrent: number;
}

interface CostBase {
  row: ReturnType<typeof feeRows>[number];
  otherPerPerson: number;
  fxBufferRate: number;
  marginRate: number;
}

function costBase(input: TripInput, quote: QuoteData): CostBase {
  const rows = feeRows(input);
  const row = rows.find((r) => r.id === (input.documentChannelId || DIRECT_CHANNEL_ID)) ?? rows[0];
  const n = Math.max(1, quote.travelers);
  const lines = quote.lines.filter((l) => !l.excluded);
  return {
    row,
    otherPerPerson: lines.filter((l) => l.key !== "supplier" && l.key !== "fx-buffer").reduce((s, l) => s + l.amount, 0) / n,
    fxBufferRate: lines.some((l) => l.key === "fx-buffer") ? input.fxBufferRate / 100 : 0,
    marginRate: input.targetMarginRate / 100,
  };
}

/** 이 판매가에 팔 때 업체 공급가 상한(목표 수익)과 손익분기 공급가 — 원가 = (공급가 + 공급가 밖 원가) × (1 + 환율 버퍼) */
function capsAt(price: number, b: CostBase) {
  const fee = price * b.row.rate + b.row.fixedPerPerson;
  const cap = (profit: number) => Math.max(0, (price - fee - profit) / (1 + b.fxBufferRate) - b.otherPerPerson);
  return { fee, max: cap(price * b.marginRate), breakEven: cap(0) };
}

/** 업체 견적 검증의 목표 원가. 공급가 모드가 아니거나 목표 판매가를 정할 수 없으면 null */
export function supplierTarget(input: TripInput, quote: QuoteData, competitorP25: number | null): SupplierTarget | null {
  if (input.pricingMode !== "supplier") return null;
  const manual = input.supplierTargetPrice > 0;
  const targetPrice = manual ? input.supplierTargetPrice : competitorP25 && competitorP25 > 0 ? roundDownPrice(competitorP25, input.currency) : 0;
  if (targetPrice <= 0) return null;

  const b = costBase(input, quote);
  const caps = capsAt(targetPrice, b);
  const supplier = input.supplierPricePerPerson;
  const profitAtCurrent = targetPrice - caps.fee - (supplier + b.otherPerPerson) * (1 + b.fxBufferRate);
  return {
    targetPrice,
    targetSource: manual ? "manual" : "competitors",
    channelName: b.row.name,
    feePerPerson: caps.fee,
    marginRate: b.marginRate,
    profitPerPerson: targetPrice * b.marginRate,
    otherPerPerson: b.otherPerPerson,
    fxBufferRate: b.fxBufferRate,
    maxSupplierPerPerson: caps.max,
    breakEvenSupplierPerPerson: caps.breakEven,
    supplierPerPerson: supplier,
    over: supplier - caps.max,
    marginAtCurrent: (profitAtCurrent / targetPrice) * 100,
  };
}

export interface CompetitorCap {
  id: string;
  name: string;
  /** 우리 조건(우리가 포함한 항목·현지 지불)으로 맞춘 1인 가격 */
  scopedPrice: number;
  /** 그 가격에 팔 때 업체 공급가 상한 (목표 수익) */
  maxSupplier: number;
  /** 그 가격에 팔 때 손익분기 공급가 */
  breakEven: number;
  /** 경쟁사가 수수료·마진을 그만큼 남긴다고 볼 때, 우리 업체 공급가와 견줄 수 있는 경쟁사 원가 추정 */
  estimatedCost: number;
  /** 우리 업체 공급가가 경쟁사 원가 추정보다 높은지(10% 넘게) / 비슷한지 / 낮은지 */
  level: "high" | "ok" | "low";
}

/**
 * 경쟁 상품별 공급가 기준 — 경쟁 상품 가격에 맞춰 팔려면 업체 공급가가 얼마 이하여야 하는지(목표 수익·손익분기)와,
 * 경쟁사의 수수료·마진(competitorMarginRate)을 빼서 추정한 경쟁사 원가를 우리 업체 공급가와 견준다.
 */
export function competitorCaps(input: TripInput, days: DayPlan[], pmChoice: PmChoice, meta: CourseMeta | null, quote: QuoteData): CompetitorCap[] {
  if (input.pricingMode !== "supplier") return [];
  const b = costBase(input, quote);
  const policy = ourPolicy(days, pmChoice, input, meta);
  const m = Math.min(0.9, Math.max(0, input.competitorMarginRate / 100));
  return input.competitors.flatMap((c) => {
    const scoped = competitorPriceInOurScope(c, quote, input, policy);
    if (scoped === null || scoped <= 0) return [];
    const caps = capsAt(scoped, b);
    // 경쟁사 수수료·마진은 그쪽 표시 가격에 붙는다 → 우리 조건으로 맞춘 가격에서 그만큼 빼고, 우리 공급가와 같은 범위로 맞춘다
    const estimatedCost = Math.max(0, (scoped - c.price * m) / (1 + b.fxBufferRate) - b.otherPerPerson);
    const ratio = estimatedCost > 0 ? input.supplierPricePerPerson / estimatedCost : 1;
    const level: CompetitorCap["level"] = ratio > 1.1 ? "high" : ratio < 0.9 ? "low" : "ok";
    return [{ id: c.id, name: c.name, scopedPrice: scoped, maxSupplier: caps.max, breakEven: caps.breakEven, estimatedCost, level }];
  });
}

export type CutKind = "remove" | "meal-down" | "ground-day" | "hotel-down";

export interface SupplierCut {
  id: string;
  kind: CutKind;
  itemId: string;
  dayNo: number;
  name: string;
  /** 업체 공급가에서 줄어들 것으로 보는 1인 금액 (일정 항목 요금 추정) */
  savingPerPerson: number;
  /** 고르는 순서 (작을수록 먼저) */
  rank: number;
  reason: string;
  /** 모자라는 금액을 채우려고 추천한 것 */
  recommended: boolean;
}

/** 화면·요청서에 보이는 조정 이름 */
export function cutLabel(c: Pick<SupplierCut, "kind" | "dayNo" | "name">): string {
  switch (c.kind) {
    case "meal-down":
      return `DAY ${c.dayNo} ${c.name} → 보통 식사로`;
    case "ground-day":
      return `DAY ${c.dayNo} 차량·가이드 빼기 (자유일정)`;
    case "hotel-down":
      return c.name;
    default:
      return `DAY ${c.dayNo} ${c.name} 빼기`;
  }
}

const GRADE_DOWN: Partial<Record<TripInput["hotelGrade"], string>> = {
  "5": "5성 → 4성",
  "4": "4성 → 3성",
  "4-5": "4~5성 섞어서 → 4성",
  "3-5": "3~5성 섞어서 → 3~4성",
  "3-4": "3~4성 섞어서 → 3성",
  resort: "리조트 → 4성 호텔",
};
/** 한 등급 낮출 때 숙박 요금이 줄어드는 비율 (추정) */
export const HOTEL_DOWN_RATE = 0.3;
/** 이동·관광 없이 쉬는 날로 보는 항목 유형 */
const REST_TYPES = new Set(["free_time", "hotel"]);

/** 경쟁 상품 중 이 방문지를 넣은 곳의 수와, 방문지를 아는 경쟁 상품 수 */
function competitorCoverage(name: string, competitors: Competitor[]): { known: number; has: number } {
  const known = competitors.filter((c) => (c.places ?? []).length > 0);
  return { known: known.length, has: known.filter((c) => (c.places ?? []).some((p) => samePlace(name, p))).length };
}

/**
 * 공급가를 낮추려고 업체에 요청할 만한 조정 — 유료 체험·입장은 빼기, 비싼 식사는 한 단계 낮추기,
 * 자유일정 날 차량·가이드 빼기, 숙소 한 등급 낮추기 (차량·가이드·숙박은 우리 시세가 있을 때만).
 * 순서: ① 자유일정 날 차량·가이드, 경쟁 상품에 없는 유료 일정 → ② 그 밖의 유료 일정·비싼 식사
 *  → ③ 경쟁 상품 대부분이 넣는 일정, 숙소 등급 → ④ 대표 일정(상품명·하이라이트).
 * 같은 순서 안에서는 금액이 큰 것부터. 모자라는 금액(over)을 채울 때까지 앞에서부터 추천한다.
 */
export function supplierCuts(input: TripInput, days: DayPlan[], pmChoice: PmChoice, meta: CourseMeta | null, over: number): SupplierCut[] {
  const items = days.flatMap((d) => dayItems(d, pmChoice).map((item) => ({ item, dayNo: d.day })));
  const meals = items.filter(({ item }) => item.type === "meal" && item.mealCost > 0 && item.payment !== "local").map(({ item }) => item.mealCost);
  const typicalMeal = meals.length > 0 ? [...meals].sort((a, b) => a - b)[Math.floor(meals.length / 2)] : 0;

  const cuts: SupplierCut[] = [];
  for (const { item, dayNo } of items) {
    if (item.payment === "local") continue;
    if (item.type === "meal") {
      // 같은 일정의 보통 식사보다 1.5배 넘게 비싼 식사는 보통 식사로 낮추기
      if (typicalMeal > 0 && item.mealCost > typicalMeal * 1.5) {
        cuts.push({
          id: `meal-${item.id}`,
          kind: "meal-down",
          itemId: item.id,
          dayNo,
          name: item.name,
          savingPerPerson: item.mealCost - typicalMeal,
          rank: 2,
          reason: `다른 식사(1인 약 ${Math.round(typicalMeal).toLocaleString("ko-KR")})보다 비싼 식사`,
          recommended: false,
        });
      }
      continue;
    }
    if (item.entryFee <= 0 || item.type === "flight" || item.type === "transfer" || item.type === "hotel") continue;
    const signature = isSignatureItem(item.name, meta);
    const cover = competitorCoverage(item.name, input.competitors);
    let rank = 2;
    let reason = "유료 일정";
    if (signature) {
      rank = 4;
      reason = "대표 일정(상품명·하이라이트) — 빼면 상품 매력이 줄어듭니다";
    } else if (cover.known > 0 && cover.has === 0) {
      rank = 1;
      reason = `경쟁 상품 ${cover.known}곳 모두 넣지 않은 일정`;
    } else if (cover.known > 0 && cover.has * 2 >= cover.known) {
      rank = 3;
      reason = `경쟁 상품 ${cover.known}곳 중 ${cover.has}곳이 넣은 일정 — 빼면 비교에서 불리`;
    } else if (item.type === "experience" || item.type === "massage") {
      reason = "유료 체험 — 선택 옵션으로 돌려도 됩니다";
    }
    cuts.push({
      id: `item-${item.id}`,
      kind: "remove",
      itemId: item.id,
      dayNo,
      name: item.name,
      savingPerPerson: item.entryFee,
      rank,
      reason,
      recommended: false,
    });
  }

  // 자유일정 날(쉬는 항목만 있는 날)은 차량·가이드가 필요 없을 수 있다
  const n = Math.max(1, input.travelers);
  const groundPerDay = input.vehicleCostPerDay + input.guideCostPerDay;
  if (groundPerDay > 0) {
    for (const d of days) {
      const its = dayItems(d, pmChoice);
      // 업체가 이미 "가이드/차량 미포함"이라고 적은 자유일정 날은 줄일 것이 없다 (절감을 두 번 세지 않는다)
      const alreadyOff = its.some((i) => /(가이드|차량|기사)[^\n]*(미포함|불포함|없음|제외)/.test(`${i.name} ${i.description}`));
      if (its.length > 0 && !alreadyOff && its.every((i) => REST_TYPES.has(i.type ?? ""))) {
        cuts.push({
          id: `ground-${d.day}`,
          kind: "ground-day",
          itemId: "",
          dayNo: d.day,
          name: "차량·가이드",
          savingPerPerson: groundPerDay / n,
          rank: 1,
          reason: `자유일정 날 — 차량·가이드 1일 시세(${Math.round(groundPerDay).toLocaleString("ko-KR")})를 인원으로 나눈 금액`,
          recommended: false,
        });
      }
    }
  }

  // 숙소 한 등급 낮추기 (숙박 시세가 있을 때, 한 등급 차이를 약 30%로 추정)
  const down = GRADE_DOWN[input.hotelGrade];
  if (down && input.packageType !== "land" && input.lodgingType !== "bnb" && input.lodgingRatePerNight > 0 && input.nights > 0) {
    const guests = Math.max(1, Math.round(input.guestsPerUnit));
    cuts.push({
      id: "hotel-down",
      kind: "hotel-down",
      itemId: "",
      dayNo: 0,
      name: `숙소 한 등급 낮추기 (${down})`,
      savingPerPerson: ((input.lodgingRatePerNight * input.nights) / guests) * HOTEL_DOWN_RATE,
      rank: 3,
      reason: `숙박 시세 1실 1박 ${Math.round(input.lodgingRatePerNight).toLocaleString("ko-KR")}에서 한 등급 차이를 약 ${HOTEL_DOWN_RATE * 100}%로 추정 — 상품 등급이 바뀝니다`,
      recommended: false,
    });
  }

  cuts.sort((a, b) => a.rank - b.rank || b.savingPerPerson - a.savingPerPerson);
  let covered = 0;
  for (const c of cuts) {
    if (covered >= over) break;
    c.recommended = true;
    covered += c.savingPerPerson;
  }
  return cuts;
}

/** 고른 항목을 업체가 모두 빼 주면 예상 공급가 (항목 요금은 추정이라 업체 실제 금액과 다를 수 있다) */
export function supplierAfterCuts(target: SupplierTarget, cuts: SupplierCut[], selected: Set<string>) {
  const saving = cuts.filter((c) => selected.has(c.id)).reduce((s, c) => s + c.savingPerPerson, 0);
  const after = Math.max(0, target.supplierPerPerson - saving);
  return { saving, after, reaches: after <= target.maxSupplierPerPerson };
}
