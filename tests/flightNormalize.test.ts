import { describe, expect, it } from "vitest";
import { fillFlightDates, normalizeClock, normalizeDate } from "@/lib/flightNormalize";
import { toFlightOptions } from "@/lib/schemas/flightOptions";

describe("항공 시각 정리", () => {
  it.each([
    ["09:20", "09:20"],
    ["9:05", "09:05"],
    ["오후 7:20", "19:20"],
    ["7:20 PM", "19:20"],
    ["오전 12:10", "00:10"],
    ["19시 20분", "19:20"],
    ["06:00+1", "06:00 (+1)"],
    ["06:00 (+1)", "06:00 (+1)"],
    ["익일 06:00", "06:00 (+1)"],
    ["23:45 (또는 익일 00:25)", "23:45"],
    ["미정", ""],
    ["25:00", ""],
  ])("%s → %s", (text, expected) => {
    expect(normalizeClock(text)).toBe(expected);
  });
});

describe("항공 날짜 정리", () => {
  it("여러 표기를 ISO로", () => {
    expect(normalizeDate("2026.11.10")).toBe("2026-11-10");
    expect(normalizeDate("2026년 11월 9일")).toBe("2026-11-09");
    expect(normalizeDate("2026-02-31")).toBe("");
  });
  it("귀국편 날짜가 없으면 출발일 + 숙박 수", () => {
    expect(fillFlightDates("", "", { departureDate: "2026-11-10", nights: 3 })).toEqual({ departDate: "2026-11-10", returnDepartDate: "2026-11-13" });
  });
});

describe("항공편 후보 정리", () => {
  const raw = {
    airline: "비엣젯",
    flightNumber: "vj879",
    departDate: "2026.11.10",
    departAirport: "인천(ICN)",
    departTime: "오후 10:30",
    arriveAirport: "다낭(DAD)",
    arriveTime: "01:30",
    stops: 0,
    duration: "5시간",
    price: 213000.4,
    basis: "searched" as const,
    sourceName: "스카이스캐너",
    link: "javascript:alert(1)",
    returnFlightNumber: "VJ878",
    returnDepartDate: "",
    returnDepartAirport: "다낭(DAD)",
    returnDepartTime: "23:45",
    returnArriveTime: "06:20",
    returnArriveAirport: "인천(ICN)",
    returnStops: 0,
    returnDuration: "4시간 35분",
  };
  const req = { origin: "인천", destination: "다낭", days: 5, nights: 3, departureDate: "2026-11-10", currency: "KRW" as const };

  it("시각·날짜·편명·링크를 정리하고 같은 편은 하나만 남긴다", () => {
    const [f, ...rest] = toFlightOptions({ flights: [raw, raw] }, req, true);
    expect(rest).toHaveLength(0);
    expect(f).toMatchObject({
      flightNumber: "VJ879",
      departDate: "2026-11-10",
      departTime: "22:30",
      arriveTime: "01:30 (+1)",
      returnDepartDate: "2026-11-13",
      returnArriveTime: "06:20 (+1)",
      price: 213000,
    });
    expect(f.link).toMatch(/^https:\/\/www\.google\.com/);
  });

  it("검색 근거가 없으면 추정으로 낮춘다", () => {
    const [f] = toFlightOptions({ flights: [raw] }, req, false);
    expect(f.basis).toBe("estimated");
    expect(f.sourceName).toBe("");
  });
});
