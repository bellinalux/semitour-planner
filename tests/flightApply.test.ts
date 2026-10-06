import { describe, expect, it } from "vitest";
import { computeItemTimings } from "@/lib/dayLoad";
import { applyFlightToDays, checkReturnDate, tripSpanFromFlight } from "@/lib/flightApply";
import { flight, item, linearDay } from "./fixtures";

describe("tripSpanFromFlight — 항공편 시각으로 일수·숙박 계산", () => {
  it("아침 출국 · 심야 귀국(다음날 도착)은 3박 5일", () => {
    expect(tripSpanFromFlight(flight())).toEqual({ departureDate: "2026-11-10", days: 5, nights: 3 });
  });

  it("도착 시각에 '(다음날 도착)' 같은 설명이 붙어도 다음날로 계산한다", () => {
    const f = flight({ returnArriveTime: "06:00 (다음날 11월 14일 토요일 아침 도착)", returnDepartTime: "23:45 (또는 익일 00:25)" });
    expect(tripSpanFromFlight(f)).toMatchObject({ days: 5, nights: 3 });
  });

  it("밤 출발 새벽 도착편은 출발일 밤부터 숙박, 새벽 출발 귀국편은 전날 밤 숙박 없음", () => {
    const f = flight({ departTime: "22:00", arriveTime: "01:30", returnDepartDate: "2026-11-14", returnDepartTime: "01:30", returnArriveTime: "08:30" });
    expect(tripSpanFromFlight(f)).toMatchObject({ days: 5, nights: 3 });
  });

  it("같은 날 낮 귀국편은 귀국일이 마지막 날", () => {
    const f = flight({ returnDepartDate: "2026-11-14", returnDepartTime: "11:00", returnArriveTime: "17:30" });
    expect(tripSpanFromFlight(f)).toMatchObject({ days: 5, nights: 4 });
  });

  it("날짜를 모르면 null", () => {
    expect(tripSpanFromFlight(flight({ departDate: "" }))).toBeNull();
  });
});

describe("checkReturnDate — 숙박 수 기준 귀국일 확인", () => {
  it("귀국편이 출발일 + 숙박 수에 출발하면 일치", () => {
    const r = checkReturnDate({ departureDate: "2026-11-10", days: 5, nights: 3 }, flight());
    expect(r.mismatched).toBe(false);
  });

  it("어긋나면 심야 귀국을 고려한 일수를 제안한다", () => {
    const r = checkReturnDate({ departureDate: "2026-11-10", days: 4, nights: 2 }, flight());
    expect(r.mismatched).toBe(true);
    expect(r.suggestedDays).toBe(5);
  });
});

describe("applyFlightToDays — 첫날·마지막 날 항공 항목에만 반영", () => {
  const days = [
    linearDay(1, [item("out", { type: "flight", name: "인천 출발", stayMinutes: 0 }), item("t1", { type: "transfer", stayMinutes: 30 })]),
    linearDay(2, [item("mid", { type: "flight", name: "국내선 공항 출발", stayMinutes: 0 }), item("s", { stayMinutes: 60 })]),
    linearDay(3, [item("co", { type: "hotel", stayMinutes: 30, travelMinutesToNext: 60 }), item("back", { type: "flight", name: "인천 도착", stayMinutes: 0 })]),
  ];

  it("가는 편 출발 시각이 첫날 미팅 시각, 귀국편 출발 시각에서 앞선 항목 시간을 뺀 값이 귀국일 미팅 시각", () => {
    const next = applyFlightToDays(days, flight());
    expect(next[0].meetingTime).toBe("07:00");
    // 23:45 − (체크아웃 30분 + 이동 60분) = 22:15 → 10분 단위로 22:10, 남는 5분은 공항 이동에 더한다
    expect(next[2].meetingTime).toBe("22:10");
    const timings = computeItemTimings(next[2].kind === "linear" ? next[2].items : [], next[2].meetingTime!);
    expect(timings.get("co")).toEqual({ start: "22:10", end: "22:40" });
    expect(timings.get("back")?.start).toBe("23:45");
  });

  it("중간 날짜의 항공 항목은 건드리지 않는다", () => {
    const next = applyFlightToDays(days, flight());
    expect(next[1]).toEqual(days[1]);
  });
});
