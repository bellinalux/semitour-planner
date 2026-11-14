import { describe, expect, it } from "vitest";
import { fixCourseOrder } from "@/lib/courseOrder";
import { dayMeetingTime, walkTimeline } from "@/lib/dayLoad";
import { courseHotelName, restAfter } from "@/lib/itineraryDoc";
import { withPastedFlight } from "@/lib/pasteFlight";
import { flightFromImport, sameFlightNo } from "@/lib/productImport";
import type { ProductImportResponse } from "@/lib/schemas/productImport";
import type { DayPlan, FlightOption, ItineraryItem } from "@/types";

const it0 = (id: string, name: string, type: ItineraryItem["type"], stay = 60, travel: number | null = 30): ItineraryItem => ({
  id, name, type, description: "", stayMinutes: stay, travelMinutesToNext: travel, entryFee: 0, mealCost: 0, isEstimated: false, admission: "none",
  ...(type === "meal" ? { mealSlot: name.includes("점심") ? ("lunch" as const) : ("dinner" as const) } : {}),
});
const day = (n: number, items: ItineraryItem[], city: string): DayPlan => ({ day: n, theme: "", kind: "linear", items, amGuided: [], pmFreeOptions: [], overnightCity: city });
const names = (d: DayPlan) => d.items.map((i) => i.name);
const clock = (d: DayPlan) => Object.fromEntries(walkTimeline(d.items, dayMeetingTime(d)).map((s) => [s.item.name, `${String(Math.floor((s.start % 1440) / 60)).padStart(2, "0")}:${String(s.start % 60).padStart(2, "0")}`]));

// 노랑풍선 후쿠오카 2박3일 — 상품 페이지의 날짜 요약(식사 → 호텔 → 관광지 목록) 순서로 읽힌 코스 (보내 주신 PDF)
const summaryOrdered = () => [
  day(1, [it0("a1", "인천 출발", "flight", 0, 90), it0("a2", "후쿠오카 도착", "flight", 0, 15), it0("a3", "저녁 식사 (자유식)", "meal"), it0("a4", "힐튼 후쿠오카 시 호크", "hotel", 0, 20), it0("a5", "라라포트 후쿠오카", "shopping"), it0("a6", "시사이드 모모치", "sightseeing", 40)], "후쿠오카"),
  day(2, [it0("b1", "점심 식사 (현지식)", "meal"), it0("b2", "저녁 식사 (호텔식)", "meal"), it0("b3", "츠에타테 온센 호텔 히젠야", "hotel", 0), it0("b4", "야나가와 뱃놀이", "experience", 60, 90), it0("b5", "가마도 지옥", "sightseeing", 40, 30), it0("b6", "유후인 민예촌", "sightseeing", 60, 10), it0("b7", "긴린코 호수", "sightseeing", 30, 60)], "구마모토"),
  day(3, [it0("c1", "점심 식사 (현지식)", "meal"), it0("c2", "후쿠오카 출발", "flight", 0, 100), it0("c3", "인천 도착", "flight", 0, 0), it0("c4", "다자이후 텐만구", "sightseeing", 60, 40), it0("c5", "후쿠오카국제공항 이동", "transfer", 0, 40)], ""),
];
const flight: FlightOption = {
  airline: "제주항공", flightNumber: "7C1405", departDate: "2026-12-09", departAirport: "인천", departTime: "15:20", arriveAirport: "후쿠오카", arriveTime: "16:50",
  stops: 0, duration: "", price: 0, basis: "searched", sourceName: "", link: "", returnFlightNumber: "", returnDepartDate: "2026-12-11",
  returnDepartAirport: "후쿠오카", returnDepartTime: "17:50", returnArriveAirport: "인천", returnArriveTime: "19:30", returnStops: 0, returnDuration: "",
};

describe("업체 코스 순서 안전장치", () => {
  it("요약 순서로 꼬인 날을 바로잡는다 — 호텔은 끝, 저녁은 관광 뒤, 귀국편 뒤 관광은 공항 앞", () => {
    const { days, fixes } = fixCourseOrder(summaryOrdered());
    expect(names(days[0])).toEqual(["인천 출발", "후쿠오카 도착", "라라포트 후쿠오카", "시사이드 모모치", "저녁 식사 (자유식)", "힐튼 후쿠오카 시 호크"]);
    const d2 = names(days[1]);
    expect(d2[0]).toBe("야나가와 뱃놀이");
    expect(d2.at(-1)).toBe("츠에타테 온센 호텔 히젠야");
    expect(d2.at(-2)).toBe("저녁 식사 (호텔식)");
    expect(d2.indexOf("점심 식사 (현지식)")).toBeGreaterThan(0);
    expect(names(days[2])).toEqual(["다자이후 텐만구", "점심 식사 (현지식)", "후쿠오카국제공항 이동", "후쿠오카 출발", "인천 도착"]);
    expect(fixes.map((f) => f.day)).toEqual([1, 2, 3]);
    expect(fixes[0].note).toContain("숙박 호텔");
  });

  it("2일 점심은 점심 시간대(11~14시)에 온다", () => {
    const d2 = fixCourseOrder(summaryOrdered()).days[1];
    const t = clock(d2)["점심 식사 (현지식)"];
    expect(t >= "11:00" && t <= "14:00").toBe(true);
  });

  it("항공 시각을 맞추면 첫날 15:20 출발, 출국일은 조식 후 09:00 출발에 귀국편 17:50 고정", () => {
    const out = withPastedFlight(fixCourseOrder(summaryOrdered()).days, flight);
    expect(clock(out[0])["인천 출발"]).toBe("15:20");
    expect(clock(out[0])["후쿠오카 도착"]).toBe("16:50");
    expect(out[2].meetingTime).toBe("09:00");
    expect(clock(out[2])["다자이후 텐만구"]).toBe("09:00");
    expect(clock(out[2])["후쿠오카 출발"]).toBe("17:50");
  });

  it("바른 순서의 코스는 건드리지 않는다 (호텔 뒤 석식·야경은 그대로)", () => {
    const ok = [day(1, [it0("x1", "오사카성", "sightseeing", 90), it0("x2", "점심", "meal"), it0("x3", "유니버설", "experience", 240), it0("x4", "호텔 체크인", "hotel", 0), it0("x5", "저녁 식사", "meal"), it0("x6", "도톤보리 야경", "sightseeing")], "오사카")];
    const r = fixCourseOrder(ok);
    expect(r.fixes).toEqual([]);
    expect(r.days).toBe(ok);
  });
});

describe("일정표 숙박 호텔·자유시간·편명", () => {
  it("코스에 적힌 숙박 호텔 이름을 쓰고, '호텔 투숙'처럼 이름이 없으면 null", () => {
    expect(courseHotelName([it0("h", "힐튼 후쿠오카 시 호크", "hotel")])).toBe("힐튼 후쿠오카 시 호크");
    expect(courseHotelName([it0("h", "[숙박] - 츠에타테 히젠야 호텔", "hotel")])).toBe("츠에타테 히젠야 호텔");
    expect(courseHotelName([it0("h", "호텔 투숙", "hotel")])).toBeNull();
    expect(courseHotelName([it0("h", "호텔로 이동 및 휴식", "hotel")])).toBeNull();
    expect(courseHotelName([it0("h", "호텔 체크아웃", "hotel")])).toBeNull();
  });

  it("자정을 넘겨 끝난 날에는 '오후 자유시간'을 붙이지 않는다", () => {
    const d = day(1, [it0("r1", "긴린코 호수", "sightseeing")], "구마모토");
    const days = [d, day(2, [], "")];
    expect(restAfter(days, 0, {}, new Map([["r1", { start: "23:30", end: "00:00" }]]))).toBeNull();
    expect(restAfter(days, 0, {}, new Map([["r1", { start: "04:00", end: "05:00" }]]))).toBeNull();
    expect(restAfter(days, 0, {}, new Map([["r1", { start: "13:00", end: "14:00" }]]))?.stayMinutes).toBe(240);
  });

  it("오는 편 편명이 가는 편과 같으면 비운다", () => {
    expect(sameFlightNo("7C1405", "7c 1405")).toBe(true);
    expect(sameFlightNo("", "")).toBe(false);
    const leg = { airline: "제주항공", flightNumber: "7C1405", date: "", departAirport: "인천", departTime: "15:20", arriveAirport: "후쿠오카", arriveTime: "16:50" };
    const r = { outbound: leg, inbound: { ...leg, departAirport: "후쿠오카", departTime: "17:50", arriveAirport: "인천", arriveTime: "19:30" }, departureDate: "", agency: "", url: "" } as unknown as ProductImportResponse;
    expect(flightFromImport(r)!.returnFlightNumber).toBe("");
  });
});
