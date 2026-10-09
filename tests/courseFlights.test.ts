import { describe, expect, it } from "vitest";
import { walkTimeline } from "@/lib/dayLoad";
import { courseFlightOption, toCoursePlan, type courseResponseSchema } from "@/lib/schemas/course";
import type { z } from "zod";

type Parsed = z.infer<typeof courseResponseSchema>;
type RawItem = Parsed["days"][number]["items"][number];

const raw = (type: string, name: string, patch: Partial<RawItem> = {}): RawItem => ({
  type,
  name,
  description: "",
  timeNote: "",
  admission: "none",
  stayMinutes: 0,
  travelMinutesToNext: 0,
  entryFee: 0,
  mealCost: 0,
  cuisine: "",
  paidLocally: false,
  caution: "",
  ...patch,
});

const leg = (patch: Partial<Parsed["flights"]["outbound"]> = {}) => ({
  airline: "",
  flightNumber: "",
  departAirport: "",
  departTime: "",
  arriveAirport: "",
  arriveTime: "",
  ...patch,
});

function parsed(flights: Parsed["flights"]): Parsed {
  return {
    packageName: "오롯이 마카오",
    totalDays: 3,
    nights: 2,
    cities: ["마카오"],
    noShopping: false,
    noOption: false,
    hotelGrade: "4성",
    highlights: [],
    quote: {
      found: false,
      currency: "",
      pricePerPerson: 0,
      basisTravelers: 0,
      minTravelers: 0,
      hotels: "",
      roomBasis: "unknown",
      singleSupplement: 0,
      tiers: [],
      lines: [],
      includes: [],
      excludes: [],
      shopping: "",
      options: "",
      notes: "",
    },
    flights,
    days: [
      {
        day: 1,
        overnightCity: "마카오",
        title: "인천 → 마카오",
        // AI가 비행을 40분짜리 이동처럼 적은 경우
        items: [
          raw("flight", "인천 출발", { travelMinutesToNext: 40 }),
          raw("flight", "마카오 공항 도착", { travelMinutesToNext: 20 }),
          raw("sightseeing", "세나도 광장", { stayMinutes: 60 }),
        ],
      },
      { day: 2, overnightCity: "마카오", title: "마카오", items: [raw("sightseeing", "콜로안 빌리지", { stayMinutes: 60 })] },
      {
        day: 3,
        overnightCity: "",
        title: "귀국",
        items: [
          raw("hotel", "호텔 체크아웃", { stayMinutes: 30, travelMinutesToNext: 30 }),
          raw("flight", "마카오 출발", { travelMinutesToNext: 40 }),
          raw("flight", "인천 도착"),
        ],
      },
    ],
  };
}

describe("업체 코스표의 항공편 시각", () => {
  it("원문 출발·도착 시각으로 비행 시간을 채우고, 그날 일정을 출발 시각에 맞춘다", () => {
    const plan = toCoursePlan(
      parsed({
        outbound: leg({ airline: "제주항공", departAirport: "인천", departTime: "09:50", arriveAirport: "마카오", arriveTime: "12:50" }),
        inbound: leg({ airline: "제주항공", departTime: "13:50", arriveTime: "18:40" }),
      }),
    );
    const [d1, , d3] = plan.days;
    expect(d1.meetingTime).toBe("09:50");
    expect(d1.items[0]).toMatchObject({ name: "인천 출발", travelMinutesToNext: 180 });
    expect(d1.items[0].description).toBe("제주항공 · 인천 09:50 출발 · 마카오 12:50 도착");
    const slots = walkTimeline(d1.items, d1.meetingTime ?? "08:00");
    expect(slots[1].start).toBe(12 * 60 + 50); // 마카오 도착 12:50
    // 귀국편: 체크아웃·공항 이동을 거슬러 올라가 출발 항목이 13:50에 오도록
    const back = walkTimeline(d3.items, d3.meetingTime ?? "08:00");
    expect(back[1].start).toBe(13 * 60 + 50);
    expect(d3.items[1]).toMatchObject({ name: "마카오 출발", travelMinutesToNext: 290 });
  });

  it("원문에 항공편 시각이 없으면 일정을 건드리지 않는다", () => {
    expect(courseFlightOption({ outbound: leg({ airline: "제주항공" }), inbound: leg() })).toBeNull();
    const plan = toCoursePlan(parsed({ outbound: leg(), inbound: leg() }));
    expect(plan.days[0].items[0].travelMinutesToNext).toBe(40);
    expect(plan.days[0].meetingTime).toBeUndefined();
  });
});
