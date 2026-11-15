import { describe, expect, it } from "vitest";
import { restGaps } from "@/lib/courseStandards";
import { dayTimes, lightenDay, moveItem, planSummary, removeItem, swapItem, transportOptions } from "@/lib/planEdit";
import { cacheKeyOf, compactDays, customerFlight, normalizePublicSettings, priceNoteFor, publicPlanRequestSchema, toTripInput } from "@/lib/publicPlan";
import { pickPlaces } from "@/lib/server/publicPlan";
import type { PlaceCard } from "@/lib/knowledge";
import type { DayPlan, ItineraryItem } from "@/types";

const it0 = (id: string, name: string, type: ItineraryItem["type"] = "sightseeing", stay = 60, travel: number | null = 30): ItineraryItem => ({ id, name, type, description: "", stayMinutes: stay, travelMinutesToNext: travel, entryFee: 0, mealCost: 0, isEstimated: true });
const day = (n: number, items: ItineraryItem[], city = "후쿠오카", extra: Partial<DayPlan> = {}): DayPlan => ({ day: n, theme: "", kind: "linear", items, amGuided: [], pmFreeOptions: [], overnightCity: city, ...extra });
const names = (d: DayPlan) => d.items.map((i) => i.name);

describe("고객 코스 요청·설정", () => {
  it("요청 형식 — 기본값과 제한", () => {
    const r = publicPlanRequestSchema.parse({ destination: "후쿠오카", nights: 2, days: 3 });
    expect(r).toMatchObject({ travelers: 2, pace: "normal", themes: [], mustSee: [], cities: [] });
    expect(publicPlanRequestSchema.safeParse({ destination: "", nights: 2, days: 3 }).success).toBe(false);
    expect(publicPlanRequestSchema.safeParse({ destination: "a", nights: 2, days: 3, arrive: "25시" }).success).toBe(false);
  });
  it("설정 정리 — 범위·이메일·경비표", () => {
    const s = normalizePublicSettings({ dailyCap: 99999, ipDaily: 0, notifyEmail: "nope", priceTable: [{ match: " 후쿠오카 ", text: "1인 69만~" }, { match: "", text: "x" }] });
    expect(s).toMatchObject({ enabled: true, dailyCap: 5000, ipDaily: 1, notifyEmail: "", aiFallback: true, showPrice: false });
    expect(s.priceTable).toEqual([{ match: "후쿠오카", text: "1인 69만~" }]);
    expect(normalizePublicSettings({ notifyEmail: "staff@example.com" }).notifyEmail).toBe("staff@example.com");
  });
  it("경비 안내는 표시가 켜져 있을 때만, 여행지 글자로 찾는다", () => {
    const table = [{ match: "후쿠오카", text: "1인 69만~89만 원" }];
    expect(priceNoteFor({ showPrice: false, priceTable: table }, "후쿠오카")).toBe("");
    expect(priceNoteFor({ showPrice: true, priceTable: table }, "후쿠오카, 유후인")).toBe("1인 69만~89만 원");
  });
  it("내부 입력으로 — 여러 도시는 도시 순서 글, 항공 시각은 고른 항공편으로", () => {
    const input = toTripInput(publicPlanRequestSchema.parse({ destination: "규슈", cities: [{ name: "후쿠오카", nights: 1 }, { name: "유후인", nights: 1 }], nights: 2, days: 3, arrive: "11:55", returnDepart: "17:50" }));
    expect(input).toMatchObject({ destination: "후쿠오카, 유후인", regionPlan: "후쿠오카 1박, 유후인 1박", days: 3, nights: 2, includesFlights: true, mode: "ai" });
    expect(input.selectedFlight).toMatchObject({ arriveTime: "11:55", returnDepartTime: "17:50" });
    expect(customerFlight({ originCity: "인천", destination: "후쿠오카", departureDate: "" }, "11:55", "17:50").departTime).toMatch(/^\d{2}:\d{2}$/);
  });
  it("같은 조건은 같은 저장 키 (토큰·순서 무시)", () => {
    const a = publicPlanRequestSchema.parse({ destination: "다낭", nights: 3, days: 4, themes: ["food", "nature"], token: "x" });
    const b = publicPlanRequestSchema.parse({ destination: "다낭", nights: 3, days: 4, themes: ["nature", "food"], token: "y" });
    expect(cacheKeyOf(a)).toEqual(cacheKeyOf(b));
  });
  it("저장용으로 줄이기 — 사진·확인 기록 빼고, 날짜·장소 수 제한", () => {
    const big = Array.from({ length: 20 }, (_, k) => day(k + 1, Array.from({ length: 30 }, (__, j) => ({ ...it0(`${k}-${j}`, "x".repeat(200)), photo: "data:image/png;base64,AAAA" }))));
    const c = compactDays(big);
    expect(c).toHaveLength(15);
    expect(c[0].items).toHaveLength(20);
    expect(c[0].items[0].name.length).toBe(80);
    expect("photo" in c[0].items[0]).toBe(false);
  });
});

describe("지식 창고에서 장소 고르기", () => {
  const card = (name: string, popularity: number, extra: Partial<PlaceCard> = {}): PlaceCard => ({ key: name, name, area: "", kind: "sight", popularity, seen: 1, agencies: [], fits: [], likes: [], dislikes: [], tips: [], stayWeb: 60, fieldNotes: [], sources: [], verified: false, updatedAt: "", ...extra });
  it("꼭 갈 곳 먼저, 인기·관심사 순, 평가 나쁜 곳·식당 제외", () => {
    const list = [card("후쿠오카 타워", 80), card("캐널시티", 60, { kind: "shopping" }), card("나쁜 곳", 99, { votes: { best: 0, worst: 5 } }), card("라멘집", 90, { kind: "meal" }), card("오호리 공원", 50)];
    expect(pickPlaces(list, { themes: [], mustSee: ["다자이후"] }, 4)).toEqual(["다자이후", "후쿠오카 타워", "캐널시티", "오호리 공원"]);
    // 관심사(자연)면 공원이 앞으로
    expect(pickPlaces(list, { themes: ["nature"], mustSee: [] }, 2)).toEqual(["오호리 공원", "후쿠오카 타워"]);
  });
});

describe("고객 화면 쉬운 수정", () => {
  const days = () => [day(1, [it0("a", "A"), it0("b", "B", "sightseeing", 60, 40), it0("c", "C", "sightseeing", 60, 0), it0("h", "호텔", "hotel", 0, 0)]), day(2, [it0("d", "D"), it0("h2", "호텔2", "hotel", 0, 0)])];
  it("빼기 — 앞 장소가 이동을 이어받는다", () => {
    const out = removeItem(days(), "b");
    expect(names(out[0])).toEqual(["A", "C", "호텔"]);
    expect(out[0].items[0].travelMinutesToNext).toBe(40);
  });
  it("다른 날로 — 숙박 줄 앞에", () => {
    expect(names(moveItem(days(), "a", 2)[1])).toEqual(["D", "A", "호텔2"]);
  });
  it("다른 곳으로 — 이름 바꾸고 좌표는 지움", () => {
    const out = swapItem([day(1, [{ ...it0("a", "A"), lat: 1, lng: 2 }])], "a", "Z");
    expect(out[0].items[0]).toMatchObject({ name: "Z", lat: undefined });
  });
  it("이 날 가볍게 — 마지막 관광 빼고 10:00 출발", () => {
    const out = lightenDay(days(), 1);
    expect(names(out[0])).toEqual(["A", "B", "호텔"]);
    expect(out[0].meetingTime).toBe("10:00");
  });
  it("시각·요약", () => {
    const d = { ...days()[0], meetingTime: "09:00" };
    expect(dayTimes(d).get("a")).toBe("09:00");
    expect(planSummary(days())).toMatchObject({ nights: [{ city: "후쿠오카", nights: 2 }], tours: 4 });
  });
  it("도시 사이 교통 — 거리에 따라 기차·항공 후보", () => {
    const near = transportOptions({ lat: 33.59, lng: 130.4 }, { lat: 33.26, lng: 131.36 });
    expect(near.options.map((o) => o.mode)).toEqual(expect.arrayContaining(["car", "bus", "train"]));
    expect(near.options.some((o) => o.mode === "flight")).toBe(false);
    const far = transportOptions({ lat: 33.59, lng: 130.4 }, { lat: 35.68, lng: 139.76 });
    expect(far.options.some((o) => o.mode === "flight")).toBe(true);
  });
});

describe("다음 날 출발 전 기사 휴식", () => {
  it("일본: 전날 23시 끝 → 다음 날 08:00 출발이면 휴식 9시간 미만으로 경고", () => {
    const late = day(1, [it0("a", "A", "sightseeing", 600, 30), it0("b", "B", "sightseeing", 300, 0), it0("h", "호텔", "hotel", 0, 0)], "오사카", { meetingTime: "08:00" });
    const next = day(2, [it0("c", "C")], "오사카", { meetingTime: "08:00" });
    const g = restGaps([late, next], {}, "japan");
    expect(g[0].day).toBe(2);
    expect(g[0].rest).toBeLessThan(9 * 60);
    expect(restGaps([late, next], {}, "sea")).toEqual([]);
  });
});
