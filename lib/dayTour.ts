import { vehicleClassFor } from "@/lib/autoBuild";
import { fmt, hm, km as straightKm } from "@/lib/courseEngine/time";
import { MAX_CONTINUOUS_DRIVE, REQUIRED_REST } from "@/lib/driverHours";
import { roundUpPrice } from "@/lib/priceRound";
import type { DayTourLeg, DayTourRequest, DayTourResponse, DayTourStop, DayTourTransport, LegMode } from "@/lib/schemas/dayTour";
import type { SharedItinerary } from "@/lib/shareItinerary";
import type { CurrencyCode, TourCandidate } from "@/types";

/**
 * 근교 투어(반일·당일) — 코스(장소·이동 구간)와 원가·판매가를 계산한다. AI는 장소·거리·시세를 찾아 오고, 계산은 모두 여기서 한다(늘 같은 결과, 테스트 가능).
 *
 * 원가 (업계 방식)
 *  - 차량 (거리 원가형): 유류비(운행 km ÷ 연비 × 유가, 공차 거리 포함) + 통행료 + 주차비 + 기사 인건비(기본 일당 + 초과 시간 + 식비) + 차량 고정비(감가·보험·정비)
 *  - 차량 (대절 시세형): 기사 포함 대절 요금(반일·당일) + 초과 시간 + 대절료에 안 들어간 통행료·주차비
 *  - 가이드: 반일·당일 요금 + 초과 시간 + 식비, 대중교통 구간 가이드 교통비. 가이드 1명이 맡는 인원(차량 45·대중교통 15·도보 20명)을 넘으면 더 붙인다
 *  - 1인: 입장료·체험료·식대, 대중교통 요금, 여행자보험
 * 1인 원가 = (차량 + 가이드) ÷ 인원 + 1인 비용, 판매가 = 1인 원가 ÷ (1 − 마진율)을 통화 단위로 올림
 */

export type DayTourLength = "half" | "full";

/** 반일·당일 기준 근무 시간(분) — 넘으면 초과 수당 */
export const STANDARD_MINUTES: Record<DayTourLength, number> = { half: 300, full: 600 };
/** 반일 대절·인건비를 당일 대비 얼마로 보는지 */
const HALF_RATIO = 0.6;
/** 공차(빈 차) 이동 평균 속도 km/h */
const DEADHEAD_SPEED = 40;

/** 차종별 기본값 — 연비(km/L, 경유 관광 운행 평균), 차량 고정비·대절료 비율(승용 = 1), 국내 고속도로 통행료 차종 */
const VEHICLE_SPECS: { max: number; kmPerL: number; costFactor: number; tollClass: string }[] = [
  { max: 3, kmPerL: 11, costFactor: 1, tollClass: "1종" },
  { max: 6, kmPerL: 9, costFactor: 1.3, tollClass: "1종" },
  { max: 12, kmPerL: 7, costFactor: 1.7, tollClass: "1종" },
  { max: 25, kmPerL: 5, costFactor: 2.4, tollClass: "2종" },
  { max: 45, kmPerL: 3.5, costFactor: 3, tollClass: "3종" },
];
const BUS_CAPACITY = 45;

export interface DayTourVehicle {
  label: string;
  /** 대수 (45명 넘으면 대형버스 여러 대) */
  count: number;
  kmPerL: number;
  costFactor: number;
  tollClass: string;
}

/** 인원에 맞는 차종과 대수 */
export function vehicleFor(travelers: number): DayTourVehicle {
  const n = Math.max(1, Math.round(travelers));
  const count = Math.ceil(n / BUS_CAPACITY);
  const perCar = Math.ceil(n / count);
  const spec = VEHICLE_SPECS.find((v) => perCar <= v.max) ?? VEHICLE_SPECS[VEHICLE_SPECS.length - 1];
  return { label: vehicleClassFor(perCar), count, kmPerL: spec.kmPerL, costFactor: spec.costFactor, tollClass: spec.tollClass };
}

/** 가이드 1명이 맡는 인원 — 대중교통은 타고 내릴 때 놓치지 않게 적게 */
export const GUIDE_CAPACITY: Record<DayTourTransport, number> = { vehicle: BUS_CAPACITY, mixed: BUS_CAPACITY, transit: 15, walk: 20 };

export interface DayTourSettings {
  /** 차량 원가를 거리로 계산할지(distance), 대절 시세로 볼지(charter) */
  vehicleMethod: "distance" | "charter";
  /** 경유 1L */
  fuelPrice: number;
  /** 연비 km/L (지금 차종). 0이면 차종 기본값 */
  kmPerL: number;
  /** 차고지 왕복 공차 거리 km */
  deadheadKm: number;
  /** 기사 당일 인건비 (반일은 60%) */
  driverDay: number;
  driverMeal: number;
  /** 기사·가이드 초과 1시간 */
  overtimePerHour: number;
  /** 차량 고정비(감가·보험·정비) 지금 차종 1대 1일 (반일은 60%) */
  vehicleFixedDay: number;
  /** 기사 포함 대절 요금 지금 차종 1대 */
  charterDay: number;
  charterHalf: number;
  /** 대절 요금에 통행료·주차비가 들어 있는지 */
  charterToll: boolean;
  charterParking: boolean;
  guideDay: number;
  guideHalf: number;
  guideMeal: number;
  insurancePerPerson: number;
  /** 목표 마진율 % */
  marginRate: number;
}

/** 원화 국내 기본값 (예시 — 회사 기준으로 고쳐 저장해 쓴다) */
export const KRW_DEFAULTS: Omit<DayTourSettings, "vehicleMethod" | "charterToll" | "charterParking" | "kmPerL" | "deadheadKm" | "charterDay" | "charterHalf"> = {
  fuelPrice: 1600,
  driverDay: 200000,
  driverMeal: 12000,
  overtimePerHour: 25000,
  vehicleFixedDay: 60000,
  guideDay: 200000,
  guideHalf: 120000,
  guideMeal: 12000,
  insurancePerPerson: 2000,
  marginRate: 20,
};
/** 회사가 저장해 두는 값 (유가·대절 시세·공차 거리처럼 투어마다 바뀌는 것은 빼고) */
export const COMPANY_KEYS = ["driverDay", "driverMeal", "overtimePerHour", "vehicleFixedDay", "guideDay", "guideHalf", "guideMeal", "insurancePerPerson", "marginRate"] as const;
export type CompanyDayTourDefaults = Partial<Pick<DayTourSettings, (typeof COMPANY_KEYS)[number]>>;

/** 대절 포함 내역 글에 그 항목이 '포함'으로 적혀 있는지 (별도·불포함이면 false) */
export function chargeIncluded(text: string, word: string): boolean {
  // 쉼표로 나뉜 구절에서 그 항목 뒤(예: "통행료·주차비 별도")나 앞(예: "불포함: 통행료")에 별도·불포함이 있으면 포함이 아니다
  const clause = text.split(/[,，;|\n]/).find((p) => p.includes(word));
  if (!clause) return false;
  const i = clause.indexOf(word);
  const neg = /별도|불포함|제외|미포함|not included/i;
  const after = clause.slice(i + word.length);
  if (neg.test(after)) return false;
  return !(neg.test(clause.slice(0, i)) && !/포함/.test(after.replace(neg, "")));
}

/** 조사 결과로 원가 기본값을 채운다 — 원화면 국내 기본값으로 빈 곳을 메우고, 회사 저장값이 있으면 그것을 먼저 쓴다 */
export function initialSettings(res: DayTourResponse, req: Pick<DayTourRequest, "currency" | "tripScope" | "length">, company: CompanyDayTourDefaults = {}): DayTourSettings {
  const krw = req.currency === "KRW" ? KRW_DEFAULTS : null;
  const pick = (ai: number, fallback: number | undefined) => (ai > 0 ? Math.round(ai) : (fallback ?? 0));
  const base: DayTourSettings = {
    vehicleMethod: req.tripScope === "domestic" ? "distance" : "charter",
    fuelPrice: pick(res.fuelPrice, krw?.fuelPrice),
    kmPerL: 0,
    deadheadKm: Math.max(0, Math.round(res.deadheadKm)),
    driverDay: pick(res.driverDayRate, krw?.driverDay),
    driverMeal: krw?.driverMeal ?? 0,
    overtimePerHour: krw?.overtimePerHour ?? 0,
    vehicleFixedDay: krw?.vehicleFixedDay ?? 0,
    charterDay: Math.round(Math.max(0, res.charterDayRate)),
    charterHalf: Math.round(Math.max(0, res.charterHalfDayRate || res.charterDayRate * HALF_RATIO)),
    charterToll: chargeIncluded(res.charterIncludes, "통행료"),
    charterParking: chargeIncluded(res.charterIncludes, "주차"),
    guideDay: pick(res.guideDayRate, krw?.guideDay),
    guideHalf: pick(res.guideHalfDayRate || res.guideDayRate * HALF_RATIO, krw?.guideHalf),
    guideMeal: krw?.guideMeal ?? 0,
    insurancePerPerson: krw?.insurancePerPerson ?? 0,
    marginRate: KRW_DEFAULTS.marginRate,
  };
  // 해외에서 거리 원가를 계산할 기사·고정비를 모르면 대절 시세로
  if (base.vehicleMethod === "distance" && (base.driverDay === 0 || base.fuelPrice === 0) && base.charterDay > 0) base.vehicleMethod = "charter";
  for (const k of COMPANY_KEYS) if (company[k] != null && req.currency === "KRW") base[k] = company[k]!;
  return base;
}

/* ── 구간 ── */

/** 도로·노선 거리(km)로 이동 시간 어림 — 도보 4.5km/h, 차량 시내 25km/h·교외 50km/h(+주차 5분), 대중교통 18km/h + 대기 8분 */
export function minutesFor(roadKm: number, mode: LegMode): number {
  const d = Math.max(0, roadKm);
  if (d < 0.05) return 0;
  if (mode === "walk") return Math.max(3, Math.round((d / 4.5) * 60));
  if (mode === "transit") return Math.round((d / 18) * 60 + 8);
  return Math.round((d / (d < 8 ? 25 : 50)) * 60 + 5);
}

/** 구간 수단을 바꾼다 — 거리는 그대로, 시간·요금은 어림(구글·검색 값이 아니므로 estimated) */
export function changeLegMode(leg: DayTourLeg, mode: LegMode, transitBaseFare: number): DayTourLeg {
  if (leg.mode === mode) return leg;
  return {
    ...leg,
    mode,
    minutes: minutesFor(leg.km, mode),
    transitFare: mode === "transit" ? Math.round(transitBaseFare * (leg.km > 10 ? 1.5 : 1)) : 0,
    toll: mode === "vehicle" ? leg.toll : 0,
    route: mode === "walk" ? "도보" : "",
    basis: "estimated",
  };
}

interface Point {
  name: string;
  lat: number;
  lng: number;
}
const known = (p: { lat: number; lng: number }) => p.lat !== 0 || p.lng !== 0;

/** 구간 i의 출발·도착 (0번은 기준지 → 첫 장소, 마지막은 마지막 장소 → 기준지) */
export function legEnds(baseName: string, base: { lat: number; lng: number }, stops: DayTourStop[], i: number): [Point, Point] {
  const at = (k: number): Point => (k < 0 || k >= stops.length ? { name: baseName, ...base } : { name: stops[k].name, lat: stops[k].lat, lng: stops[k].lng });
  return [at(i - 1), at(i)];
}

/** 구간 수가 장소 수 + 1이 되도록 맞추고, 빠지거나 이상한 구간은 직선거리 × 1.35로 어림한다 */
export function normalizeLegs(
  raw: readonly Partial<DayTourLeg>[],
  stops: DayTourStop[],
  base: { name: string; lat: number; lng: number },
  transport: DayTourTransport,
  transitBaseFare: number,
): DayTourLeg[] {
  const want = stops.length + 1;
  const fallbackMode: LegMode = transport === "mixed" ? "vehicle" : transport;
  return Array.from({ length: want }, (_, i) => {
    const r: Partial<DayTourLeg> | undefined = raw[i];
    const [a, b] = legEnds(base.name, base, stops, i);
    const line = known(a) && known(b) ? straightKm(a, b) : null;
    let mode: LegMode = r?.mode ?? fallbackMode;
    // 정한 이동 방식과 다른 수단이 섞여 오면 맞춘다 (도보 1.5km 이하는 어느 방식이든 걸어도 된다)
    if (transport !== "mixed" && mode !== transport && !(mode === "walk" && (r?.km ?? 99) <= 1.5)) mode = transport;
    const kmOk = r && r.km != null && r.km > 0 && (line == null || r.km >= line * 0.8);
    const km = kmOk ? r!.km! : line != null ? Math.round(line * 1.35 * 10) / 10 : (r?.km ?? 0);
    const sameMode = r?.mode === mode;
    const minutes = kmOk && sameMode && r!.minutes! > 0 ? Math.round(r!.minutes!) : minutesFor(km, mode);
    return {
      mode,
      km: Math.round(km * 10) / 10,
      minutes,
      route: sameMode ? (r?.route ?? "").trim() : mode === "walk" ? "도보" : "",
      transitFare: mode === "transit" ? Math.max(0, Math.round(sameMode && r?.transitFare ? r.transitFare : transitBaseFare)) : 0,
      toll: mode === "vehicle" ? Math.max(0, Math.round(r?.toll ?? 0)) : 0,
      basis: kmOk && sameMode ? (r?.basis ?? "searched") : "estimated",
    };
  });
}

/* ── 시간표 ── */

export interface TimelineRow {
  kind: "leg" | "stop";
  index: number;
  label: string;
  start: number;
  end: number;
}

export interface DayTourTimeline {
  rows: TimelineRow[];
  startMin: number;
  endMin: number;
  totalMinutes: number;
  /** 이동 수단별 이동 시간·거리 */
  byMode: Record<LegMode, { minutes: number; km: number }>;
}

const MODE_TEXT: Record<LegMode, string> = { vehicle: "차량", transit: "대중교통", walk: "도보" };
export const legModeText = (m: LegMode) => MODE_TEXT[m];

export function dayTourTimeline(baseName: string, stops: DayTourStop[], legs: DayTourLeg[], start: string): DayTourTimeline {
  const startMin = hm(start) ?? 540;
  let t = startMin;
  const rows: TimelineRow[] = [];
  const byMode: DayTourTimeline["byMode"] = { vehicle: { minutes: 0, km: 0 }, transit: { minutes: 0, km: 0 }, walk: { minutes: 0, km: 0 } };
  legs.forEach((leg, i) => {
    const to = i < stops.length ? stops[i].name : baseName;
    rows.push({ kind: "leg", index: i, label: `${MODE_TEXT[leg.mode]} → ${to}`, start: t, end: t + leg.minutes });
    byMode[leg.mode].minutes += leg.minutes;
    byMode[leg.mode].km += leg.km;
    t += leg.minutes;
    if (i < stops.length) {
      rows.push({ kind: "stop", index: i, label: stops[i].name, start: t, end: t + stops[i].stayMinutes });
      t += stops[i].stayMinutes;
    }
  });
  return { rows, startMin, endMin: t, totalMinutes: t - startMin, byMode };
}

/* ── 원가 ── */

export interface CostLine {
  id: string;
  label: string;
  amount: number;
  /** group: 일행 전체에 한 번 / person: 1인당 */
  per: "group" | "person";
  note: string;
}

export interface DayTourCostInput {
  stops: DayTourStop[];
  legs: DayTourLeg[];
  baseName: string;
  start: string;
  length: DayTourLength;
  transport: DayTourTransport;
  travelers: number;
  guide: boolean;
  currency: CurrencyCode;
  settings: DayTourSettings;
}

export interface DayTourCost {
  lines: CostLine[];
  vehicle: DayTourVehicle | null;
  guides: number;
  /** 일행 전체 공동 비용 (차량·가이드) */
  groupTotal: number;
  /** 1인 비용 합 */
  personTotal: number;
  totalCost: number;
  costPerPerson: number;
  salePrice: number;
  profitPerPerson: number;
  /** 거리 원가형·대절 시세형 차량 비용 (둘 다 계산할 수 있으면 비교용) */
  vehicleCompare: { distance: number; charter: number } | null;
  /** 기사·가이드 초과 시간 */
  overtimeHours: { driver: number; guide: number };
}

const lengthRate = (length: DayTourLength, day: number, half?: number) => (length === "full" ? day : half && half > 0 ? half : day * HALF_RATIO);
const overHours = (worked: number, length: DayTourLength) => Math.max(0, Math.ceil((worked - STANDARD_MINUTES[length]) / 60 - 1e-9));

/** 차량 원가 — 거리 원가형·대절 시세형 각각 (지금 인원의 차종·대수 기준) */
function vehicleCosts(c: DayTourCostInput, v: DayTourVehicle, tourMinutes: number) {
  const s = c.settings;
  const vehicleLegs = c.legs.filter((l) => l.mode === "vehicle");
  const driveKm = vehicleLegs.reduce((sum, l) => sum + l.km, 0) + s.deadheadKm;
  const toll = vehicleLegs.reduce((sum, l) => sum + l.toll, 0);
  const parking = c.stops.reduce((sum, st, i) => sum + (c.legs[i]?.mode === "vehicle" ? st.parkingFee : 0), 0);
  const kmPerL = s.kmPerL > 0 ? s.kmPerL : v.kmPerL;
  // 지금 차종 기준으로 넣은 값을 다른 차종(인원별 가격표)에서는 차종 비율로 바꾼다
  const ref = vehicleFor(c.travelers);
  const scale = v.costFactor / ref.costFactor;
  const effRatio = v.kmPerL / ref.kmPerL;
  const kmPerLFor = s.kmPerL > 0 ? s.kmPerL * effRatio : kmPerL;
  const worked = tourMinutes + (s.deadheadKm / DEADHEAD_SPEED) * 60;
  const ot = overHours(worked, c.length);
  const fuel = s.fuelPrice > 0 ? (driveKm / kmPerLFor) * s.fuelPrice : 0;
  const driver = lengthRate(c.length, s.driverDay) + ot * s.overtimePerHour + s.driverMeal;
  const fixed = lengthRate(c.length, s.vehicleFixedDay) * scale;
  const charterBase = lengthRate(c.length, s.charterDay, s.charterHalf) * scale;
  return {
    driveKm,
    kmPerL: kmPerLFor,
    ot,
    fuel: fuel * v.count,
    toll: toll * v.count,
    parking: parking * v.count,
    driver: driver * v.count,
    fixed: fixed * v.count,
    charter: (charterBase + ot * s.overtimePerHour) * v.count,
    charterExtra: ((s.charterToll ? 0 : toll) + (s.charterParking ? 0 : parking)) * v.count,
  };
}

export function dayTourCost(c: DayTourCostInput, salePriceOverride?: number): DayTourCost {
  const s = c.settings;
  const n = Math.max(1, Math.round(c.travelers));
  const tl = dayTourTimeline(c.baseName, c.stops, c.legs, c.start);
  const money = (v: number) => Math.round(v);
  const lines: CostLine[] = [];
  const usesVehicle = c.legs.some((l) => l.mode === "vehicle");
  const vehicle = usesVehicle ? vehicleFor(n) : null;
  let vehicleCompare: DayTourCost["vehicleCompare"] = null;
  let driverOt = 0;

  if (vehicle) {
    const vc = vehicleCosts(c, vehicle, tl.totalMinutes);
    driverOt = vc.ot;
    const cars = vehicle.count > 1 ? ` × ${vehicle.count}대` : "";
    const distanceTotal = vc.fuel + vc.toll + vc.parking + vc.driver + vc.fixed;
    const charterTotal = vc.charter + vc.charterExtra;
    if (s.vehicleMethod === "distance") {
      lines.push(
        { id: "fuel", label: "유류비", amount: money(vc.fuel), per: "group", note: `${Math.round(vc.driveKm)}km(공차 ${s.deadheadKm}km 포함) ÷ ${vc.kmPerL.toFixed(1)}km/L × ${s.fuelPrice.toLocaleString()}${cars}` },
        { id: "toll", label: "통행료", amount: money(vc.toll), per: "group", note: `${vehicle.label}${c.currency === "KRW" ? ` (고속도로 ${vehicle.tollClass})` : ""}${cars}` },
        { id: "parking", label: "주차비", amount: money(vc.parking), per: "group", note: `차량으로 가는 장소${cars}` },
        { id: "driver", label: "기사 인건비", amount: money(vc.driver), per: "group", note: `${c.length === "full" ? "당일" : "반일"} 기본${vc.ot > 0 ? ` + 초과 ${vc.ot}시간` : ""} + 식비${cars}` },
        { id: "fixed", label: "차량 고정비", amount: money(vc.fixed), per: "group", note: `감가·보험·정비 ${c.length === "full" ? "1일" : "반일"}${cars}` },
      );
    } else {
      lines.push(
        { id: "charter", label: "차량 대절", amount: money(vc.charter), per: "group", note: `${vehicle.label} 기사 포함 ${c.length === "full" ? "당일" : "반일"}${vc.ot > 0 ? ` + 초과 ${vc.ot}시간` : ""}${cars}` },
        { id: "charterExtra", label: "통행료·주차비 (대절 별도분)", amount: money(vc.charterExtra), per: "group", note: [s.charterToll ? "통행료 대절 포함" : "통행료 별도", s.charterParking ? "주차비 대절 포함" : "주차비 별도"].join(" · ") },
      );
    }
    if (s.fuelPrice > 0 && s.driverDay > 0 && s.charterDay > 0) vehicleCompare = { distance: money(distanceTotal), charter: money(charterTotal) };
  }

  const guides = c.guide ? Math.max(1, Math.ceil(n / GUIDE_CAPACITY[c.transport])) : 0;
  const guideOt = overHours(tl.totalMinutes, c.length);
  if (guides > 0) {
    const g = lengthRate(c.length, s.guideDay, s.guideHalf) + guideOt * s.overtimePerHour + s.guideMeal;
    lines.push({ id: "guide", label: "가이드", amount: money(g * guides), per: "group", note: `${c.length === "full" ? "당일" : "반일"}${guideOt > 0 ? ` + 초과 ${guideOt}시간` : ""} + 식비${guides > 1 ? ` × ${guides}명 (1명당 ${GUIDE_CAPACITY[c.transport]}명)` : ""}` });
    const guideFare = c.legs.reduce((sum, l) => sum + (l.mode === "transit" ? l.transitFare : 0), 0) * guides;
    if (guideFare > 0) lines.push({ id: "guideFare", label: "가이드 교통비", amount: money(guideFare), per: "group", note: "대중교통 구간 요금" });
  }

  const entries = c.stops.reduce((sum, st) => sum + (st.kind === "meal" ? 0 : st.entryFee), 0);
  const meals = c.stops.reduce((sum, st) => sum + (st.kind === "meal" ? st.entryFee : 0), 0);
  const fares = c.legs.reduce((sum, l) => sum + (l.mode === "transit" ? l.transitFare : 0), 0);
  lines.push({ id: "entry", label: "입장료·체험료", amount: money(entries), per: "person", note: `${c.stops.filter((st) => st.kind !== "meal" && st.entryFee > 0).length}곳` });
  if (meals > 0) lines.push({ id: "meal", label: "식사", amount: money(meals), per: "person", note: c.stops.filter((st) => st.kind === "meal").map((st) => st.name).join(", ") });
  if (fares > 0) lines.push({ id: "fare", label: "대중교통 요금", amount: money(fares), per: "person", note: `${c.legs.filter((l) => l.mode === "transit").length}구간` });
  if (s.insurancePerPerson > 0) lines.push({ id: "insurance", label: "여행자보험", amount: money(s.insurancePerPerson), per: "person", note: "1일" });

  const groupTotal = lines.filter((l) => l.per === "group").reduce((sum, l) => sum + l.amount, 0);
  const personTotal = lines.filter((l) => l.per === "person").reduce((sum, l) => sum + l.amount, 0);
  const totalCost = groupTotal + personTotal * n;
  const costPerPerson = totalCost / n;
  const keep = Math.max(0.05, 1 - s.marginRate / 100);
  const salePrice = salePriceOverride ?? roundUpPrice(costPerPerson / keep, c.currency);
  return {
    lines,
    vehicle,
    guides,
    groupTotal,
    personTotal,
    totalCost,
    costPerPerson,
    salePrice,
    profitPerPerson: salePrice - costPerPerson,
    vehicleCompare,
    overtimeHours: { driver: driverOt, guide: c.guide ? guideOt : 0 },
  };
}

/* ── 인원별 가격표·손익분기 ── */

export interface PaxRow {
  travelers: number;
  vehicle: string;
  guides: number;
  costPerPerson: number;
  salePrice: number;
  /** 차종·가이드 수가 앞 줄과 달라진 곳 (1인 가격이 뛰는 지점) */
  step: boolean;
  isCurrent: boolean;
}

const PAX_POINTS = [1, 2, 3, 4, 6, 8, 10, 12, 13, 15, 16, 20, 25, 26, 30, 35, 40, 45];
/** 이동 방식별 받을 수 있는 최대 인원 */
export const MAX_TRAVELERS: Record<DayTourTransport, number> = { vehicle: 90, mixed: 90, transit: 45, walk: 40 };

/** 인원별 1인 원가·판매가 (차종·가이드 수가 바뀌는 지점 표시) */
export function paxTable(c: DayTourCostInput): PaxRow[] {
  const max = MAX_TRAVELERS[c.transport];
  const points = [...new Set([...PAX_POINTS, c.travelers])].filter((n) => n >= 1 && n <= max).sort((a, b) => a - b);
  let prevKey = "";
  return points.map((n) => {
    const r = dayTourCost({ ...c, travelers: n });
    const key = `${r.vehicle?.label ?? ""}/${r.vehicle?.count ?? 0}/${r.guides}`;
    const step = prevKey !== "" && key !== prevKey;
    prevKey = key;
    return {
      travelers: n,
      vehicle: r.vehicle ? `${r.vehicle.label}${r.vehicle.count > 1 ? ` × ${r.vehicle.count}` : ""}` : "",
      guides: r.guides,
      costPerPerson: r.costPerPerson,
      salePrice: r.salePrice,
      step,
      isCurrent: n === c.travelers,
    };
  });
}

/** 이 판매가로 손해 보지 않는 최소 인원 (없으면 null) */
export function breakEven(c: DayTourCostInput, salePrice: number): number | null {
  for (let n = 1; n <= MAX_TRAVELERS[c.transport]; n++) {
    const r = dayTourCost({ ...c, travelers: n }, salePrice);
    if (salePrice * n >= r.totalCost) return n;
  }
  return null;
}

/** 1인 판매가가 이 값 이하가 되는 최소 인원 (시장 가격에 맞추려면 몇 명이 모여야 하나). 안 되면 null */
export function travelersForPrice(c: DayTourCostInput, price: number): number | null {
  for (let n = 1; n <= MAX_TRAVELERS[c.transport]; n++) if (dayTourCost({ ...c, travelers: n }).salePrice <= price) return n;
  return null;
}

/* ── 점검 ── */

export interface DayTourWarning {
  tone: "warn" | "info";
  text: string;
}

export function dayTourWarnings(c: DayTourCostInput, res: Pick<DayTourResponse, "baseLat" | "baseLng" | "searched" | "fuelNote">): DayTourWarning[] {
  const out: DayTourWarning[] = [];
  const tl = dayTourTimeline(c.baseName, c.stops, c.legs, c.start);
  const std = STANDARD_MINUTES[c.length];
  const h = (m: number) => `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}`;
  if (tl.totalMinutes > std + 30) out.push({ tone: "warn", text: `${c.length === "full" ? "당일" : "반일"} 기준 ${h(std)}을 넘습니다 (${h(tl.totalMinutes)}, ${fmt(tl.endMin)} 복귀). 장소를 빼거나 머무는 시간을 줄이세요 — 넘는 시간은 기사·가이드 초과 수당으로 계산했습니다.` });
  else if (tl.totalMinutes < std * (c.length === "full" ? 0.65 : 0.6)) out.push({ tone: "info", text: `${h(tl.totalMinutes)}로 ${c.length === "full" ? "당일" : "반일"} 기준보다 짧습니다. 장소를 하나 더 넣거나 반일 투어로 바꿀 수 있습니다.` });

  // 기사 연속 운전 (손님이 15분 이상 머무는 곳은 쉬는 시간)
  let drive = 0;
  let rest = 0;
  c.legs.forEach((leg, i) => {
    if (leg.mode === "vehicle") drive += leg.minutes;
    if (drive > MAX_CONTINUOUS_DRIVE) {
      out.push({ tone: "warn", text: `차량 ${h(drive)} 연속 운전 — ${MAX_CONTINUOUS_DRIVE / 60}시간마다 ${REQUIRED_REST}분 이상 쉬어야 합니다 (휴게소 정차를 넣으세요).` });
      drive = 0;
    }
    const stay = c.stops[i]?.stayMinutes ?? 0;
    if (stay >= 15) rest += stay;
    if (rest >= REQUIRED_REST) {
      drive = 0;
      rest = 0;
    }
  });

  const walkKm = tl.byMode.walk.km;
  if (c.transport === "walk" && walkKm > 8) out.push({ tone: "warn", text: `도보 ${walkKm.toFixed(1)}km — 도보 투어는 보통 5~8km 안팎입니다. 긴 구간은 대중교통으로 바꾸세요.` });
  c.legs.forEach((leg, i) => {
    const [a, b] = legEnds(c.baseName, { lat: res.baseLat, lng: res.baseLng }, c.stops, i);
    if (leg.mode === "walk" && leg.km > 2.5 && c.transport !== "walk") out.push({ tone: "warn", text: `${a.name} → ${b.name} 도보 ${leg.km}km (${leg.minutes}분) — 차량·대중교통으로 바꾸는 것이 좋습니다.` });
    if (leg.mode === "transit" && leg.minutes > 75) out.push({ tone: "warn", text: `${a.name} → ${b.name} 대중교통 ${h(leg.minutes)} — 환승이 많으면 단체가 놓치기 쉽습니다. 차량 구간으로 바꿔 보세요.` });
    if (known(a) && known(b) && leg.km > 0) {
      const line = straightKm(a, b);
      if (line > 1 && leg.km > line * 3 + 3) out.push({ tone: "info", text: `${a.name} → ${b.name} ${leg.km}km는 직선거리(${line.toFixed(1)}km)보다 많이 깁니다 — 거리 확인이 필요합니다.` });
    }
  });
  if (c.transport === "transit" && c.travelers > 30) out.push({ tone: "warn", text: `대중교통 ${c.travelers}명 — 한 번에 타기 어렵습니다. 차량 투어를 권합니다.` });
  if (c.transport === "transit" && c.guide && c.travelers > GUIDE_CAPACITY.transit) out.push({ tone: "info", text: `대중교통은 가이드 1명당 ${GUIDE_CAPACITY.transit}명까지로 보고 가이드를 늘려 계산했습니다.` });

  const s = c.settings;
  if (c.legs.some((l) => l.mode === "vehicle")) {
    if (s.vehicleMethod === "distance") {
      if (s.fuelPrice === 0) out.push({ tone: "warn", text: "유가가 0입니다 — 유류비가 빠졌습니다. 원가 설정에서 경유 가격을 넣으세요." });
      if (s.driverDay === 0) out.push({ tone: "warn", text: "기사 인건비가 0입니다 — 원가 설정에서 넣으세요." });
      if (s.deadheadKm === 0) out.push({ tone: "info", text: "공차 거리(차고지 ↔ 출발지)가 0입니다. 차고지가 멀면 넣어야 유류비·기사 시간이 맞습니다." });
    } else if (s.charterDay === 0) out.push({ tone: "warn", text: "대절 요금을 찾지 못했습니다 — 원가 설정에서 넣거나 거리 원가형으로 바꾸세요." });
    const r = dayTourCost(c);
    if (r.vehicleCompare) {
      const { distance, charter } = r.vehicleCompare;
      const gap = Math.abs(distance - charter) / Math.max(distance, charter);
      if (gap > 0.3) out.push({ tone: "info", text: `차량 원가가 거리 계산 ${distance.toLocaleString()} / 대절 시세 ${charter.toLocaleString()}로 ${Math.round(gap * 100)}% 차이 납니다 — 기사 인건비·고정비나 대절 시세를 확인하세요.` });
    }
  }
  if (c.legs.some((l) => l.basis === "estimated")) out.push({ tone: "info", text: "\"어림\" 표시 구간은 직선거리로 계산했습니다. 길찾기로 확인하면 더 정확합니다." });
  if (!res.searched) out.push({ tone: "warn", text: "웹 검색 근거를 얻지 못해 AI가 기억으로 만든 코스입니다. 장소·요금을 꼭 확인하세요." });
  return out;
}

/* ── 시장 시세 비교 ── */

export interface MarketPosition {
  /** 싼 순서 몇 번째 (1 = 가장 저렴) */
  rank: number;
  total: number;
  median: number | null;
}

export function marketPosition(salePrice: number, market: DayTourResponse["market"]): MarketPosition {
  const mids = market.map((m) => (m.priceLow + m.priceHigh) / 2).filter((v) => v > 0).sort((a, b) => a - b);
  return {
    rank: mids.filter((v) => v < salePrice).length + 1,
    total: mids.length + 1,
    median: mids.length ? mids[Math.floor((mids.length - 1) / 2)] : null,
  };
}

/* ── 내보내기 ── */

export function operationText(c: DayTourCostInput, title: string, cost: DayTourCost, withCosts = true): string {
  const tl = dayTourTimeline(c.baseName, c.stops, c.legs, c.start);
  const lines = [
    `[운영] ${title}`,
    `${c.length === "full" ? "당일" : "반일"} · ${c.travelers}명 · ${cost.vehicle ? `${cost.vehicle.label}${cost.vehicle.count > 1 ? ` ${cost.vehicle.count}대` : ""}` : "차량 없음"} · 가이드 ${cost.guides}명`,
    "",
    ...tl.rows.map((r) => {
      if (r.kind === "stop") {
        const st = c.stops[r.index];
        return `${fmt(r.start)}~${fmt(r.end)}  ${st.name}${st.note ? ` (${st.note})` : ""}`;
      }
      const leg = c.legs[r.index];
      return `  └ ${legModeText(leg.mode)} ${leg.km}km ${leg.minutes}분${leg.route ? ` · ${leg.route}` : ""}${leg.toll ? ` · 통행료 ${leg.toll.toLocaleString()}` : ""}${leg.transitFare ? ` · 1인 ${leg.transitFare.toLocaleString()}` : ""}`;
    }),
    `${fmt(tl.endMin)}  ${c.baseName} 도착 (해산)`,
    ...(withCosts
      ? [
          "",
          "원가",
          ...cost.lines.map((l) => `- ${l.label}: ${l.amount.toLocaleString()}${l.per === "person" ? " (1인)" : ""} — ${l.note}`),
          `1인 원가 ${Math.round(cost.costPerPerson).toLocaleString()} · 판매가 ${cost.salePrice.toLocaleString()} ${c.currency}`,
        ]
      : []),
  ];
  return lines.join("\n");
}

export function customerText(c: DayTourCostInput, title: string, summary: string, cost: DayTourCost): string {
  const tl = dayTourTimeline(c.baseName, c.stops, c.legs, c.start);
  const modes = [...new Set(c.legs.map((l) => legModeText(l.mode)))].join("·");
  const includes = [
    cost.vehicle ? "전용 차량" : "",
    cost.guides > 0 ? "가이드" : "",
    c.stops.some((s) => s.kind !== "meal" && s.entryFee > 0) ? "입장료" : "",
    c.stops.some((s) => s.kind === "meal") ? "식사" : "",
    c.legs.some((l) => l.mode === "transit") ? "대중교통 요금" : "",
    c.settings.insurancePerPerson > 0 ? "여행자보험" : "",
  ].filter(Boolean);
  return [
    `■ ${title}`,
    summary,
    "",
    `· ${c.length === "full" ? "당일" : "반일"} 투어 (${fmt(tl.startMin)} 출발 ~ ${fmt(tl.endMin)} 도착) · 이동: ${modes}`,
    `· 출발·도착: ${c.baseName}`,
    "",
    ...c.stops.map((s, i) => `${i + 1}. ${s.name}${s.kind === "meal" ? " (식사)" : ""}`),
    "",
    `· 포함: ${includes.join(", ") || "—"}`,
    `· 1인 ${cost.salePrice.toLocaleString()} ${c.currency} (${c.travelers}명 기준)`,
  ].join("\n");
}

/** 패키지 견적의 선택관광으로 넣을 투어 (원가·판매가는 넣는 쪽에서 덮어쓴다) */
export function toTourCandidate(c: DayTourCostInput, title: string, summary: string, cost: DayTourCost): TourCandidate {
  const tl = dayTourTimeline(c.baseName, c.stops, c.legs, c.start);
  return {
    name: title,
    category: "daytrip",
    description: summary,
    durationMinutes: tl.totalMinutes,
    priceLow: Math.round(cost.costPerPerson),
    priceHigh: Math.round(cost.costPerPerson),
    priceBasis: "searched",
    includes: [cost.vehicle ? "전용 차량" : "", cost.guides ? "가이드" : "", "입장료"].filter(Boolean).join(", "),
    booking: `${fmt(tl.startMin)} ${c.baseName} 출발`,
    koreanGuide: false,
    koreanNote: "",
    highlights: c.stops.map((s) => s.name).join(" · "),
    operator: "",
    sourceName: "근교 투어 만들기",
    searchUrl: "",
  };
}

/* ── 고객용 웹 일정표 ── */

const SHARE_KIND: Record<string, "sight" | "meal"> = { sight: "sight", activity: "sight", meal: "meal" };

/** 근교 투어를 고객용 웹 일정표(링크) 형식으로 — 원가 없이 일정·포함 사항·요금 */
export function dayTourShare(
  c: DayTourCostInput,
  title: string,
  summary: string,
  cost: DayTourCost,
  company: { name: string; phone: string; email: string },
  showPrice: boolean,
  now = new Date(),
): SharedItinerary {
  const tl = dayTourTimeline(c.baseName, c.stops, c.legs, c.start);
  const includes = [
    cost.vehicle ? "전용 차량" : "",
    cost.guides > 0 ? "가이드" : "",
    c.stops.some((s) => s.kind !== "meal" && s.entryFee > 0) ? "입장료" : "",
    c.stops.some((s) => s.kind === "meal") ? "식사" : "",
    c.legs.some((l) => l.mode === "transit") ? "대중교통 요금" : "",
    c.settings.insurancePerPerson > 0 ? "여행자보험" : "",
  ].filter(Boolean);
  const items = tl.rows.map((r) => {
    if (r.kind === "stop") {
      const s = c.stops[r.index];
      return { time: fmt(r.start), name: s.name.slice(0, 160), kind: SHARE_KIND[s.kind] ?? "sight", note: [s.area, s.note].filter(Boolean).join(" · ").slice(0, 200) };
    }
    const l = c.legs[r.index];
    const to = r.index < c.stops.length ? c.stops[r.index].name : c.baseName;
    return { time: fmt(r.start), name: `${legModeText(l.mode)}으로 ${to}`.slice(0, 160), kind: "move" as const, note: `${l.minutes}분${l.route ? ` · ${l.route}` : ""}`.slice(0, 200) };
  });
  return {
    title: title.slice(0, 120),
    destination: c.baseName.slice(0, 100),
    period: `${c.length === "full" ? "당일" : "반일"} · ${fmt(tl.startMin)} 출발 ~ ${fmt(tl.endMin)} 도착`.slice(0, 80),
    travelers: c.travelers,
    priceLine: showPrice ? `1인 ${cost.salePrice.toLocaleString()} ${c.currency}`.slice(0, 120) : "",
    days: [{ day: 1, date: "", theme: summary.slice(0, 120), hotel: "", meals: "", items: [{ time: fmt(tl.startMin), name: `${c.baseName} 출발`.slice(0, 160), kind: "move" as const, note: "" }, ...items].slice(0, 40) }],
    included: includes,
    excluded: ["개인 경비", ...(c.stops.some((s) => s.kind === "meal") ? [] : ["식사"])],
    notices: ["현지 교통·날씨에 따라 순서·시각이 바뀔 수 있습니다."],
    company: { name: company.name.slice(0, 80), phone: company.phone.slice(0, 40), email: company.email.slice(0, 120) },
    updatedAt: now.toISOString(),
    lang: "ko",
    tags: [c.length === "full" ? "당일 투어" : "반일 투어", ...(cost.vehicle ? ["전용차량"] : []), ...(cost.guides > 0 ? ["가이드 동행"] : [])],
  };
}
