import { describe, expect, it } from "vitest";
import { cacheKeyOf, DEFAULT_STYLE, isSelfGuided, parsePriceLine, priceNoteFor, publicPlanRequestSchema, STYLE_IDS, STYLES, styleToTripPatch, toTripInput } from "@/lib/publicPlan";
import { inquirySchema } from "@/lib/inquiry";
import { dayLegs, directionsLink, hotelAreas, legHint, passAdvice } from "@/lib/selfGuide";
import type { DayPlan, ItineraryItem } from "@/types";

const at = (id: string, name: string, lat?: number, lng?: number, type: ItineraryItem["type"] = "sightseeing"): ItineraryItem => ({ id, name, type, description: "", stayMinutes: 60, travelMinutesToNext: 20, entryFee: 0, mealCost: 0, isEstimated: true, ...(lat !== undefined ? { lat, lng } : {}) });
const day = (n: number, items: ItineraryItem[], city = "후쿠오카"): DayPlan => ({ day: n, theme: "", kind: "linear", items, amGuided: [], pmFreeOptions: [], overnightCity: city });

describe("여행 방식 5가지", () => {
  it("기본은 자유여행 + 투어 추가, 방식별 기본 서비스", () => {
    expect(STYLE_IDS).toHaveLength(5);
    expect(DEFAULT_STYLE).toBe("free_tour");
    const r = publicPlanRequestSchema.parse({ destination: "후쿠오카", nights: 2, days: 3 });
    expect(r.style).toBe("free_tour");
    expect(r.services).toEqual([]);
    expect(STYLES.package.services).toContain("guide");
    expect(STYLES.free_tour.services).toEqual(expect.arrayContaining(["esim", "insurance"]));
    expect(publicPlanRequestSchema.safeParse({ destination: "a", nights: 1, days: 2, style: "cruise" }).success).toBe(false);
  });
  it("가이드 여부와 내부 운영 방식", () => {
    expect(isSelfGuided("package")).toBe(false);
    expect(isSelfGuided("semi")).toBe(false);
    expect(isSelfGuided("free_tour")).toBe(true);
    expect(isSelfGuided("backpack")).toBe(true);
    const base = { destination: "후쿠오카", nights: 2, days: 3 };
    expect(toTripInput(publicPlanRequestSchema.parse({ ...base, style: "package" })).operatingModel).toBe("full");
    expect(toTripInput(publicPlanRequestSchema.parse({ ...base, style: "backpack" })).operatingModel).toBe("backpack");
  });
  it("방식이 다르면 캐시도 다르고, 서비스 순서는 상관없음", () => {
    const a = publicPlanRequestSchema.parse({ destination: "다낭", nights: 3, days: 4, style: "package", services: ["hotel", "flight"] });
    const b = publicPlanRequestSchema.parse({ destination: "다낭", nights: 3, days: 4, style: "package", services: ["flight", "hotel"] });
    const c = publicPlanRequestSchema.parse({ destination: "다낭", nights: 3, days: 4, style: "backpack" });
    expect(JSON.stringify(cacheKeyOf(a))).toBe(JSON.stringify(cacheKeyOf(b)));
    expect(JSON.stringify(cacheKeyOf(a))).not.toBe(JSON.stringify(cacheKeyOf(c)));
  });
  it("직원 견적 입력으로 — 방식·항공·호텔", () => {
    expect(styleToTripPatch(undefined, [])).toEqual({});
    expect(styleToTripPatch("package", ["flight", "hotel"])).toEqual({ operatingModel: "full", includesFlights: true, packageType: "full" });
    expect(styleToTripPatch("airtel", ["hotel", "esim"])).toEqual({ operatingModel: "airtel", includesFlights: false, packageType: "land_hotel" });
    expect(styleToTripPatch("backpack", ["esim"])).toMatchObject({ packageType: "land" });
  });
  it("견적 요청에 방식·서비스·투어 날", () => {
    const ok = inquirySchema.safeParse({ name: "홍", contact: "010-1234-5678", destination: "후쿠오카", travelers: 2, plan: { title: "t", days: [{}], style: "free_tour", services: ["esim", "insurance"], tourDays: [2] }, consent: true });
    expect(ok.success).toBe(true);
    expect(inquirySchema.safeParse({ name: "홍", contact: "010-1234-5678", destination: "후쿠오카", travelers: 2, plan: { title: "t", days: [{}], services: ["spa"] } }).success).toBe(false);
  });
});

describe("방식별 예상 경비", () => {
  const table = [
    { match: "후쿠오카", text: "1인 69만~" },
    { match: "후쿠오카", style: "airtel" as const, text: "1인 35만~" },
  ];
  it("방식에 맞는 줄을 먼저, 없으면 공통 줄", () => {
    expect(priceNoteFor({ showPrice: true, priceTable: table }, "후쿠오카", "airtel")).toBe("1인 35만~");
    expect(priceNoteFor({ showPrice: true, priceTable: table }, "후쿠오카", "package")).toBe("1인 69만~");
    expect(priceNoteFor({ showPrice: true, priceTable: table }, "후쿠오카")).toBe("1인 69만~");
  });
  it("설정 줄 읽기", () => {
    expect(parsePriceLine("후쿠오카 | 항공+호텔만 | 1인 35만~")).toEqual({ match: "후쿠오카", style: "airtel", text: "1인 35만~" });
    expect(parsePriceLine("후쿠오카 | 1인 69만~")).toEqual({ match: "후쿠오카", text: "1인 69만~" });
    expect(parsePriceLine("후쿠오카")).toBeNull();
    expect(parsePriceLine("")).toBeNull();
  });
});

describe("자유여행 셀프 안내", () => {
  it("가까우면 도보, 멀면 대중교통 + 길찾기 링크", () => {
    const a = at("a", "하카타역", 33.5902, 130.4207);
    const near = at("b", "캐널시티", 33.5893, 130.4108);
    const far = at("c", "다자이후", 33.5196, 130.5349);
    expect(legHint(a, near).mode).toBe("walk");
    const h = legHint(a, far);
    expect(h.mode).toBe("transit");
    expect(h.text).toMatch(/대중교통 약 \d+분/);
    expect(h.link).toContain("travelmode=transit");
    expect(directionsLink(at("x", "A"), at("y", "B"), "walking")).toContain("origin=A");
  });
  it("하루 이동은 항공·호텔 줄을 건너뜀", () => {
    const d = day(1, [at("f", "인천 출발", undefined, undefined, "flight"), at("a", "A", 33.59, 130.42), at("b", "B", 33.58, 130.41), at("h", "호텔", undefined, undefined, "hotel")]);
    const legs = dayLegs(d);
    expect(legs).toHaveLength(1);
    expect(legs[0].from.id).toBe("a");
  });
  it("교통패스·숙소 구역", () => {
    expect(passAdvice("후쿠오카")).toMatch(/JR 규슈/);
    expect(passAdvice("다낭")).toMatch(/그랩/);
    expect(passAdvice("아무데나")).toMatch(/교통카드/);
    const days = [day(1, [at("a", "하카타역", 33.5902, 130.4207), at("b", "캐널시티", 33.5893, 130.4108), at("c", "텐진", 33.5913, 130.3989)])];
    expect(hotelAreas(days)).toEqual([{ city: "후쿠오카", near: "캐널시티" }]);
  });
});
