import { describe, expect, it } from "vitest";
import { finishCourse } from "@/lib/courseFinish";
import { computeItemTimings, dayTourStart } from "@/lib/dayLoad";
import { dayHardIssues } from "@/lib/feasibility";
import { applyFlightWithMeals } from "@/lib/flightApply";
import { flightDayWindows, flightDaysRequest, flightTimesFor, isShortHaul, withFlightDays } from "@/lib/flightPlan";
import { dayItems } from "@/lib/itinerary";
import type { DayPlan, FlightOption, ItineraryItem } from "@/types";
import { input } from "./fixtures";

const place = (id: string, name: string, stay: number, travel = 20, type: ItineraryItem["type"] = "sightseeing"): ItineraryItem => ({
  id, type, name, description: "", stayMinutes: stay, travelMinutesToNext: travel, entryFee: 0, mealCost: 0, isEstimated: false, admission: "none",
});
const linear = (day: number, items: ItineraryItem[], theme = ""): DayPlan => ({ day, theme, kind: "linear", items, amGuided: [], pmFreeOptions: [], overnightCity: "오사카" });

const osakaFlight: FlightOption = {
  airline: "대한항공", flightNumber: "KE723", departDate: "2026-12-01", departAirport: "인천(ICN)", departTime: "10:00", arriveAirport: "간사이(KIX)", arriveTime: "12:00",
  stops: 0, duration: "2시간", price: 300000, basis: "searched", sourceName: "", link: "",
  returnFlightNumber: "KE724", returnDepartDate: "2026-12-03", returnDepartAirport: "간사이(KIX)", returnDepartTime: "20:00", returnArriveAirport: "인천(ICN)", returnArriveTime: "22:00", returnStops: 0, returnDuration: "2시간",
};
const osaka = (patch = {}) => input({ destination: "오사카, 일본", originCity: "인천", includesFlights: true, tripScope: "overseas", days: 3, nights: 2, mode: "ai", ...patch });

/** AI가 flight_days 규칙대로 만든 3일 (도착일 오후·중간일·출국일 오후 전까지) */
const aiDays = (): DayPlan[] => [
  linear(1, [place("a1", "오사카성", 90), place("a2", "도톤보리", 90), place("a3", "저녁 식사", 60, 20, "meal")], "도착 · 오사카 시내"),
  linear(2, [place("b1", "교토 기요미즈데라", 120, 30), place("b2", "점심", 60, 20, "meal"), place("b3", "후시미 이나리", 120, 40), place("b4", "저녁", 60, 0, "meal")], "교토"),
  linear(3, [place("c1", "구로몬 시장", 90), place("c2", "점심", 60, 20, "meal"), place("c3", "린쿠 아울렛", 120, 0, "shopping")], "쇼핑 · 출국"),
];

describe("항공 시각으로 도착일·출국일 관광 시간 정하기", () => {
  it("고른 항공편: 12:00 도착 → 13:40부터, 20:00 출발 → 16:00까지", () => {
    const t = flightTimesFor(osaka({ selectedFlight: osakaFlight }))!;
    expect(t).toMatchObject({ arrive: "12:00", returnDepart: "20:00", assumed: false, overnightReturn: false });
    expect(flightDayWindows(t, 3)).toEqual({ arrivalStart: "13:40", departureEnd: "16:00", departureDay: 3, aiDays: 3 });
  });

  it("항공편 미정: 노선으로 가정 (일본 단거리, 2박3일 → 저녁 귀국편)", () => {
    const req = flightDaysRequest(osaka())!;
    expect(req.aiDays).toBe(3);
    expect(req.flightDays).toMatchObject({ assumed: true, overnightReturn: false, returnDepart: "19:00" });
    expect(req.flightDays.arrivalStart).not.toBe("");
    expect(isShortHaul(osaka())).toBe(true);
    expect(isShortHaul(osaka({ destination: "파리, 프랑스" }))).toBe(false);
  });

  it("1박2일도 2일로 만든다 (예전엔 관광일 최소 1일 + 이동일 2일 = 3일로 늘었다)", () => {
    expect(flightDaysRequest(osaka({ days: 2, nights: 1 }))!.aiDays).toBe(2);
  });

  it("심야 귀국편(3박5일 동남아): 마지막 전날 저녁까지 관광, 마지막 날은 귀국편만", () => {
    const t = flightTimesFor(input({ destination: "다낭, 베트남", originCity: "인천", includesFlights: true, tripScope: "overseas", days: 5, nights: 3 }))!;
    expect(t.overnightReturn).toBe(true);
    const w = flightDayWindows(t, 5);
    expect(w).toMatchObject({ aiDays: 4, departureDay: 4, departureEnd: "20:30" });
    const days = withFlightDays([1, 2, 3, 4].map((d) => linear(d, [place(`x${d}`, `관광${d}`, 120)])), { originCity: "인천", destination: "다낭", days: 5 }, t);
    expect(days).toHaveLength(5);
    expect(days[3].items.map((i) => i.name)).toEqual(["호텔 체크아웃", "관광4", "다낭 공항 이동"]);
    expect(days[4].items.every((i) => i.type === "flight")).toBe(true);
  });
});

describe("도착일·출국일이 비지 않는다 (오사카 2박3일, 12:00 도착·20:00 출국)", () => {
  const run = () => {
    const inp = osaka({ selectedFlight: osakaFlight });
    const t = flightTimesFor(inp)!;
    const wrapped = applyFlightWithMeals(withFlightDays(aiDays(), inp, t), osakaFlight);
    return finishCourse(wrapped, inp).days;
  };

  it("도착일: 12:00 도착 뒤 오후 관광이 이어지고 마지막에 호텔 체크인", () => {
    const d1 = run()[0];
    const items = dayItems(d1, {});
    const timings = computeItemTimings(items, dayTourStart(d1));
    expect(items[0].name).toContain("출발");
    expect(timings.get("fl-out-arr")?.start).toBe("12:00");
    const firstTour = items.find((i) => i.type === "sightseeing")!;
    expect(timings.get(firstTour.id)!.start >= "13:40").toBe(true);
    expect(items[items.length - 1].name).toBe("호텔 체크인");
    expect(items.filter((i) => i.type === "sightseeing").length).toBeGreaterThanOrEqual(2);
  });

  it("출국일: 아침에 체크아웃하고 관광한 뒤 공항 이동, 귀국편은 정확히 20:00 — 공항 대기만 하는 날이 아니다", () => {
    const days = run();
    const d3 = days[2];
    const items = dayItems(d3, {});
    const timings = computeItemTimings(items, dayTourStart(d3));
    expect(items.map((i) => i.name)).toEqual(["호텔 체크아웃", "구로몬 시장", "점심", "린쿠 아울렛", "간사이(KIX) 공항 이동", "간사이(KIX) 출발", "인천(ICN) 도착"]);
    expect(timings.get("fl-ret-dep")?.start).toBe("20:00");
    // 하루가 오전에 시작하고(예전: 출발 시각에서 거꾸로 계산해 오후 체크아웃 → 공항 대기), 공항 이동은 출발 3시간+이동 1시간 전
    expect(dayTourStart(d3) <= "11:00").toBe(true);
    expect(timings.get("fl-ret-transfer")?.start).toBe("16:00");
    expect(dayHardIssues(d3, {})).toEqual([]);
  });

  it("항공편을 나중에 바꾸면 귀국편 시각만 바뀌고 관광은 그대로", () => {
    const days = run();
    const later = applyFlightWithMeals(days, { ...osakaFlight, returnDepartTime: "21:30", returnArriveTime: "23:30" });
    const d3 = later[2];
    const timings = computeItemTimings(dayItems(d3, {}), dayTourStart(d3));
    expect(timings.get("fl-ret-dep")?.start).toBe("21:30");
    expect(dayTourStart(d3)).toBe(dayTourStart(days[2]));
  });
});

describe("출국일 빈 시간(공항 대기) 찾기·채우기", () => {
  const t = () => flightTimesFor(osaka({ selectedFlight: osakaFlight }))!;

  it("관광이 짧아 공항에 일찍 가게 되면 빈 시간을 알리고, 채우면 공항 이동 앞에 넣고 귀국편 시각은 그대로", async () => {
    const { departureGap, insertBeforeAirport } = await import("@/lib/flightPlan");
    // 관광 1곳만 → 11:00 체크아웃(늦게 시작해도) → 공항 이동이 일찍
    const days = withFlightDays([aiDays()[0], aiDays()[1], linear(3, [place("c1", "구로몬 시장", 60, 0)])], osaka(), t());
    const d3 = days[2];
    const gap = departureGap(d3)!;
    expect(gap).toMatchObject({ untilTime: "16:00" });
    expect(gap.freeMinutes).toBeGreaterThanOrEqual(150);
    const filled = insertBeforeAirport(d3, [place("n1", "덴포잔 대관람차", 90), place("n2", "점심", 60, 0, "meal")]);
    const names = filled.items.map((i) => i.name);
    expect(names.indexOf("덴포잔 대관람차")).toBeLessThan(names.indexOf("간사이(KIX) 공항 이동"));
    const timings = computeItemTimings(dayItems(filled, {}), dayTourStart(filled));
    expect(timings.get("fl-ret-dep")?.start).toBe("20:00");
    expect(departureGap(filled)?.freeMinutes ?? 0).toBeLessThan(gap.freeMinutes);
  });

  it("예전 방식(출발 시각에서 거꾸로 맞춰 오후 체크아웃) 날짜도 오전부터 빈 시간으로 보고, 채우면 09:30 체크아웃·귀국편 시각 고정", async () => {
    const { departureGap, insertBeforeAirport } = await import("@/lib/flightPlan");
    const old: DayPlan = linear(3, [
      place("o1", "호텔 체크아웃", 0, 10, "hotel"),
      place("o2", "공항 이동", 0, 60, "transfer"),
      { ...place("o3", "간사이 출발", 0, 120, "flight") },
      place("o4", "인천 도착", 0, null as unknown as number, "flight"),
    ]);
    old.meetingTime = "18:50"; // 20:00 출발에서 거꾸로
    const gap = departureGap(old)!;
    expect(gap.fromTime).toBe("09:30");
    const filled = insertBeforeAirport(old, [place("n1", "오사카성", 120, 0)]);
    expect(filled.meetingTime).toBe("09:30");
    const timings = computeItemTimings(dayItems(filled, {}), dayTourStart(filled));
    expect(timings.get("o3")?.start).toBe("20:00");
  });
});

describe("자동 구성 — 코스 전에 고를 항공편", () => {
  it("입력 기간에 맞는 편 중 직항·오전 도착·저녁 귀국편을 고른다", async () => {
    const { pickFlightForCourse } = await import("@/lib/flightPlan");
    const { tripSpanFromFlight } = await import("@/lib/flightApply");
    const early = { ...osakaFlight, flightNumber: "A", departTime: "06:00", arriveTime: "08:00", returnDepartTime: "09:00", returnArriveTime: "11:00", price: 200000 };
    const good = { ...osakaFlight, flightNumber: "B", price: 260000 };
    const wrongDates = { ...osakaFlight, flightNumber: "C", returnDepartDate: "2026-12-04", price: 100000 };
    const pick = pickFlightForCourse([early, good, wrongDates], { days: 3, nights: 2 }, tripSpanFromFlight);
    expect(pick?.flightNumber).toBe("B");
    expect(pickFlightForCourse([wrongDates], { days: 3, nights: 2 }, tripSpanFromFlight)).toBeNull();
  });

  it("예상 시각으로 만든 뒤 항공편을 고르면 항공 설명이 실제 편으로 바뀐다", () => {
    const inp = osaka();
    const days = withFlightDays(aiDays(), inp, flightTimesFor(inp)!);
    expect(days[0].items[0].description).toContain("예상 시각");
    const applied = applyFlightWithMeals(days, osakaFlight);
    expect(applied[0].items[0].description).not.toContain("예상 시각");
    expect(applied[2].items.find((i) => i.id === "fl-ret-dep")?.fixedTime).toBe("20:00");
  });
});

describe("코스 생성 프롬프트", () => {
  it("항공 시각으로 도착일·출국일 규칙을 넣는다", async () => {
    const { buildItineraryUserPrompt } = await import("@/lib/server/itineraryPrompt");
    const { itineraryRequestSchema } = await import("@/lib/schemas/itinerary");
    const req = itineraryRequestSchema.parse({
      destination: "오사카", days: 3, nights: 2, travelers: 4, currency: "KRW", themes: [], notes: "",
      flightDays: { arrive: "12:00", arrivalStart: "13:40", returnDepart: "20:00", departureEnd: "16:00", departureDay: 3, assumed: false, overnightReturn: false },
    });
    const p = buildItineraryUserPrompt(req);
    expect(p).toContain("13:40부터 관광");
    expect(p).toContain("16:00까지 마칠 수 있는");
    expect(p).toContain("현지 숙박 2박");
  });
});
