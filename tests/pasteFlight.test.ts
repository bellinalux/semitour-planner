import { describe, expect, it } from "vitest";
import { dayMeetingTime, walkTimeline } from "@/lib/dayLoad";
import { courseDayCounts, courseTextWithFlight, flightFromImport, importPatch, linkFacts } from "@/lib/productImport";
import { lunchAfterArrival, withPastedFlight } from "@/lib/pasteFlight";
import type { ProductImportResponse } from "@/lib/schemas/productImport";
import type { DayPlan, FlightOption, ItineraryItem } from "@/types";
import { input } from "./fixtures";

const it0 = (id: string, name: string, type: ItineraryItem["type"], stay = 60, travel: number | null = 20): ItineraryItem => ({
  id, name, type, description: "", stayMinutes: stay, travelMinutesToNext: travel, entryFee: 0, mealCost: 0, isEstimated: false, admission: "none",
  ...(type === "meal" ? { mealSlot: name.includes("중식") ? ("lunch" as const) : ("dinner" as const) } : {}),
});
const day = (n: number, items: ItineraryItem[], city = "후쿠오카"): DayPlan => ({ day: n, theme: "", kind: "linear", items, amGuided: [], pmFreeOptions: [], overnightCity: city });
const times = (d: DayPlan) => Object.fromEntries(walkTimeline(d.items, dayMeetingTime(d)).map((s) => [s.item.name, `${String(Math.floor((s.start % 1440) / 60)).padStart(2, "0")}:${String(s.start % 60).padStart(2, "0")}`]));

const flight: FlightOption = {
  airline: "티웨이항공", flightNumber: "TW291", departDate: "2026-12-09", departAirport: "인천", departTime: "10:30", arriveAirport: "후쿠오카", arriveTime: "11:55",
  stops: 0, duration: "", price: 0, basis: "searched", sourceName: "", link: "", returnFlightNumber: "TW292", returnDepartDate: "2026-12-11",
  returnDepartAirport: "후쿠오카", returnDepartTime: "13:00", returnArriveAirport: "인천", returnArriveTime: "14:30", returnStops: 0, returnDuration: "",
};

// 원문에 항공 시각이 없는 업체 코스 (예전엔 첫날 08:00 출발, 귀국편 10:20으로 찍혔다)
const pasted = () => [
  day(1, [it0("a", "인천국제공항 출발", "flight", 0, 80), it0("b", "후쿠오카 공항 도착", "flight", 0, 40), it0("c", "다자이후 텐만구", "sightseeing", 90), it0("d", "중식 (현지식)", "meal"), it0("e", "유후인 민예촌", "sightseeing", 120), it0("f", "석식", "meal"), it0("g", "호텔 투숙", "hotel", 0, 0)]),
  day(2, [it0("h", "벳푸 가마도지옥", "sightseeing"), it0("i", "중식", "meal"), it0("j", "모모치 해변", "sightseeing")]),
  day(3, [it0("k", "캐널시티", "shopping", 90), it0("l", "후쿠오카 공항 출발", "flight", 0, 80), it0("m", "인천 도착", "flight", 0, 0)], ""),
];

describe("업체 코스에 항공편 맞추기", () => {
  it("첫날은 출발 시각부터, 마지막 날은 귀국편 시각에 맞추고, 도착 뒤 점심을 먼저 한다", () => {
    const out = withPastedFlight(pasted(), flight);
    const d1 = times(out[0]);
    expect(d1["인천국제공항 출발"]).toBe("10:30");
    expect(d1["후쿠오카 공항 도착"]).toBe("11:55");
    expect(out[0].items.findIndex((i) => i.name === "중식 (현지식)")).toBeLessThan(out[0].items.findIndex((i) => i.name === "다자이후 텐만구"));
    expect(d1["중식 (현지식)"] <= "13:30").toBe(true);
    expect(times(out[2])["후쿠오카 공항 출발"]).toBe("13:00");
  });

  it("원문에 비행 항목이 아예 없으면 첫날 앞·마지막 날 뒤에 만든다", () => {
    const days = pasted().map((d) => ({ ...d, items: d.items.filter((i) => i.type !== "flight") }));
    const out = withPastedFlight(days, flight);
    expect(out[0].items[0].name).toBe("인천 출발");
    expect(times(out[0])["인천 출발"]).toBe("10:30");
    expect(out[2].items.map((i) => i.name)).toEqual(expect.arrayContaining(["후쿠오카 공항 이동", "후쿠오카 출발", "인천 도착"]));
    expect(times(out[2])["후쿠오카 출발"]).toBe("13:00");
  });

  it("오후 늦게 도착하면 점심을 옮기지 않는다", () => {
    const late = withPastedFlight(pasted(), { ...flight, departTime: "14:00", arriveTime: "15:20" });
    const names = late[0].items.map((i) => i.name);
    expect(names.indexOf("다자이후 텐만구")).toBeLessThan(names.indexOf("중식 (현지식)"));
    expect(lunchAfterArrival(pasted()[1])).toEqual(pasted()[1]);
  });
});

describe("상품 링크 주소·원문", () => {
  it("네이버 패키지 주소에서 출발일·상품 코드를 읽는다", () => {
    expect(linkFacts("https://pkgtour.naver.com/products/ybtour/JKP14657C00-20261209?nxKeyword=x")).toEqual({ departureDate: "2026-12-09", productCode: "JKP14657C00", agencySlug: "ybtour" });
    expect(linkFacts("https://example.com/tour/1234").departureDate).toBe("");
    expect(linkFacts("not a url").departureDate).toBe("");
  });

  it("날짜별 줄 수 — 내용이 거의 없는 날을 찾는다", () => {
    const c = courseDayCounts("제1일 (12/09)\n인천 출발\n다자이후\n석식\n제2일 (12/10)\n\n제3일\n캐널시티\n공항");
    expect(c).toEqual([{ day: 1, lines: 3 }, { day: 2, lines: 0 }, { day: 3, lines: 2 }]);
    expect(courseDayCounts("DAY 1 인천 출발 10:30 후쿠오카\nDAY 2\n벳푸").map((x) => x.day)).toEqual([1, 2]);
  });

  it("원문에 항공 시각이 없으면 항공 줄을 붙이고, 있으면 그대로", () => {
    const withLine = courseTextWithFlight("제1일 인천 출발\n제3일 귀국", flight);
    expect(withLine).toContain("TW291 인천 10:30 출발 → 후쿠오카 11:55 도착");
    expect(withLine).toContain("후쿠오카 13:00 출발");
    const already = "제1일 인천 10:30 출발\n제3일 후쿠오카 13:00 출발";
    expect(courseTextWithFlight(already, flight)).toBe(already);
  });

  it("그대로 가져오기: 출발일은 링크 기준, 일정 원문에 항공 줄", () => {
    const r: ProductImportResponse = {
      found: true, productName: "후쿠오카 2박3일", agency: "노랑풍선", destination: "후쿠오카", departureDate: "2026-12-16", nights: 2, days: 3, pricePerPerson: 599000, priceNote: "", hotel: "",
      outbound: { airline: "티웨이항공", flightNumber: "TW291", date: "", departAirport: "인천", departTime: "10:30", arriveAirport: "후쿠오카", arriveTime: "11:55" },
      inbound: { airline: "티웨이항공", flightNumber: "TW292", date: "", departAirport: "후쿠오카", departTime: "13:00", arriveAirport: "인천", arriveTime: "14:30" },
      mustSee: [], included: [], excluded: [], shopping: 0, optionTours: [], guideFee: "", cancelPolicy: "", courseDetail: true,
      courseText: "제1일 인천 출발 / 다자이후\n제2일 유후인\n제3일 귀국", url: "https://pkgtour.naver.com/products/ybtour/JKP14657C00-20261209", readDirect: false, sources: [],
    };
    expect(flightFromImport(r)).not.toBeNull();
    const p = importPatch(r, input({ competitors: [] }), "copy");
    expect(p.departureDate).toBe("2026-12-09");
    expect(p.courseText).toMatch(/^\[항공\]/);
  });
});
