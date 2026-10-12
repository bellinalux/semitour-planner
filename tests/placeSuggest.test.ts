import { describe, expect, it } from "vitest";
import type { PlaceCard } from "@/lib/knowledge";
import { favoriteSuggestions, knowledgeSuggestions, matchPlaces, tripSuggestions } from "@/lib/placeSuggest";
import type { CourseSegment } from "@/lib/segmentLibrary";
import { item, linearDay } from "./fixtures";

const card = (name: string, patch: Partial<PlaceCard> = {}): PlaceCard => ({
  key: name,
  name,
  area: "",
  kind: "sight",
  popularity: 50,
  seen: 1,
  agencies: [],
  fits: [],
  likes: [],
  dislikes: [],
  tips: [],
  stayWeb: 0,
  fieldNotes: [],
  sources: [],
  verified: false,
  updatedAt: "",
  ...patch,
});

const fav = (name: string, patch = {}): CourseSegment => ({ id: name, name, destination: "다낭", kind: "place", items: [item(name, { name, stayMinutes: 50, entryFee: 30000, ...patch })], savedAt: "" });

describe("장소 후보 (사이에 넣기 자동완성)", () => {
  it("지식 창고: 유형·체류(현장 잰 값 → 웹 보통 체류)를 채우고 금액은 비운다", () => {
    const [night, meal] = knowledgeSuggestions([card("용다리 불쇼", { kind: "night", area: "한강", stayWeb: 30, stayField: { avg: 40, n: 3 } }), card("마담 란", { kind: "meal" })]);
    expect(night.item).toMatchObject({ type: "sightseeing", stayMinutes: 40, entryFee: 0, isEstimated: true });
    expect(night.sub).toBe("한강 · 40분 · 야간");
    expect(meal.item).toMatchObject({ type: "meal", admission: "none", stayMinutes: 60 });
  });

  it("즐겨찾기·이 일정: 저장한 항목을 그대로(금액까지), 장소가 아닌 것은 빼고 같은 이름은 한 번만", () => {
    expect(favoriteSuggestions([fav("바나힐"), { ...fav("하루"), kind: "day" }]).map((s) => s.name)).toEqual(["바나힐"]);
    expect(favoriteSuggestions([fav("바나힐")])[0].item).toMatchObject({ name: "바나힐", entryFee: 30000, stayMinutes: 50 });
    const days = [linearDay(1, [item("a", { name: "한 시장" }), item("f", { name: "자유시간", type: "free_time" })]), linearDay(2, [item("b", { name: "한 시장" }), item("c", { name: "오행산" })])];
    expect(tripSuggestions(days).map((s) => `${s.name}/${s.sub.split(" · ")[0]}`)).toEqual(["한 시장/DAY 1", "오행산/DAY 2"]);
  });

  it("찾기: 앞부분이 맞는 것 먼저, 같은 이름은 즐겨찾기 우선, 지식 창고는 인기순", () => {
    const list = [
      ...tripSuggestions([linearDay(1, [item("x", { name: "바나힐 골든브릿지" })])]),
      ...knowledgeSuggestions([card("썬월드 바나힐", { popularity: 90 }), card("바나힐", { popularity: 10 }), card("바나힐 케이블카", { popularity: 80 })]),
      ...favoriteSuggestions([fav("바나힐")]),
    ];
    const hits = matchPlaces("바나", list);
    expect(hits.map((h) => `${h.name}:${h.source}`)).toEqual(["바나힐:fav", "바나힐 케이블카:know", "바나힐 골든브릿지:trip", "썬월드 바나힐:know"]);
    expect(matchPlaces("  ", list)).toEqual([]);
    expect(matchPlaces("바나 힐", list)[0].name).toBe("바나힐");
  });
});
