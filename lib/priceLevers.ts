import { calculateQuote } from "@/lib/cost";
import type { PmChoice } from "@/lib/itinerary";
import { documentQuote } from "@/lib/pricing";
import { HOTEL_DOWN_RATE, supplierCuts, type SupplierCut } from "@/lib/supplierCheck";
import { buildTourCompare } from "@/lib/tourCompare";
import type { CourseMeta, DayPlan, HotelGrade, QuoteData, TripInput } from "@/types";

/**
 * 가격 낮추기 (경쟁 상품 기준) — 업계에서 쓰는 절감 방법을 지금 견적·일정·경쟁 상품 데이터로 계산한다.
 * 방법마다 바뀐 1인 판매가, 같은 조건 경쟁 상품 중 순위 변화, 잃는 것(대표 일정·강점)을 함께 보여 준다.
 *  - 업체 공급가 견적: 일정·호텔 조정은 업체에 요청할 것(request) — 받아들이면 공급가가 그만큼 준다고 보고 미리 계산
 *  - 우리 원가 견적: 일정에 바로 적용(apply)
 *  - 인원·출발 요일처럼 고객 조건이 바뀌는 것은 안내(info)
 * 쇼핑·선택관광을 늘려 메우는 방법은 넣지 않는다 (강매·소비자 불만으로 이어진다는 업계 보도·연구).
 */

export type LeverMode = "apply" | "request" | "info";

export interface PriceLever {
  id: string;
  label: string;
  /** 어떻게 계산했는지 한 줄 */
  detail: string;
  /** 업계에서 쓰는 방법인지·주의 한 줄 */
  guide: string;
  mode: LeverMode;
  /** 1인 판매가가 줄어드는 금액 */
  saving: number;
  newPrice: number;
  /** 같은 조건 경쟁 상품 중 순위 (1 = 가장 저렴) — 경쟁 가격이 없으면 null */
  rankAfter: number | null;
  /** 잃는 것·주의 */
  lose: string[];
  /** 업체 요청서에 넣을 일정 조정 id (supplierCutIds) */
  cutId?: string;
}

export interface PriceLevers {
  basePrice: number;
  /** 같은 조건으로 견줄 수 있는 경쟁 상품 가격 (다른 지역 포함 상품 제외) */
  competitorPrices: number[];
  rank: number | null;
  levers: PriceLever[];
}

type Transform = (s: { input: TripInput; days: DayPlan[] }) => { input: TripInput; days: DayPlan[] };

interface LeverDef extends Omit<PriceLever, "saving" | "newPrice" | "rankAfter"> {
  transform: Transform;
}

const GRADE_LOWER: Partial<Record<HotelGrade, HotelGrade>> = { "5": "4", "4": "3", "4-5": "4", "3-5": "3-4", "3-4": "3", resort: "4" };

/** 1인 판매가 (문서에 나가는 판매 채널 기준) — 계산이 안 되면 null */
export function salePrice(input: TripInput, days: DayPlan[], pmChoice: PmChoice): number | null {
  const q = calculateQuote(input, days, pmChoice);
  if (!q.ok) return null;
  const d = documentQuote(q, input);
  return q.partnerConsumerPrice ?? d.scenario.pricePerPerson;
}

const rankOf = (price: number, rivals: number[]) => (rivals.length === 0 ? null : rivals.filter((p) => p < price).length + 1);

/** 업체 일정 조정(빼기·식사 낮추기·자유일 차량 빼기·호텔 낮추기)을 방법으로 */
function cutLevers(input: TripInput, days: DayPlan[], pmChoice: PmChoice, meta: CourseMeta | null): LeverDef[] {
  const supplier = input.pricingMode === "supplier";
  const cuts = supplierCuts(input, days, pmChoice, meta, 0).filter((c) => c.savingPerPerson > 0);
  const withoutItem = (id: string): Transform => (s) => ({
    ...s,
    days: s.days.map((d) => ({
      ...d,
      items: d.items.filter((i) => i.id !== id),
      amGuided: d.amGuided.filter((i) => i.id !== id),
      pmFreeOptions: d.pmFreeOptions.map((o) => ({ ...o, items: o.items.filter((i) => i.id !== id) })),
    })),
  });
  const lessSupplier = (c: SupplierCut): Transform => (s) => ({ ...s, input: { ...s.input, supplierPricePerPerson: Math.max(0, s.input.supplierPricePerPerson - c.savingPerPerson) } });
  return cuts.flatMap((c): LeverDef[] => {
    const base = { id: c.id, cutId: c.id, mode: (supplier ? "request" : "apply") as LeverMode };
    if (c.kind === "remove")
      return [
        {
          ...base,
          label: `DAY ${c.dayNo} ${c.name} 빼기`,
          detail: `입장료 1인 ${Math.round(c.savingPerPerson).toLocaleString("ko-KR")}`,
          guide: "포함 관광 수를 줄이는 것은 상품가를 낮추는 기본 방법 — 빼기보다 선택관광으로 돌리는 것도 방법",
          // 사유가 일반적인 "유료 일정"이면 빠지는 일정 이름만, 대표 일정·경쟁 상품도 가는 곳이면 그 이유도
          lose: [`${c.name} 방문이 빠짐`, ...(c.reason === "유료 일정" ? [] : [c.reason])],
          transform: supplier ? lessSupplier(c) : withoutItem(c.itemId),
        },
      ];
    if (c.kind === "meal-down")
      return [
        {
          ...base,
          label: `DAY ${c.dayNo} ${c.name} → 일반 식사`,
          detail: c.reason,
          guide: "특식을 일반식으로 낮추는 것은 흔한 조정 — 상품 소개의 특식 문구도 함께 고쳐야 함",
          lose: ["특식이 일반식으로 바뀜"],
          transform: supplier
            ? lessSupplier(c)
            : (s) => ({
                ...s,
                days: s.days.map((d) => ({ ...d, items: d.items.map((i) => (i.id === c.itemId ? { ...i, mealCost: Math.max(0, i.mealCost - c.savingPerPerson) } : i)) })),
              }),
        },
      ];
    if (c.kind === "ground-day")
      return supplier
        ? [
            {
              ...base,
              label: `DAY ${c.dayNo} 자유일정 — 차량·가이드 빼기`,
              detail: c.reason,
              guide: "자유일에는 차량·가이드를 빼는 것이 업계 관행 (경쟁 상품의 '자유일정 포함' 구성)",
              lose: ["그날 가이드·차량 없이 고객이 따로 이동"],
              transform: lessSupplier(c),
            },
          ]
        : [];
    // 호텔 한 등급 낮추기
    const lower = GRADE_LOWER[input.hotelGrade];
    return [
      {
        ...base,
        label: c.name,
        detail: c.reason,
        guide: "숙소 등급은 상품가를 정하는 큰 요소 — 경쟁 상품 등급보다 낮아지지 않는지 확인",
        lose: ["숙소 등급이 내려감 (경쟁 비교에서 '호텔 등급' 강점이 약해질 수 있음)"],
        transform: supplier
          ? lessSupplier(c)
          : (s) => ({
              ...s,
              input: {
                ...s.input,
                ...(lower ? { hotelGrade: lower } : {}),
                lodgingRatePerNight: Math.round(s.input.lodgingRatePerNight * (1 - HOTEL_DOWN_RATE)),
                lodgingCityRates: Object.fromEntries(Object.entries(s.input.lodgingCityRates).map(([k, v]) => [k, Math.round(v * (1 - HOTEL_DOWN_RATE))])),
              },
            }),
      },
    ];
  });
}

/** 모든 방법(계산 전) — 방법마다 입력·일정을 어떻게 바꾸는지 */
function leverDefs(input: TripInput, days: DayPlan[], pmChoice: PmChoice, meta: CourseMeta | null): LeverDef[] {
  const supplier = input.pricingMode === "supplier";
  const defs: LeverDef[] = cutLevers(input, days, pmChoice, meta);

  // 후보 호텔 중 가장 싼 곳으로 확정 (업체 견적서에 "중 하나"로 적힌 호텔들의 시세 차이)
  const rates = (input.supplierQuote?.hotelRates ?? []).filter((h) => h.found);
  if (rates.length >= 2 && input.nights > 0) {
    const mid = (h: (typeof rates)[number]) => (h.rateLow + h.rateHigh) / 2;
    const cheapest = rates.reduce((a, b) => (mid(b) < mid(a) ? b : a));
    const avg = rates.reduce((s, h) => s + mid(h), 0) / rates.length;
    const guests = Math.max(1, Math.round(input.guestsPerUnit));
    const perPerson = ((avg - mid(cheapest)) * input.nights) / guests;
    if (perPerson > 0)
      defs.push({
        id: "hotel-pick",
        label: `호텔을 ${cheapest.name}(으)로 확정`,
        detail: `후보 ${rates.length}곳 평균 1박 ${Math.round(avg).toLocaleString("ko-KR")} → ${Math.round(mid(cheapest)).toLocaleString("ko-KR")} (웹 공개 요금)`,
        guide: "단체 호텔은 후보 몇 곳에 견적을 받아 경쟁시키는 것이 업계 관행(RFP)",
        mode: supplier ? "request" : "apply",
        lose: ["호텔을 고객에게 '○○ 또는 동급'이 아니라 한 곳으로 안내"],
        transform: supplier
          ? (s) => ({ ...s, input: { ...s.input, supplierPricePerPerson: Math.max(0, s.input.supplierPricePerPerson - perPerson) } })
          : (s) => ({ ...s, input: { ...s.input, lodgingRatePerNight: Math.round(mid(cheapest)) } }),
      });
  }

  // 출발 요일 바꾸기 (업체 요일별 요금)
  const q = input.supplierQuote;
  if (supplier && q?.picked && (q.datePrices ?? []).length > 1) {
    const rows = (q.datePrices ?? []).filter((d) => d.nights === 0 || d.nights === input.nights);
    const cheapest = rows.reduce((a, b) => (b.pricePerPerson < a.pricePerPerson ? b : a), rows[0]);
    if (cheapest && cheapest.pricePerPerson < q.picked.price - 1)
      defs.push({
        id: "weekday",
        label: `출발 요일을 ${cheapest.label}(으)로`,
        detail: `업체 요일별 요금 ${q.picked.label} → ${cheapest.label} 출발`,
        guide: "시즌·요일별 단가 차이를 쓰는 것은 업계 기본 — 고객 출발일이 바뀌므로 고객과 협의",
        mode: "info",
        lose: ["출발 요일이 바뀜"],
        transform: (s) => ({ ...s, input: { ...s.input, supplierPricePerPerson: Math.round(cheapest.pricePerPerson) } }),
      });
  }

  // 가이드·기사 팁을 현지 지불로 (표시 가격만 내려가고 고객 총비용은 같다)
  if (input.tipPerPerson > 0)
    defs.push({
      id: "tip-local",
      label: "가이드·기사 팁을 현지 지불로",
      detail: `팁 1인 ${input.tipPerPerson.toLocaleString("ko-KR")}을 판매가에서 빼고 '현지 지불'로 안내`,
      guide: "경쟁 상품 다수가 가이드 경비를 현지 지불(불포함)로 표시 — 고객 총비용은 같아 비교용 표시 가격만 내려감",
      mode: "apply",
      lose: ["'노팁' 강점이 사라짐", "현지 지불 금액을 상품 안내에 꼭 표시"],
      transform: (s) => ({ ...s, input: { ...s.input, tipPerPerson: 0 } }),
    });

  // 인원이 늘면 1인 원가가 내려간다 (차량·가이드는 나눠 내므로)
  for (const extra of [2, 4]) {
    const more = input.travelers + extra;
    defs.push({
      id: `group-${more}`,
      label: `${more}명으로 모객하면`,
      detail: `지금 ${input.travelers}명 → ${more}명 (차량·가이드를 나눠 내는 인원이 늘어남)`,
      guide: "인원이 적을수록 1인 원가가 오르는 구조 — 최소 출발 인원·인원별 요금표로 안내",
      mode: "info",
      lose: [],
      transform: (s) => ({ ...s, input: { ...s.input, travelers: more } }),
    });
  }
  if (input.packageType === "full" && input.travelers >= 10)
    defs.push({
      id: "group-air",
      label: "단체 항공 요금 문의",
      detail: `${input.travelers}명 — 항공사 단체 요금은 보통 10명부터 (일부 아시아 항공사는 15~20명)`,
      guide: "단체 좌석을 묶어 받는 것이 업계 관행 — 항공사·항공 대리점에 문의",
      mode: "info",
      lose: [],
      transform: (s) => s,
    });

  return defs;
}

export function buildPriceLevers(input: TripInput, days: DayPlan[], pmChoice: PmChoice, quote: QuoteData, meta: CourseMeta | null): PriceLevers | null {
  const basePrice = salePrice(input, days, pmChoice);
  if (basePrice === null || basePrice <= 0) return null;
  const compare = buildTourCompare(input, days, pmChoice, quote, meta);
  const competitorPrices = (compare?.columns ?? []).filter((c) => !c.isOurs && c.extraRegions.length === 0 && c.price !== null).map((c) => c.price!);
  const levers: PriceLever[] = leverDefs(input, days, pmChoice, meta)
    .map(({ transform, ...d }) => {
      const after = transform({ input, days });
      const price = salePrice(after.input, after.days, pmChoice) ?? basePrice;
      return { ...d, saving: Math.max(0, basePrice - price), newPrice: price, rankAfter: rankOf(price, competitorPrices) };
    })
    .filter((l) => l.saving > 0 || l.id === "group-air")
    .sort((a, b) => (a.mode === "info" ? 1 : 0) - (b.mode === "info" ? 1 : 0) || b.saving - a.saving);

  return { basePrice, competitorPrices, rank: rankOf(basePrice, competitorPrices), levers };
}

/**
 * 고른 방법을 함께 적용했을 때의 입력·일정과 1인 판매가·순위 (안내 방법은 빼고 — 고객 조건이 바뀌는 것이라).
 * 우리 원가 견적이면 이 입력·일정을 그대로 적용하고, 업체 공급가 견적이면 업체가 받아들였을 때의 예상이다.
 */
export function combinedLevers(input: TripInput, days: DayPlan[], pmChoice: PmChoice, quote: QuoteData, meta: CourseMeta | null, ids: string[]) {
  let state = { input, days };
  for (const d of leverDefs(input, days, pmChoice, meta)) if (ids.includes(d.id) && d.mode !== "info") state = d.transform(state);
  const price = salePrice(state.input, state.days, pmChoice);
  const compare = buildTourCompare(input, days, pmChoice, quote, meta);
  const rivals = (compare?.columns ?? []).filter((c) => !c.isOurs && c.extraRegions.length === 0 && c.price !== null).map((c) => c.price!);
  return { ...state, price, rank: price === null ? null : rankOf(price, rivals) };
}
