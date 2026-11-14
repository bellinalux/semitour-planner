import { describe, expect, it } from "vitest";
import { fixCourseOrder, fixDayLeaks, realignToSourceDays } from "@/lib/courseOrder";
import { courseChecks, applyCourseFix, spillAllLate } from "@/lib/courseStandards";
import { dayMeetingTime, walkTimeline } from "@/lib/dayLoad";
import { withPastedFlight } from "@/lib/pasteFlight";
import type { DayPlan, FlightOption, ItineraryItem } from "@/types";
import { input } from "./fixtures";

const i0 = (id: string, name: string, type: ItineraryItem["type"], stay = 60, travel: number | null = 30): ItineraryItem => ({
  id, name, type, description: "", stayMinutes: stay, travelMinutesToNext: travel, entryFee: 0, mealCost: 0, isEstimated: true,
  ...(type === "meal" ? { mealSlot: /석|저녁/.test(name) ? ("dinner" as const) : ("lunch" as const) } : {}),
});
const d = (n: number, items: ItineraryItem[], city: string): DayPlan => ({ day: n, theme: "", kind: "linear", items, amGuided: [], pmFreeOptions: [], overnightCity: city });
const names = (x: DayPlan) => x.items.map((i) => i.name);
const clock = (x: DayPlan) => Object.fromEntries(walkTimeline(x.items, dayMeetingTime(x)).map((s) => [s.item.name, `${String(Math.floor((s.start % 1440) / 60)).padStart(2, "0")}:${String(s.start % 60).padStart(2, "0")}`]));

const flight: FlightOption = {
  airline: "제주항공", flightNumber: "7C1405", departDate: "2026-12-09", departAirport: "인천", departTime: "15:20", arriveAirport: "후쿠오카", arriveTime: "16:50",
  stops: 0, duration: "", price: 0, basis: "searched", sourceName: "", link: "", returnFlightNumber: "", returnDepartDate: "2026-12-11",
  returnDepartAirport: "후쿠오카", returnDepartTime: "17:50", returnArriveAirport: "인천", returnArriveTime: "19:30", returnStops: 0, returnDuration: "",
};

// 노랑풍선 후쿠오카 3일 — 2일차 아침("호텔 조식 후 → 야나가와 → 가마도 지옥")이 1일차 숙박 뒤에 붙어 들어온 원문 분석 결과
const leaked = () => [
  d(1, [i0("a", "인천 출발", "flight", 0, 85), i0("b", "후쿠오카 공항 도착", "flight", 0, 15), i0("c", "라라포트 후쿠오카", "shopping", 60, 20), i0("e", "시사이드 모모치", "sightseeing", 40, 20), i0("f", "힐튼 후쿠오카 시 호크", "hotel", 0, 0), i0("g", "호텔 조식 후", "hotel", 0, 90), i0("h", "야나가와 뱃놀이", "experience", 30, 90), i0("k", "가마도 지옥", "sightseeing", 40, 30)], "후쿠오카"),
  d(2, [i0("m", "유후인 민예촌", "sightseeing", 60, 10), i0("n", "긴린코 호수", "sightseeing", 30, 60), i0("o", "츠에타테 히젠야", "hotel", 0, 0)], "구마모토"),
  d(3, [i0("x", "호텔 조식 후", "hotel", 0, 60), i0("p", "다자이후 텐만구", "sightseeing", 60, 40), i0("q", "후쿠오카 공항 출발", "flight", 0, 90), i0("r", "인천 도착", "flight", 0, 0)], ""),
];

describe("날짜 경계 — 숙박 뒤로 새어 들어온 다음 날 일정", () => {
  it("조식 줄부터 끝까지를 다음 날 아침으로, 호텔은 첫날 끝에 그대로", () => {
    const { days, fixes } = fixDayLeaks(leaked());
    expect(names(days[0])).toEqual(["인천 출발", "후쿠오카 공항 도착", "라라포트 후쿠오카", "시사이드 모모치", "힐튼 후쿠오카 시 호크"]);
    expect(names(days[1]).slice(0, 4)).toEqual(["호텔 조식 후", "야나가와 뱃놀이", "가마도 지옥", "유후인 민예촌"]);
    expect(fixes[0].note).toContain("DAY 2 아침으로");
  });

  it("전체 흐름: 첫날 힐튼 체크인이 저녁 시간, 조식 줄이 저녁에 오지 않는다", () => {
    const out = withPastedFlight(fixCourseOrder(leaked()).days, flight);
    const t = clock(out[0]);
    expect(t["인천 출발"]).toBe("15:20");
    expect(t["힐튼 후쿠오카 시 호크"] < "21:00").toBe(true);
    expect(names(out[0])).not.toContain("호텔 조식 후");
    expect(spillAllLate(out).moved).toEqual([]);
  });

  it("조식 줄이 없어도, 숙박 앞에 그날 관광이 있고 뒤에 긴 낮 관광이 이어지면 다음 날로 (석식·야경은 그날에)", () => {
    const day1 = d(1, [i0("c", "라라포트", "shopping", 60, 20), i0("f", "힐튼", "hotel", 0, 0), i0("s", "호텔 석식", "meal", 60, 0), i0("h", "야나가와 뱃놀이", "experience", 60, 90), i0("k", "가마도 지옥", "sightseeing", 40, 30)], "후쿠오카");
    const { days } = fixDayLeaks([day1, d(2, [i0("m", "유후인", "sightseeing")], "구마모토")]);
    expect(names(days[0])).toEqual(["라라포트", "호텔 석식", "힐튼"]);
    expect(names(days[1])).toEqual(["야나가와 뱃놀이", "가마도 지옥", "유후인"]);
  });

  it("숙박 앞이 식사뿐이면 날짜 요약 순서 — 다음 날로 옮기지 않고 호텔을 끝으로", () => {
    const summary = d(1, [i0("l", "점심 식사", "meal"), i0("h", "히젠야", "hotel", 0, 0), i0("y", "야나가와 뱃놀이", "experience", 60, 90), i0("k", "가마도 지옥", "sightseeing", 40, 30)], "구마모토");
    const r = fixCourseOrder([summary, d(2, [i0("z", "다자이후", "sightseeing")], "")]);
    expect(names(r.days[0]).at(-1)).toBe("히젠야");
    expect(names(r.days[1])).toEqual(["다자이후"]);
  });

  it("호텔 뒤 짧은 저녁 관광(야경)은 그날 일정으로 둔다", () => {
    const day1 = d(1, [i0("c", "오사카성", "sightseeing", 90, 20), i0("f", "호텔 체크인", "hotel", 0, 20), i0("n", "도톤보리 야경", "sightseeing", 60, 0)], "오사카");
    expect(fixDayLeaks([day1, d(2, [], "오사카")]).fixes).toEqual([]);
  });
});

describe("원문 날짜별 글로 날짜 확인", () => {
  it("이 날 글에는 없고 다른 날 글에만 있는 관광은 그 날짜로", () => {
    const text = "1일차2026.12.09.(수)\n라라포트 후쿠오카\n시사이드 모모치\n2일차2026.12.10.(목)\n야나가와 뱃놀이\n가마도 지옥\n유후인 민예촌\n3일차\n다자이후 텐만구";
    const days = [
      d(1, [i0("c", "라라포트 후쿠오카", "shopping"), i0("h", "야나가와 뱃놀이", "experience"), i0("f", "힐튼", "hotel", 0, 0)], "후쿠오카"),
      d(2, [i0("x", "호텔 조식 후", "hotel", 0, 60), i0("m", "유후인 민예촌", "sightseeing")], "구마모토"),
      d(3, [i0("p", "다자이후 텐만구", "sightseeing")], ""),
    ];
    const r = realignToSourceDays(days, text);
    expect(names(r.days[0])).toEqual(["라라포트 후쿠오카", "힐튼"]);
    expect(names(r.days[1])).toEqual(["호텔 조식 후", "야나가와 뱃놀이", "유후인 민예촌"]);
    expect(r.fixes[0].note).toContain("원문 2일차");
  });
});

describe("마지막 안전장치 — 하루 끝 상한", () => {
  it("저녁에 놓인 조식 줄은 경고하고, 버튼으로 다음 날 아침으로 옮긴다", () => {
    const bad = withPastedFlight(leaked(), flight); // 날짜 경계를 바로잡지 않은 상태
    const c = courseChecks(input(), bad, {}).find((x) => x.id === "spill-1")!;
    expect(c.title).toContain("호텔 조식 후이");
    const fixed = applyCourseFix(c.fix!.fix, bad, {});
    expect(names(fixed[0]).at(-1)).toBe("힐튼 후쿠오카 시 호크");
    expect(names(fixed[1])[0]).toBe("호텔 조식 후");
  });
  it("21:30 넘어 시작하는 낮 관광도 다음 날로 (자동)", () => {
    const late = d(1, [i0("a", "A", "sightseeing", 600, 30), i0("b", "B", "sightseeing", 120, 30), i0("c", "C", "sightseeing", 60, 0), i0("h", "호텔", "hotel", 0, 0)], "도쿄");
    late.meetingTime = "09:00";
    const r = spillAllLate([late, d(2, [i0("z", "Z", "sightseeing")], "도쿄")]);
    expect(r.moved).toEqual([1]);
    expect(names(r.days[0]).at(-1)).toBe("호텔");
    expect(names(r.days[1])[0]).toBe("C");
  });
});
