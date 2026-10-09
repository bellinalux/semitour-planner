import { describe, expect, it } from "vitest";
import { calculateQuote } from "@/lib/cost";
import { buildProductCompare, productCompareCsv } from "@/lib/productCompare";
import type { Competitor, CompetitorItinerary, TripInput } from "@/types";
import { input, item, linearDay } from "./fixtures";

const days = [
  linearDay(1, [item("a", { name: "성바울 성당" }), item("b", { name: "세나도 광장" }), item("l", { name: "점심 식사", type: "meal", mealCost: 20000 }), item("d", { name: "저녁 식사", type: "meal", mealCost: 30000 })]),
  linearDay(2, [item("c", { name: "콜로안 빌리지" }), item("l2", { name: "점심 식사", type: "meal", mealCost: 20000 }), item("d2", { name: "저녁 식사", type: "meal", mealCost: 30000 })]),
];
const land = { guide: true, meals: true, admission: true, vehicle: true, hotel: false, flight: false };
const itinerary = (patch: Partial<CompetitorItinerary> = {}): CompetitorItinerary => ({
  found: true,
  days: [
    { day: 1, title: "", places: ["성바울성당", "베네시안 리조트"], meals: { breakfast: "", lunch: "불포함", dinner: "포르투갈식" }, hotel: "", free: false, otherRegion: "" },
    { day: 2, title: "", places: [], meals: { breakfast: "호텔식", lunch: "불포함", dinner: "불포함" }, hotel: "", free: true, otherRegion: "" },
  ],
  mealCount: 1,
  tipNote: "1인 US$30 현지 지불",
  sourceName: "참좋은여행",
  checkedAt: "x",
  ...patch,
});
const comp = (patch: Partial<Competitor>): Competitor => ({ id: "c", name: "참좋은여행 마카오 3박 4일", price: 500_000, includes: land, shopping: "none", optionTour: "none", note: "", ...patch });

function build(patch: Partial<TripInput>) {
  const i = input({ destination: "마카오", targetMarginRate: 20, ...patch });
  const q = calculateQuote(i, days, {});
  if (!q.ok) throw new Error(q.error);
  return buildProductCompare(i, days, {}, q, null)!;
}

describe("상품 비교 보기", () => {
  it("날짜별 코스를 같은 곳/우리만/그 상품만으로 나누고, 식사 횟수·자유일·팁·나은 점을 정리한다", () => {
    const cmp = build({ competitors: [comp({ itinerary: itinerary() })] });
    const [ours, theirs] = cmp.products;
    expect(ours.days![0].places).toEqual([
      { name: "성바울 성당", mark: "shared" },
      { name: "세나도 광장", mark: "only" },
    ]);
    expect(theirs.days![0].places).toEqual([
      { name: "성바울성당", mark: "shared" },
      { name: "베네시안 리조트", mark: "only" },
    ]);
    expect(theirs).toMatchObject({ mealCount: 1, freeDays: 1, tipNote: "1인 US$30 현지 지불", itineraryState: "found" });
    expect(ours.mealCount).toBe(4);
    expect(theirs.ourBetter.some((s) => s.startsWith("식사 3회 더 포함"))).toBe(true);
    expect(theirs.ourBetter.some((s) => s.startsWith("그 상품에 없는 방문지 2곳"))).toBe(true);
    expect(theirs.theirBetter.some((s) => s.includes("베네시안 리조트"))).toBe(true);
    expect(cmp.conclusion).toMatch(/같은 조건 가격은 2개 중 \d번째/);
  });

  it("일정을 아직 안 가져왔으면 주요 방문지만, 다른 지역 포함 상품은 결론 순위에서 뺀다", () => {
    const cmp = build({ competitors: [comp({ id: "h", name: "하나투어 홍콩/마카오 4일", places: ["빅토리아 피크"] })] });
    expect(cmp.products[1]).toMatchObject({ days: null, itineraryState: "notFetched", otherRegions: ["홍콩"] });
    expect(cmp.conclusion).toContain("같은 범위로 견줄 경쟁 상품 가격이 없습니다");
  });

  it("엑셀(CSV)은 BOM과 날짜별 열을 담는다", () => {
    const csv = productCompareCsv(build({ competitors: [comp({ itinerary: itinerary() })] }));
    expect(csv.startsWith("﻿상품,표시 가격")).toBe(true);
    expect(csv).toContain("DAY 2");
    expect(csv).toContain("[자유]");
  });
});

describe("상품 비교 — 선택관광 내용", () => {
  it("경쟁 상품 일정에서 읽은 선택관광 이름·가격을 보여 주고, 우리가 노옵션이면 강점으로", () => {
    const cmp = build({
      options: [],
      competitors: [comp({ optionTour: "unknown", itinerary: itinerary({ optionTours: [{ name: "마카오 타워 번지점프", priceText: "1인 US$400" }, { name: "하우스 오브 댄싱 워터", priceText: "1인 US$120" }] }) })],
    });
    const theirs = cmp.products[1];
    expect(theirs.optionTours).toEqual([
      { name: "마카오 타워 번지점프", price: "1인 US$400" },
      { name: "하우스 오브 댄싱 워터", price: "1인 US$120" },
    ]);
    expect(theirs.optionTour).toBe("some");
    expect(theirs.ourBetter).toContain("노옵션 (그 상품 선택관광 2개)");
    expect(productCompareCsv(cmp)).toContain("마카오 타워 번지점프 1인 US$400");
  });

  it("우리 선택관광은 입력한 옵션(이름·1인 요금), 일정을 안 가져온 경쟁 상품은 내용 모름(null)", () => {
    const cmp = build({
      options: [{ id: "o", name: "홍콩 데이투어", description: "", durationMinutes: 600, dayNo: 3, costPerPerson: 240000, pricePerPerson: 295000, minParticipants: 8, participationRate: 30, note: "" }],
      competitors: [comp({})],
    });
    expect(cmp.products[0].optionTours).toEqual([{ name: "홍콩 데이투어", price: "1인 295,000" }]);
    expect(cmp.products[1].optionTours).toBeNull();
  });
});
