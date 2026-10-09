import { describe, expect, it } from "vitest";
import { refreshCompetitors } from "@/lib/competitors";
import { samePlace } from "@/lib/places";
import type { Competitor, CompetitorCandidate } from "@/types";

describe("방문지 이름 비교", () => {
  it("띄어쓰기·덧붙인 말·괄호 속 다른 표기가 달라도 같은 곳", () => {
    expect(samePlace("바나힐", "바나 힐 테마파크")).toBe(true);
    expect(samePlace("Ba Na Hills (바나힐)", "바나힐 골든브릿지")).toBe(true);
    expect(samePlace("호이안", "호이안 올드타운")).toBe(true);
    expect(samePlace("오행산 / Marble Mountains", "marble mountains")).toBe(true);
  });

  it("일반 이름·짧은 이름은 포함 관계로 같다고 하지 않는다", () => {
    expect(samePlace("야시장", "호이안 야시장")).toBe(false);
    expect(samePlace("시장", "한 시장")).toBe(false);
    expect(samePlace("호이안 올드타운", "호이안 야시장")).toBe(false);
    expect(samePlace("야시장", "야 시장")).toBe(true);
  });
});

const land = { guide: true, meals: true, admission: true, vehicle: true, hotel: false, flight: false };
const found = (patch: Partial<Competitor> = {}): Competitor => ({
  id: "a",
  name: "하나투어 다낭 3일",
  price: 450000,
  includes: land,
  shopping: "none",
  optionTour: "none",
  note: "",
  source: { agency: "하나투어", url: "https://example.com/a", sourceName: "하나투어", basis: "searched", foundAt: "2026-09-01T00:00:00Z" },
  ...patch,
});
const candidate = (patch: Partial<CompetitorCandidate> = {}): CompetitorCandidate => ({
  agency: "하나투어",
  productName: "다낭 3일",
  pricePerPerson: 470000,
  priceNote: "",
  nights: 2,
  days: 3,
  hotelGrade: "4성급",
  includes: land,
  noShopping: true,
  noOption: true,
  policyUnknown: false,
  highlight: "",
  places: ["바나힐", "호이안"],
  basis: "searched",
  sourceName: "하나투어",
  searchUrl: "https://example.com/a",
  linkIsDirect: true,
  ...patch,
});

describe("경쟁 상품 다시 조회", () => {
  it("검색으로 넣은 상품의 방문지·호텔 등급·가격·확인 시각을 새로 고친다", () => {
    const r = refreshCompetitors([found()], [candidate()], "2026-10-09T00:00:00Z");
    expect(r.updated).toEqual(["하나투어 다낭 3일"]);
    expect(r.competitors[0]).toMatchObject({
      price: 470000,
      places: ["바나힐", "호이안"],
      hotelGrade: "4성급",
      nights: 2,
      days: 3,
      source: { foundAt: "2026-10-09T00:00:00Z" },
    });
  });

  it("이름이 바뀌어도 같은 여행사 상품으로 찾고, 직접 고친 가격·직접 입력한 상품은 그대로", () => {
    const edited = found({ priceCheckedAt: "2026-09-10T00:00:00Z", price: 430000 });
    const manual: Competitor = { ...found({ id: "m", name: "직접 넣은 상품" }), source: undefined };
    const r = refreshCompetitors(
      [edited, manual],
      [candidate({ productName: "[노쇼핑] 다낭 3일", searchUrl: "", linkIsDirect: false })],
      "2026-10-09T00:00:00Z",
    );
    expect(r.competitors[0]).toMatchObject({ price: 430000, places: ["바나힐", "호이안"], source: { foundAt: "2026-09-01T00:00:00Z" } });
    expect(r.competitors[1]).toBe(manual);
  });

  it("못 찾은 상품은 그대로 두고 알려 준다", () => {
    const r = refreshCompetitors(
      [found()],
      [candidate({ agency: "모두투어", productName: "다낭", searchUrl: "https://example.com/b" })],
      "2026-10-09T00:00:00Z",
    );
    expect(r.updated).toEqual([]);
    expect(r.missing).toEqual(["하나투어 다낭 3일"]);
  });
});

describe("경쟁 가격 변동 추적", () => {
  it("다시 조회해서 가격이 바뀌면 이전 가격·확인 시각을 기록하고 마지막 변동을 알려 준다", async () => {
    const { lastPriceChange } = await import("@/lib/competitors");
    const r = refreshCompetitors([found({ price: 500000 })], [candidate({ pricePerPerson: 470000 })], "2026-10-09T00:00:00Z");
    const c = r.competitors[0];
    expect(c.priceHistory).toEqual([{ price: 500000, at: "2026-09-01T00:00:00Z" }]);
    expect(lastPriceChange(c)).toEqual({ from: 500000, diff: -30000, at: "2026-09-01T00:00:00Z" });
    // 같은 가격이면 기록하지 않는다
    const same = refreshCompetitors([c], [candidate({ pricePerPerson: 470000 })], "2026-10-10T00:00:00Z").competitors[0];
    expect(same.priceHistory).toHaveLength(1);
  });
});
