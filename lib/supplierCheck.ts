import { isSignatureItem } from "@/lib/budgetFit";
import { DIRECT_CHANNEL_ID, feeRows } from "@/lib/channels";
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
  /** 업체 공급가 1인 상한 (2인 1실 기준) */
  maxSupplierPerPerson: number;
  supplierPerPerson: number;
  /** 지금 공급가 − 상한. 양수면 그만큼 낮춰야 한다 */
  over: number;
}

/** 업체 견적 검증의 목표 원가. 공급가 모드가 아니거나 목표 판매가를 정할 수 없으면 null */
export function supplierTarget(input: TripInput, quote: QuoteData, competitorP25: number | null): SupplierTarget | null {
  if (input.pricingMode !== "supplier") return null;
  const manual = input.supplierTargetPrice > 0;
  const targetPrice = manual ? input.supplierTargetPrice : competitorP25 && competitorP25 > 0 ? roundDownPrice(competitorP25, input.currency) : 0;
  if (targetPrice <= 0) return null;

  const rows = feeRows(input);
  const row = rows.find((r) => r.id === (input.documentChannelId || DIRECT_CHANNEL_ID)) ?? rows[0];
  const feePerPerson = targetPrice * row.rate + row.fixedPerPerson;
  const marginRate = input.targetMarginRate / 100;
  const profitPerPerson = targetPrice * marginRate;

  const n = Math.max(1, quote.travelers);
  const lines = quote.lines.filter((l) => !l.excluded);
  const otherPerPerson = lines.filter((l) => l.key !== "supplier" && l.key !== "fx-buffer").reduce((s, l) => s + l.amount, 0) / n;
  const fxBufferRate = lines.some((l) => l.key === "fx-buffer") ? input.fxBufferRate / 100 : 0;
  const budget = targetPrice - feePerPerson - profitPerPerson;
  const maxSupplierPerPerson = Math.max(0, budget / (1 + fxBufferRate) - otherPerPerson);
  return {
    targetPrice,
    targetSource: manual ? "manual" : "competitors",
    channelName: row.name,
    feePerPerson,
    marginRate,
    profitPerPerson,
    otherPerPerson,
    fxBufferRate,
    maxSupplierPerPerson,
    supplierPerPerson: input.supplierPricePerPerson,
    over: input.supplierPricePerPerson - maxSupplierPerPerson,
  };
}

export type CutKind = "remove" | "meal-down";

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

/** 경쟁 상품 중 이 방문지를 넣은 곳의 수와, 방문지를 아는 경쟁 상품 수 */
function competitorCoverage(name: string, competitors: Competitor[]): { known: number; has: number } {
  const known = competitors.filter((c) => (c.places ?? []).length > 0);
  return { known: known.length, has: known.filter((c) => (c.places ?? []).some((p) => samePlace(name, p))).length };
}

/**
 * 공급가를 낮추려고 업체에 요청할 만한 일정 — 유료 체험·입장은 빼기, 비싼 식사는 한 단계 낮추기.
 * 순서: ① 경쟁 상품에 없는 유료 일정 → ② 그 밖의 유료 일정·비싼 식사 → ③ 경쟁 상품 대부분이 넣는 일정 → ④ 대표 일정(상품명·하이라이트).
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
