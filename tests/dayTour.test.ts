import { describe, expect, it } from "vitest";
import {
  breakEven,
  changeLegMode,
  chargeIncluded,
  dayTourCost,
  dayTourTimeline,
  dayTourWarnings,
  initialSettings,
  KRW_DEFAULTS,
  marketPosition,
  minutesFor,
  normalizeLegs,
  paxTable,
  travelersForPrice,
  vehicleFor,
  type DayTourCostInput,
  type DayTourSettings,
} from "@/lib/dayTour";
import type { DayTourLeg, DayTourResponse, DayTourStop } from "@/lib/schemas/dayTour";

const stop = (name: string, patch: Partial<DayTourStop> = {}): DayTourStop => ({
  name,
  area: "",
  kind: "sight",
  lat: 0,
  lng: 0,
  stayMinutes: 60,
  entryFee: 0,
  parkingFee: 0,
  note: "",
  ...patch,
});
const leg = (patch: Partial<DayTourLeg> = {}): DayTourLeg => ({ mode: "vehicle", km: 10, minutes: 20, route: "", transitFare: 0, toll: 0, basis: "searched", ...patch });

const settings = (patch: Partial<DayTourSettings> = {}): DayTourSettings => ({
  vehicleMethod: "distance",
  fuelPrice: 1600,
  kmPerL: 0,
  deadheadKm: 0,
  driverDay: 200000,
  driverMeal: 10000,
  overtimePerHour: 20000,
  vehicleFixedDay: 100000,
  charterDay: 500000,
  charterHalf: 300000,
  charterToll: false,
  charterParking: false,
  guideDay: 200000,
  guideHalf: 120000,
  guideMeal: 10000,
  insurancePerPerson: 2000,
  marginRate: 20,
  ...patch,
});

/** 서울 → 남이섬(입장 16,000) → 쁘띠프랑스(입장 12,000) → 서울. 차량 왕복 140km, 15명 */
const gapyeong = (patch: Partial<DayTourCostInput> = {}): DayTourCostInput => ({
  stops: [stop("남이섬", { entryFee: 16000, stayMinutes: 150, parkingFee: 6000 }), stop("점심 닭갈비", { kind: "meal", entryFee: 15000 }), stop("쁘띠프랑스", { entryFee: 12000, stayMinutes: 90, parkingFee: 4000 })],
  legs: [leg({ km: 63, minutes: 80, toll: 4000 }), leg({ km: 2, minutes: 8 }), leg({ km: 10, minutes: 20 }), leg({ km: 65, minutes: 90, toll: 4000 })],
  baseName: "서울 명동",
  start: "08:30",
  length: "full",
  transport: "vehicle",
  travelers: 15,
  guide: true,
  currency: "KRW",
  settings: settings(),
  ...patch,
});

describe("근교 투어 — 차종", () => {
  it("인원으로 차종·대수·통행료 차종을 정한다", () => {
    expect(vehicleFor(3)).toMatchObject({ label: "승용차·SUV (4인승)", count: 1, tollClass: "1종" });
    expect(vehicleFor(12)).toMatchObject({ label: "미니밴 (15~16인승)", tollClass: "1종" });
    expect(vehicleFor(15)).toMatchObject({ label: "중형버스 (25~29인승)", tollClass: "2종", kmPerL: 5 });
    expect(vehicleFor(40)).toMatchObject({ label: "대형버스 (45인승)", tollClass: "3종", count: 1 });
    expect(vehicleFor(60)).toMatchObject({ count: 2, label: "대형버스 (45인승)" });
  });
});

describe("근교 투어 — 시간표", () => {
  it("출발 → 구간·장소 → 복귀 시각, 수단별 거리를 센다", () => {
    const c = gapyeong();
    const tl = dayTourTimeline(c.baseName, c.stops, c.legs, c.start);
    expect(tl.startMin).toBe(510);
    // 이동 80+8+20+90=198, 체류 150+60+90=300 → 498분
    expect(tl.totalMinutes).toBe(498);
    expect(tl.byMode.vehicle.km).toBe(140);
    expect(tl.rows.filter((r) => r.kind === "stop").map((r) => r.label)).toEqual(["남이섬", "점심 닭갈비", "쁘띠프랑스"]);
  });
});

describe("근교 투어 — 원가 (거리 원가형)", () => {
  it("유류비 = km ÷ 연비 × 유가, 통행료·주차비·기사·고정비·가이드·1인 비용을 더한다", () => {
    const r = dayTourCost(gapyeong());
    const byId = Object.fromEntries(r.lines.map((l) => [l.id, l.amount]));
    expect(byId.fuel).toBe(Math.round((140 / 5) * 1600)); // 44,800
    expect(byId.toll).toBe(8000);
    expect(byId.parking).toBe(10000);
    expect(byId.driver).toBe(210000);
    expect(byId.fixed).toBe(100000);
    expect(byId.guide).toBe(210000);
    expect(byId.entry).toBe(28000);
    expect(byId.meal).toBe(15000);
    expect(byId.insurance).toBe(2000);
    const group = 44800 + 8000 + 10000 + 210000 + 100000 + 210000;
    expect(r.groupTotal).toBe(group);
    expect(r.costPerPerson).toBeCloseTo(group / 15 + 45000, 5);
    // 판매가 = 원가 ÷ 0.8 을 천 원 단위로 올림
    expect(r.salePrice).toBe(Math.ceil(r.costPerPerson / 0.8 / 1000) * 1000);
  });

  it("공차 거리는 유류비와 기사 근무 시간에 들어가고, 기준(당일 10시간)을 넘으면 초과 수당", () => {
    const base = dayTourCost(gapyeong());
    const r = dayTourCost(gapyeong({ settings: settings({ deadheadKm: 100 }) }));
    const fuel = (x: typeof r) => x.lines.find((l) => l.id === "fuel")!.amount;
    expect(fuel(r) - fuel(base)).toBe(Math.round((100 / 5) * 1600));
    // 498분 + 공차 150분 = 648분 → 초과 1시간
    expect(r.overtimeHours.driver).toBe(1);
    expect(r.overtimeHours.guide).toBe(0);
  });

  it("반일은 기사·고정비·가이드를 반일 요금으로", () => {
    const r = dayTourCost(gapyeong({ length: "half", stops: [stop("남이섬", { stayMinutes: 100 })], legs: [leg({ km: 63, minutes: 80 }), leg({ km: 63, minutes: 80 })] }));
    const byId = Object.fromEntries(r.lines.map((l) => [l.id, l.amount]));
    expect(byId.driver).toBe(200000 * 0.6 + 10000);
    expect(byId.fixed).toBe(60000);
    expect(byId.guide).toBe(120000 + 10000);
  });
});

describe("근교 투어 — 원가 (대절 시세형·대중교통·도보)", () => {
  it("대절 시세형은 대절료 + 대절에 안 들어간 통행료·주차비", () => {
    const r = dayTourCost(gapyeong({ settings: settings({ vehicleMethod: "charter", charterToll: true }) }));
    const byId = Object.fromEntries(r.lines.map((l) => [l.id, l.amount]));
    expect(byId.charter).toBe(500000);
    expect(byId.charterExtra).toBe(10000); // 통행료는 포함, 주차비 별도
    expect(byId.fuel).toBeUndefined();
    expect(r.vehicleCompare).not.toBeNull();
  });

  it("대중교통 투어는 차량 없이 1인 요금 + 가이드 교통비, 가이드 1명당 15명", () => {
    const c = gapyeong({
      transport: "transit",
      travelers: 20,
      legs: [leg({ mode: "transit", km: 60, minutes: 100, transitFare: 3000 }), leg({ mode: "walk", km: 1, minutes: 13 }), leg({ mode: "walk", km: 1, minutes: 13 }), leg({ mode: "transit", km: 60, minutes: 100, transitFare: 3000 })],
    });
    const r = dayTourCost(c);
    expect(r.vehicle).toBeNull();
    expect(r.guides).toBe(2);
    const byId = Object.fromEntries(r.lines.map((l) => [l.id, l.amount]));
    expect(byId.fare).toBe(6000);
    expect(byId.guideFare).toBe(12000);
    expect(byId.fuel).toBeUndefined();
  });

  it("도보 투어는 이동 비용이 없다", () => {
    const r = dayTourCost(gapyeong({ transport: "walk", travelers: 8, legs: [leg({ mode: "walk", km: 1 }), leg({ mode: "walk", km: 1 }), leg({ mode: "walk", km: 1 }), leg({ mode: "walk", km: 1 })] }));
    expect(r.vehicle).toBeNull();
    expect(r.lines.map((l) => l.id)).toEqual(["guide", "entry", "meal", "insurance"]);
  });
});

describe("근교 투어 — 인원별 가격표·손익분기", () => {
  it("차종·가이드가 바뀌는 인원에서 표시하고, 지금 인원을 넣는다", () => {
    const rows = paxTable(gapyeong({ travelers: 14 }));
    expect(rows.some((r) => r.travelers === 14 && r.isCurrent)).toBe(true);
    const r13 = rows.find((r) => r.travelers === 13)!;
    expect(r13.step).toBe(true); // 12명 미니밴 → 13명 중형버스
    expect(rows.find((r) => r.travelers === 10)!.costPerPerson).toBeGreaterThan(rows.find((r) => r.travelers === 12)!.costPerPerson);
  });

  it("시장 가격에 맞추려면 몇 명이 모여야 하는지", () => {
    const c = gapyeong();
    const target = dayTourCost({ ...c, travelers: 30 }).salePrice;
    const n = travelersForPrice(c, target)!;
    expect(n).toBeLessThanOrEqual(30);
    expect(dayTourCost({ ...c, travelers: n }).salePrice).toBeLessThanOrEqual(target);
    expect(travelersForPrice(c, 1000)).toBeNull();
  });

  it("이 판매가로 손해 보지 않는 최소 인원", () => {
    const c = gapyeong();
    const price = dayTourCost(c).salePrice;
    const n = breakEven(c, price)!;
    expect(n).toBeGreaterThan(1);
    expect(n).toBeLessThanOrEqual(15);
    const at = dayTourCost({ ...c, travelers: n }, price);
    expect(price * n).toBeGreaterThanOrEqual(at.totalCost);
  });
});

describe("근교 투어 — 구간", () => {
  it("구간 수를 장소 + 1로 맞추고, 빠진 구간은 좌표 직선거리 × 1.35로 어림", () => {
    const stops = [stop("A", { lat: 37.6, lng: 127.0 }), stop("B", { lat: 37.7, lng: 127.0 })];
    const legs = normalizeLegs([leg({ km: 15, minutes: 30 })], stops, { name: "기준", lat: 37.5, lng: 127.0 }, "vehicle", 1500);
    expect(legs).toHaveLength(3);
    expect(legs[0]).toMatchObject({ km: 15, basis: "searched" });
    expect(legs[1].basis).toBe("estimated");
    expect(legs[1].km).toBeCloseTo(11.1 * 1.35, 0);
  });

  it("직선거리보다 짧은 거리는 믿지 않고, 정한 방식과 다른 수단은 맞춘다(짧은 도보는 허용)", () => {
    const stops = [stop("A", { lat: 37.6, lng: 127.0 })];
    const legs = normalizeLegs([leg({ km: 2, minutes: 5 }), leg({ mode: "walk", km: 1, minutes: 12 })], stops, { name: "기준", lat: 37.5, lng: 127.0 }, "transit", 1500);
    expect(legs[0]).toMatchObject({ mode: "transit", basis: "estimated", transitFare: 1500 });
    expect(legs[0].km).toBeGreaterThan(11);
    expect(legs[1].mode).toBe("walk");
  });

  it("수단을 바꾸면 시간·요금을 어림한다", () => {
    const l = changeLegMode(leg({ km: 9, minutes: 20, toll: 2000 }), "walk", 1500);
    expect(l).toMatchObject({ mode: "walk", minutes: 120, toll: 0, transitFare: 0, basis: "estimated" });
    expect(changeLegMode(leg({ km: 20 }), "transit", 1500).transitFare).toBe(2250);
    expect(minutesFor(5, "vehicle")).toBe(17);
  });
});

describe("근교 투어 — 점검·기본값·시세", () => {
  it("당일 기준을 넘는 시간, 긴 도보, 유가 누락을 알린다", () => {
    const long = gapyeong({ stops: gapyeong().stops.map((s) => ({ ...s, stayMinutes: 200 })) });
    const w = dayTourWarnings(long, { baseLat: 0, baseLng: 0, searched: true, fuelNote: "" }).map((x) => x.text);
    expect(w.some((t) => t.includes("기준 10시간을 넘습니다"))).toBe(true);
    const walk = gapyeong({ legs: [leg(), leg({ mode: "walk", km: 4, minutes: 55 }), leg(), leg()], settings: settings({ fuelPrice: 0 }) });
    const w2 = dayTourWarnings(walk, { baseLat: 0, baseLng: 0, searched: false, fuelNote: "" }).map((x) => x.text);
    expect(w2.some((t) => t.includes("도보 4km"))).toBe(true);
    expect(w2.some((t) => t.includes("유가가 0"))).toBe(true);
    expect(w2.some((t) => t.includes("웹 검색 근거"))).toBe(true);
  });

  it("4시간 넘게 이어 운전하면 휴게를 알린다", () => {
    const c = gapyeong({ stops: [stop("휴게소", { stayMinutes: 10 }), stop("먼 곳")], legs: [leg({ minutes: 150 }), leg({ minutes: 120 }), leg({ minutes: 60 })] });
    expect(dayTourWarnings(c, { baseLat: 0, baseLng: 0, searched: true, fuelNote: "" }).some((w) => w.text.includes("연속 운전"))).toBe(true);
  });

  it("조사 값이 없으면 원화 기본값, 회사 저장값이 있으면 그것을 먼저", () => {
    const res = { fuelPrice: 1650, deadheadKm: 30, driverDayRate: 0, guideDayRate: 0, guideHalfDayRate: 0, charterDayRate: 600000, charterHalfDayRate: 0, charterIncludes: "유류비·기사 포함, 통행료·주차비 별도" } as unknown as DayTourResponse;
    const s = initialSettings(res, { currency: "KRW", tripScope: "domestic", length: "full" }, { driverDay: 230000 });
    expect(s).toMatchObject({ vehicleMethod: "distance", fuelPrice: 1650, deadheadKm: 30, driverDay: 230000, guideDay: KRW_DEFAULTS.guideDay, charterHalf: 360000, charterToll: false, charterParking: false });
    const overseas = initialSettings({ ...res, fuelPrice: 0 }, { currency: "JPY", tripScope: "overseas", length: "full" });
    expect(overseas.vehicleMethod).toBe("charter");
    expect(overseas.driverDay).toBe(0);
  });

  it("포함 내역 글 읽기", () => {
    expect(chargeIncluded("유류비·기사·통행료 포함", "통행료")).toBe(true);
    expect(chargeIncluded("유류비·기사 포함, 통행료 별도", "통행료")).toBe(false);
    expect(chargeIncluded("기사 포함", "주차")).toBe(false);
  });

  it("비슷한 판매 투어 중 싼 순서", () => {
    const market = [70000, 90000, 120000].map((p) => ({ name: String(p), operator: "", sourceName: "", priceLow: p, priceHigh: p, durationMinutes: 0, transport: "", includes: "" }));
    expect(marketPosition(85000, market)).toEqual({ rank: 2, total: 4, median: 90000 });
  });
});
