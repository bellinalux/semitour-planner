import { calculateQuote } from "@/lib/cost";
import { dayItems, type PmChoice } from "@/lib/itinerary";
import { documentQuote } from "@/lib/pricing";
import { HOTEL_DOWN_RATE, supplierCuts, type SupplierCut } from "@/lib/supplierCheck";
import { gradeMid, gradeRange, gradeText } from "@/lib/itemTypes";
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

const MAIN_MEAL = (i: DayPlan["items"][number]) => i.type === "meal" && i.payment !== "local" && i.mealCost > 0 && !/카페|간식|디저트|에그타르트|coffee|cafe/i.test(i.name);
const isSight = (i: DayPlan["items"][number]) => !["meal", "transfer", "hotel", "flight", "free_time"].includes(i.type ?? "sightseeing");

/**
 * 경쟁 상품 구성에 맞추기 — 그 상품보다 자유일이 적으면 관광이 가장 적은 중간 날을 자유일로, 포함 식사가 많으면 비싼 식사부터 자유식으로.
 * 우리 원가 견적은 바로 적용, 업체 공급가 견적은 업체가 그만큼(차량·가이드 1일·입장료·식대) 빼 준다고 보고 계산하는 시뮬레이션.
 */
function matchLevers(input: TripInput, days: DayPlan[], pmChoice: PmChoice): LeverDef[] {
  const supplier = input.pricingMode === "supplier";
  const n = Math.max(1, input.travelers);
  const ourFree = days.filter((d) => {
    const its = dayItems(d, pmChoice);
    return its.some((i) => i.type === "free_time") && its.every((i) => !isSight(i) && i.type !== "meal");
  }).length;
  const ourMeals = days.flatMap((d) => dayItems(d, pmChoice)).filter(MAIN_MEAL);
  const out: LeverDef[] = [];
  for (const c of input.competitors) {
    const it = c.itinerary;
    if (!it?.found || it.days.some((d) => d.otherRegion)) continue;
    const theirFree = it.days.filter((d) => d.free).length;
    const addFree = Math.max(0, theirFree - ourFree);
    const cutMeals = it.mealCount > 0 ? Math.max(0, ourMeals.length - it.mealCount) : 0;
    if (addFree === 0 && cutMeals === 0) continue;
    // 자유일로 바꿀 날: 첫날·마지막 날을 빼고, 관광이 가장 적은 날부터
    const middle = days.slice(1, -1).filter((d) => d.kind === "linear" && dayItems(d, pmChoice).some(isSight));
    const freeDays = [...middle].sort((a, b) => dayItems(a, pmChoice).filter(isSight).length - dayItems(b, pmChoice).filter(isSight).length).slice(0, addFree);
    const freeIds = new Set(freeDays.map((d) => d.day));
    // 자유식으로 바꿀 식사: 자유일로 바꾼 날 식사는 이미 빠지므로 빼고, 비싼 것부터
    const mealIds = new Set(
      ourMeals
        .filter((m) => !freeDays.some((d) => d.items.some((i) => i.id === m.id)))
        .sort((a, b) => b.mealCost - a.mealCost)
        .slice(0, Math.max(0, cutMeals - freeDays.reduce((s, d) => s + d.items.filter(MAIN_MEAL).length, 0)))
        .map((m) => m.id),
    );
    const groundPerPerson = (input.vehicleCostPerDay + input.guideCostPerDay) / n;
    const dayCost = (d: DayPlan) => dayItems(d, pmChoice).reduce((s, i) => s + (i.payment === "local" ? 0 : i.entryFee + i.mealCost), 0);
    const supplierSaving =
      freeDays.reduce((s, d) => s + groundPerPerson + dayCost(d), 0) + ourMeals.filter((m) => mealIds.has(m.id)).reduce((s, m) => s + m.mealCost, 0);
    const parts = [addFree > 0 ? `자유일 +${addFree}일 (DAY ${freeDays.map((d) => d.day).join(", ")})` : "", mealIds.size + freeDays.reduce((s, d) => s + d.items.filter(MAIN_MEAL).length, 0) > 0 ? `포함 식사 −${cutMeals}회` : ""].filter(Boolean);
    out.push({
      id: `match-${c.id}`,
      label: `${c.name.slice(0, 24)} 구성에 맞추기 (${parts.join(" · ")})`,
      detail: `그 상품: 자유일 ${theirFree}일 · 포함 식사 ${it.mealCount || "?"}회 / 우리: 자유일 ${ourFree}일 · 포함 식사 ${ourMeals.length}회 — 노쇼핑·노옵션 같은 우리 강점은 그대로`,
      guide: "경쟁 상품처럼 자유일·식사를 줄이면 가격은 내려가지만 '포함이 많은 상품'이라는 차별점이 약해짐 — 판매 전략과 맞는지 판단",
      mode: supplier ? "info" : "apply",
      lose: [
        ...(freeDays.length > 0 ? [`DAY ${freeDays.map((d) => d.day).join(", ")} 관광 ${freeDays.reduce((s, d) => s + dayItems(d, pmChoice).filter(isSight).length, 0)}곳이 빠지고 자유일정`] : []),
        ...(mealIds.size > 0 ? [`식사 ${mealIds.size}회가 자유식(고객 부담)`] : []),
      ],
      transform: supplier
        ? (s) => ({ ...s, input: { ...s.input, supplierPricePerPerson: Math.max(0, s.input.supplierPricePerPerson - supplierSaving) } })
        : (s) => ({
            ...s,
            days: s.days.map((d) =>
              freeIds.has(d.day)
                ? {
                    ...d,
                    items: [
                      {
                        id: `free-${d.day}`,
                        type: "free_time" as const,
                        name: "자유 일정 (가이드/차량 미포함)",
                        description: "경쟁 상품 구성에 맞춰 자유일로 바꿈",
                        stayMinutes: 480,
                        travelMinutesToNext: 0,
                        entryFee: 0,
                        mealCost: 0,
                        isEstimated: false,
                        admission: "none" as const,
                      },
                    ],
                  }
                : { ...d, items: d.items.map((i) => (mealIds.has(i.id) ? { ...i, payment: "local" as const, name: i.name.includes("자유식") ? i.name : `${i.name} (자유식)` } : i)) },
            ),
          }),
    });
  }
  return out;
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

  // 경쟁 상품 따라 하기 — 일정을 가져온 경쟁 상품의 구성(자유일·포함 식사·호텔 등급)에 맞추면 우리 가격은?
  defs.push(...matchLevers(input, days, pmChoice));

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

export interface WeekdayPriceRow {
  label: string;
  nights: number;
  supplierPrice: number;
  salePrice: number | null;
  marginRate: number | null;
  /** 이 요일의 가까운 출발일 (출발일이 있으면 그 날부터, 없으면 오늘부터) YYYY-MM-DD */
  nextDates: string[];
  isCurrent: boolean;
}

/**
 * 출발일(요일)별 판매가 — 업체 요일별 공급가로 판매가·수익률을 계산하고, 그 요일의 가까운 출발일을 함께 보여 준다.
 * 박수가 지금 일정과 같은 줄만 (박수 구분이 없으면 모두).
 */
export function weekdayPriceRows(input: TripInput, days: DayPlan[], pmChoice: PmChoice, today = new Date()): WeekdayPriceRow[] {
  const q = input.supplierQuote;
  const rows = (q?.datePrices ?? []).filter((d) => d.nights === 0 || d.nights === input.nights);
  if (input.pricingMode !== "supplier" || rows.length < 2) return [];
  const from = /^\d{4}-\d{2}-\d{2}$/.test(input.departureDate) ? new Date(`${input.departureDate}T00:00:00Z`) : new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return rows.map((r) => {
    const supplierPrice = Math.round(r.pricePerPerson);
    const next: string[] = [];
    for (let k = 0; k < 28 && next.length < 3; k += 1) {
      const d = new Date(from.getTime() + k * 86_400_000);
      if (r.weekdays.length === 0 || r.weekdays.includes(d.getUTCDay())) next.push(iso(d));
    }
    const qt = calculateQuote({ ...input, supplierPricePerPerson: supplierPrice }, days, pmChoice);
    const sale = salePrice({ ...input, supplierPricePerPerson: supplierPrice }, days, pmChoice);
    return {
      label: r.label,
      nights: r.nights,
      supplierPrice,
      salePrice: sale,
      marginRate: qt.ok ? documentQuote(qt, input).scenario.actualMarginRate : null,
      nextDates: next,
      isCurrent: q?.picked?.label?.includes(r.label) ?? false,
    };
  });
}

export interface GradeOption {
  grade: HotelGrade;
  label: string;
  salePrice: number | null;
  marginRate: number | null;
  rankAfter: number | null;
  /** 1실 1박 숙박 요금 추정 */
  ratePerNight: number;
  isCurrent: boolean;
}

/**
 * 숙소 등급을 바꾼 견적 입력 — 한 등급 차이를 숙박 요금 약 30%로 보고 1실 1박 요금(도시별 요금 포함)을 바꾼다.
 * 업체 공급가 견적은 숙박 차이만큼 공급가가 바뀐다고 본다 (등급을 바꿀 수 없는 견적이면 그대로).
 */
export function inputWithGrade(input: TripInput, g: HotelGrade, curMid = gradeMid(gradeRange(input.hotelGrade) ?? [4, 4]), guests = Math.max(1, Math.round(input.guestsPerUnit))): TripInput {
  const range = gradeRange(g);
  if (!range) return input;
  const factor = Math.pow(1 - HOTEL_DOWN_RATE, curMid - gradeMid(range));
  const rate = Math.round(input.lodgingRatePerNight * factor);
  const scale = (v: number) => Math.round(v * factor);
  return input.pricingMode === "supplier"
    ? { ...input, hotelGrade: g, lodgingRatePerNight: rate, supplierPricePerPerson: Math.max(0, Math.round(input.supplierPricePerPerson + ((rate - input.lodgingRatePerNight) * input.nights) / guests)) }
    : { ...input, hotelGrade: g, lodgingRatePerNight: rate, lodgingCityRates: Object.fromEntries(Object.entries(input.lodgingCityRates).map(([k, v]) => [k, scale(v)])) };
}

/**
 * 등급별 여러 안 (A/B/C안) — 지금 숙박 요금을 기준으로 등급마다 1실 1박 요금을 추정해(한 등급 약 30%) 판매가·수익률·경쟁 순위를 한 번에.
 * 업체 공급가 견적은 숙박 차이만큼 공급가가 바뀐다고 본다. 숙박이 없거나(랜드·BnB) 숙박 요금을 모르면 빈 목록.
 */
export function gradeOptions(input: TripInput, days: DayPlan[], pmChoice: PmChoice, quote: QuoteData, meta: CourseMeta | null): GradeOption[] {
  const cur = gradeRange(input.hotelGrade);
  if (input.packageType === "land" || input.lodgingType !== "hotel" || !cur || input.lodgingRatePerNight <= 0 || input.nights <= 0) return [];
  const curMid = gradeMid(cur);
  const guests = Math.max(1, Math.round(input.guestsPerUnit));
  const compare = buildTourCompare(input, days, pmChoice, quote, meta);
  const rivals = (compare?.columns ?? []).filter((c) => !c.isOurs && c.extraRegions.length === 0 && c.price !== null).map((c) => c.price!);
  const grades: HotelGrade[] = ["3", "3-4", "4", "4-5", "5"];
  return grades.map((g) => {
    const next = inputWithGrade(input, g, curMid, guests);
    const rate = next.lodgingRatePerNight;
    const qt = calculateQuote(next, days, pmChoice);
    const price = salePrice(next, days, pmChoice);
    return {
      grade: g,
      label: gradeText(g),
      salePrice: price,
      marginRate: qt.ok ? documentQuote(qt, next).scenario.actualMarginRate : null,
      rankAfter: price === null ? null : rankOf(price, rivals),
      ratePerNight: rate,
      isCurrent: g === input.hotelGrade,
    };
  });
}
