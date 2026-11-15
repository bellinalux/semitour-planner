import { describe, expect, it } from "vitest";
import type { PlaceCard } from "@/lib/knowledge";
import { inquirySchema } from "@/lib/inquiry";
import { askLine, askToTripPatch, serviceRequestSchema } from "@/lib/serviceRequest";
import { isKoreanFavorite, rankSpots } from "@/lib/server/publicPlan";
import { accessHint, dayLegs } from "@/lib/selfGuide";
import type { DayPlan, ItineraryItem } from "@/types";

const card = (name: string, extra: Partial<PlaceCard> = {}): PlaceCard => ({
  key: name, name, area: "", kind: "sight", popularity: 50, seen: 1, agencies: [], fits: [], likes: [], dislikes: [], tips: [], stayWeb: 60, fieldNotes: [], sources: [], verified: false, updatedAt: "", ...extra,
});

describe("꼭 가볼 곳", () => {
  it("한국인 인기(한국 여행사 2곳+ / 우리 고객 추천) 먼저, 식당·평이 나쁜 곳은 빼기", () => {
    const places = [
      card("인기만 높은 곳", { popularity: 90 }),
      card("다자이후 텐만구", { popularity: 70, agencies: ["하나투어", "모두투어", "노랑풍선"], likes: ["학문의 신 신사"], tips: ["오전이 한산"] }),
      card("라멘집", { kind: "meal", popularity: 99 }),
      card("별로인 곳", { popularity: 95, votes: { best: 0, worst: 5 } }),
      card("고객 추천", { popularity: 40, votes: { best: 3, worst: 0 } }),
    ];
    const spots = rankSpots(places, 10);
    expect(spots.map((s) => s.name)).toEqual(["다자이후 텐만구", "고객 추천", "인기만 높은 곳"]);
    expect(spots[0]).toMatchObject({ korean: true, tips: ["오전이 한산"] });
    expect(spots[0].why).toMatch(/학문의 신 신사 · 한국 여행사 일정 3곳에 포함/);
    expect(isKoreanFavorite(places[0])).toBe(false);
    expect(isKoreanFavorite(places[4])).toBe(true);
  });
  it("가는 방법 — 도심 기준 대중교통·택시, 가이드 방식은 전용차량, 근교는 투어 추천", () => {
    const center = { lat: 33.5902, lng: 130.4207 };
    const near = accessHint(center, { name: "캐널시티", lat: 33.5893, lng: 130.4108 }, "후쿠오카", false);
    expect(near.text).toMatch(/도심에서 (도보|대중교통)/);
    const far = accessHint(center, { name: "유후인", lat: 33.263, lng: 131.356 }, "후쿠오카", false);
    expect(far.text).toMatch(/근교/);
    expect(far.link).toContain("travelmode=transit");
    expect(far.airportLink).toContain(encodeURIComponent("후쿠오카 공항"));
    expect(accessHint(center, { name: "유후인", lat: 33.263, lng: 131.356 }, "후쿠오카", true).text).toMatch(/전용차량/);
    expect(accessHint(null, { name: "어딘가" }, "후쿠오카", false).text).toMatch(/길찾기/);
  });
  it("장소 사이 이동은 가이드 방식에도 (전용차량)", () => {
    const it = (id: string, lat: number, lng: number, m = 25): ItineraryItem => ({ id, name: id, type: "sightseeing", description: "", stayMinutes: 60, travelMinutesToNext: m, entryFee: 0, mealCost: 0, isEstimated: true, lat, lng });
    const d: DayPlan = { day: 1, theme: "", kind: "linear", items: [it("a", 33.59, 130.42), it("b", 33.52, 130.53)], amGuided: [], pmFreeOptions: [], overnightCity: "후쿠오카" };
    expect(dayLegs(d, true)[0].hint).toMatchObject({ mode: "car", text: "전용차량 약 25분" });
    expect(dayLegs(d)[0].hint.mode).toBe("transit");
  });
});

describe("우리에게 요청하기", () => {
  const req = serviceRequestSchema.parse({
    kind: "booking",
    items: [
      { id: "flight", details: { from: "인천", go: "2026-12-01", back: "2026-12-03" } },
      { id: "hotel", details: { area: "하카타역 주변", nights: "2", grade: "4성" } },
      { id: "esim", details: { type: "eSIM", days: "3" } },
    ],
    contactHow: "카카오톡",
  });
  it("항목 한 줄", () => {
    expect(askLine(req.items[1])).toBe("호텔 — 지역·구역 하카타역 주변 · 박수 2 · 등급 4성");
    expect(askLine({ id: "insurance", details: {} })).toBe("여행자보험");
  });
  it("직원 입력으로 — 항공 포함·상품 구성·날짜·박수·호텔 등급", () => {
    expect(askToTripPatch(req)).toEqual({ includesFlights: true, packageType: "full", departureDate: "2026-12-01", hotelGrade: "4", nights: 2, days: 3 });
    expect(askToTripPatch(serviceRequestSchema.parse({ kind: "quote", items: [{ id: "esim" }] }))).toEqual({ includesFlights: false, packageType: "land" });
  });
  it("형식 — 항목 1개 이상, 모르는 항목 거절, 견적 요청에 실림", () => {
    expect(serviceRequestSchema.safeParse({ kind: "quote", items: [] }).success).toBe(false);
    expect(serviceRequestSchema.safeParse({ kind: "quote", items: [{ id: "spa" }] }).success).toBe(false);
    expect(serviceRequestSchema.safeParse({ kind: "rent", items: [{ id: "esim" }] }).success).toBe(false);
    const q = inquirySchema.parse({ name: "홍", contact: "010-1234-5678", destination: "후쿠오카", travelers: 2, asks: req, consent: true });
    expect(q.asks?.items).toHaveLength(3);
  });
});
