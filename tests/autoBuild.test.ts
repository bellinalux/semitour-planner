import { describe, expect, it } from "vitest";
import { hotelCities, hotelPatch, itineraryBudgetNote, lodgingDecided, pickHotel, pickTours, vehicleClassFor } from "@/lib/autoBuild";
import type { HotelCandidate, TourCandidate } from "@/types";
import { input } from "./fixtures";

const hotel = (name: string, low: number, high: number, patch: Partial<HotelCandidate> = {}): HotelCandidate => ({
  name,
  grade: "4성급",
  area: "",
  nearestStation: "",
  walkMinutes: 0,
  nightlyLow: low,
  nightlyHigh: high,
  priceBasis: "searched",
  koreanFriendly: false,
  koreanNote: "",
  highlights: "",
  mapUrl: "",
  ...patch,
});

const tour = (name: string, low: number, high: number, patch: Partial<TourCandidate> = {}): TourCandidate =>
  ({ name, category: "city", description: "", durationMinutes: 0, priceLow: low, priceHigh: high, priceBasis: "searched", includes: "", booking: "", koreanGuide: false, koreanNote: "", highlights: "", operator: "", sourceName: "", searchUrl: "", ...patch }) as TourCandidate;

describe("인원별 차종", () => {
  it.each([
    [2, "승용차·SUV (4인승)"],
    [5, "7인승 SUV·MPV"],
    [10, "미니밴 (15~16인승)"],
    [20, "중형버스 (25~29인승)"],
    [40, "대형버스 (45인승)"],
  ])("%i명 → %s", (n, label) => expect(vehicleClassFor(n)).toBe(label));
});

describe("숙소 고르기", () => {
  const list = [hotel("싼곳", 60000, 80000), hotel("중간", 110000, 130000, { koreanFriendly: true }), hotel("비싼곳", 200000, 240000), hotel("추정", 115000, 125000, { priceBasis: "estimated" })];

  it("상한 안에서 검색 확인·한국인 이용 확인·상한에 가까운 곳", () => {
    expect(pickHotel(list, 140000)).toMatchObject({ hotel: { name: "중간" }, rate: 120000, overBudget: false });
  });
  it("상한 안에 없으면 가장 싼 곳 + 예산 초과 표시", () => {
    expect(pickHotel(list, 50000)).toMatchObject({ hotel: { name: "싼곳" }, overBudget: true });
  });
  it("상한이 없으면 가운데쯤 요금", () => {
    expect(pickHotel(list, null)?.hotel.name).toBe("중간");
  });
  it("요금이 없으면 null", () => {
    expect(pickHotel([hotel("모름", 0, 0)], 100000)).toBeNull();
  });

  it("고른 숙소를 견적에 넣는다 (도시 하나면 기본 1박 요금, 출처는 고른 숙소)", () => {
    const p = hotelPatch(input(), { 다낭: { hotel: list[1], rate: 120000, overBudget: false } }, false);
    expect(p).toMatchObject({ lodgingRatePerNight: 120000, selectedHotels: { 다낭: { name: "중간" } }, costSource: { lodging: { kind: "hotel", note: "중간" } } });
  });
  it("도시가 여럿이면 도시별 요금", () => {
    const p = hotelPatch(input(), { 하노이: { hotel: list[0], rate: 70000, overBudget: false }, 하롱베이: { hotel: list[1], rate: 120000, overBudget: false } }, true);
    expect(p.lodgingCityRates).toMatchObject({ 하노이: 70000, 하롱베이: 120000 });
    expect(p.lodgingRatePerNight).toBeUndefined();
  });
  it("숙소를 찾을 지역: 숙박 도시가 둘 이상이면 도시마다", () => {
    expect(hotelCities(input({ destination: "베트남 북부" }), [{ city: "하노이", nights: 2 }, { city: "하롱베이", nights: 1 }])).toEqual(["하노이", "하롱베이"]);
    expect(hotelCities(input({ destination: "다낭" }), [{ city: "다낭", nights: 3 }])).toEqual(["다낭"]);
  });
  it("직접 정한(확정) 숙박 요금은 건드리지 않는다", () => {
    expect(lodgingDecided(input({ lodgingRatePerNight: 100000 }))).toBe(true);
    expect(lodgingDecided(input({ lodgingRatePerNight: 100000, costStatus: { vehicle: "confirmed", guide: "confirmed", other: "confirmed", lodging: "estimated", flight: "confirmed" } }))).toBe(false);
  });
});

describe("추천 투어", () => {
  const tours = [tour("비싼 투어", 150000, 170000), tour("평점 좋은", 40000, 60000, { priceBasis: "market", market: { productCode: "x", rating: 4.8, reviews: 300, freeCancellation: true } }), tour("한국어", 30000, 50000, { koreanGuide: true }), tour("가격 모름", 0, 0)];
  it("남은 예산 안의 것만, 판매 사이트 확인·평점 순", () => {
    expect(pickTours(tours, 100000).map((t) => t.name)).toEqual(["평점 좋은", "한국어"]);
  });
  it("예산이 없으면(원가에서 시작) 가격 제한 없이", () => {
    expect(pickTours(tours, null)).toHaveLength(3);
  });
});

describe("코스 만들 때 예산 안내", () => {
  it("판매가에서 시작하면 1인 입장·체험 합계와 식사 1끼 수준을 알려 준다", () => {
    const note = itineraryBudgetNote(input({ pricingMode: "fixed_price", fixedPricePerPerson: 1_000_000, days: 4, targetMarginRate: 15, cardFeeRate: 0 }));
    expect(note).toMatch(/^1인 유료 입장·체험료 합계 \d+ KRW 이내.*식사는 1인 1끼 약 \d+ KRW 수준$/);
  });
  it("원가에서 시작하면 안내 없음", () => {
    expect(itineraryBudgetNote(input())).toBe("");
  });
});
