/**
 * 인원 → 차종·대수·가이드 수, 그리고 인원별 차량비·가이드비 환산.
 *  - 견적의 차량비·가이드비(1일)는 "지금 인원" 기준 금액이다.
 *  - groundScale이 "auto"면 다른 인원(인원별 가격표·최소 출발 인원 등)에서는 차종·대수·가이드 수에 맞춰 바꿔 계산한다.
 *    차종별 1대 요금(vehicleTierRates)을 조회해 두었으면 그 비율로, 없으면 차종 기본 비율로 바꾼다.
 *  - 직접 고친 금액도 그대로 존중한다 — 지금 인원의 금액에 비율을 곱하기 때문.
 */
import type { TripInput } from "@/types";

export type VehicleTier = "car" | "suv" | "van" | "midbus" | "bus";

export interface TierSpec {
  id: VehicleTier;
  label: string;
  /** 이 차종에 태우는 최대 인원 (여유 좌석·짐 고려) */
  max: number;
  /** 대절료 기본 비율 (승용 = 1) — 조회한 차종별 요금이 없을 때만 쓴다 */
  factor: number;
}

/** 차종 — 이름은 자동 구성(vehicleClassFor)·당일투어와 같은 표기 */
export const VEHICLE_TIERS: TierSpec[] = [
  { id: "car", label: "승용차·SUV (4인승)", max: 3, factor: 1 },
  { id: "suv", label: "7인승 SUV·MPV", max: 6, factor: 1.3 },
  { id: "van", label: "미니밴 (15~16인승)", max: 12, factor: 1.7 },
  { id: "midbus", label: "중형버스 (25~29인승)", max: 25, factor: 2.4 },
  { id: "bus", label: "대형버스 (45인승)", max: 45, factor: 3 },
];
const BUS_MAX = 45;
export const DEFAULT_GUIDE_CAPACITY = 45;

export const tierSpec = (id: VehicleTier): TierSpec => VEHICLE_TIERS.find((t) => t.id === id)!;

export interface GroundPlan {
  travelers: number;
  tier: VehicleTier;
  tierLabel: string;
  /** 차량 대수 (45명을 넘으면 같은 차종 여러 대로 고르게 나눈다) */
  count: number;
  guides: number;
  /** "대형버스 (45인승) 2대 · 가이드 2명" */
  label: string;
}

/** 인원에 맞는 차종·대수·가이드 수 */
export function groundPlan(travelers: number, guideCapacity = DEFAULT_GUIDE_CAPACITY): GroundPlan {
  const n = Math.max(1, Math.round(travelers));
  const count = Math.ceil(n / BUS_MAX);
  const perCar = Math.ceil(n / count);
  const spec = VEHICLE_TIERS.find((t) => perCar <= t.max) ?? VEHICLE_TIERS[VEHICLE_TIERS.length - 1];
  const cap = Math.max(1, Math.round(guideCapacity || DEFAULT_GUIDE_CAPACITY));
  const guides = Math.max(1, Math.ceil(n / cap));
  return { travelers: n, tier: spec.id, tierLabel: spec.label, count, guides, label: `${spec.label} ${count}대 · 가이드 ${guides}명` };
}

/** 요금표·업체 견적의 차량 이름 → 차종 ("45인승 버스", "16-seater van", "Toyota Innova" 등). 모르면 null */
export function tierOfLabel(label: string): VehicleTier | null {
  const t = label.toLowerCase();
  const seats = Number(/(\d{1,2})\s*(?:인승|seat|seater|석|인)/.exec(t)?.[1] ?? NaN);
  if (Number.isFinite(seats) && seats > 0) {
    if (seats <= 5) return "car";
    if (seats <= 9) return "suv";
    if (seats <= 18) return "van";
    if (seats <= 35) return "midbus";
    return "bus";
  }
  if (/대형|coach|large bus|big bus|관광버스/.test(t)) return "bus";
  if (/중형|소형버스|미니버스|minibus|mini bus|coaster|카운티/.test(t)) return "midbus";
  if (/버스|bus/.test(t)) return "bus";
  if (/밴|van|스타렉스|스프린터|sprinter|hiace|하이에이스|솔라티/.test(t)) return "van";
  if (/mpv|suv|7인|카니발|innova|이노바/.test(t)) return "suv";
  if (/승용|세단|sedan|car|택시/.test(t)) return "car";
  return null;
}

type ScaleInput = Pick<TripInput, "travelers" | "vehicleCostPerDay" | "guideCostPerDay"> & Partial<Pick<TripInput, "groundScale" | "guideCapacity" | "vehicleTierRates">>;

/** 차량 1일 비용 비중 — 조회한 차종 요금이 있으면 그 값, 없으면 기본 비율 */
function vehicleWeight(plan: GroundPlan, rates: Partial<Record<VehicleTier, number>> | undefined): { value: number; fromRates: boolean } {
  const rate = rates?.[plan.tier] ?? 0;
  return rate > 0 ? { value: rate * plan.count, fromRates: true } : { value: tierSpec(plan.tier).factor * plan.count, fromRates: false };
}

export interface ScaledGround {
  vehiclePerDay: number;
  guidePerDay: number;
  plan: GroundPlan;
  /** 지금 인원과 차종·대수·가이드 수가 달라 금액을 바꿨는지 */
  scaled: boolean;
}

/** 인원 n일 때의 차량비·가이드비(1일). groundScale이 "fixed"면 지금 금액 그대로 */
export function scaledGround(input: ScaleInput, n: number): ScaledGround {
  const cap = input.guideCapacity || DEFAULT_GUIDE_CAPACITY;
  const plan = groundPlan(n, cap);
  const base = groundPlan(input.travelers, cap);
  const same = plan.tier === base.tier && plan.count === base.count && plan.guides === base.guides;
  if (input.groundScale === "fixed" || same) return { vehiclePerDay: input.vehicleCostPerDay, guidePerDay: input.guideCostPerDay, plan, scaled: false };

  const rates = input.vehicleTierRates;
  let a = vehicleWeight(plan, rates);
  let b = vehicleWeight(base, rates);
  // 두 인원 중 한쪽만 조회 요금이 있으면 비율이 섞이므로 둘 다 기본 비율로
  if (a.fromRates !== b.fromRates) {
    a = vehicleWeight(plan, undefined);
    b = vehicleWeight(base, undefined);
  }
  const vehiclePerDay = Math.round((input.vehicleCostPerDay * a.value) / b.value);
  const guidePerDay = Math.round((input.guideCostPerDay * plan.guides) / base.guides);
  return { vehiclePerDay, guidePerDay, plan, scaled: vehiclePerDay !== input.vehicleCostPerDay || guidePerDay !== input.guideCostPerDay };
}

/** 인원별 가격표 등에서 차종·가이드 수가 바뀌는 인원 (앞 인원과 다르면 true) */
export function planChanges(sizes: number[], guideCapacity?: number): Set<number> {
  const out = new Set<number>();
  let prev: GroundPlan | null = null;
  for (const n of [...sizes].sort((x, y) => x - y)) {
    const p = groundPlan(n, guideCapacity);
    if (prev && (p.tier !== prev.tier || p.count !== prev.count || p.guides !== prev.guides)) out.add(n);
    prev = p;
  }
  return out;
}

/** 인원 n으로 바꾼 입력 — 차량비·가이드비도 차종·대수·가이드 수에 맞춰 바꾼다 (인원별 판매가 표처럼 입력째 다시 계산할 때) */
export function inputAtTravelers<T extends ScaleInput>(input: T, n: number): T {
  const g = scaledGround(input, n);
  return { ...input, travelers: n, vehicleCostPerDay: g.vehiclePerDay, guideCostPerDay: g.guidePerDay };
}
