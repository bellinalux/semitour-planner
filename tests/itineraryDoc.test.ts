import { describe, expect, it } from "vitest";
import { calculateQuote } from "@/lib/cost";
import { conditionTags, dayRegion, defaultAlternative, docRows, isFreeDay, mealLabel, shoppingStops, shortDescription, showsTime, stayText, visitStyle } from "@/lib/itineraryDoc";
import { input, item, linearDay } from "./fixtures";

describe("일정표 표기", () => {
  it("관광 방식: 입장 / 하차 / 차창", () => {
    expect(visitStyle(item("a", { admission: "enter" }))).toBe("입장");
    expect(visitStyle(item("b", { admission: "view_only", stayMinutes: 30 }))).toBe("하차");
    expect(visitStyle(item("c", { admission: "view_only", stayMinutes: 5 }))).toBe("차창");
    expect(visitStyle(item("d", { type: "meal", admission: "none" }))).toBe("");
  });

  it("시각은 첫 항목·항공·점심/저녁·공연만, 소요는 관광에만", () => {
    expect(showsTime(item("a"), 0)).toBe(true);
    expect(showsTime(item("b"), 2)).toBe(false);
    expect(showsTime(item("c", { type: "meal", name: "점심 딤섬" }), 3)).toBe(true);
    expect(showsTime(item("d", { name: "분수쇼 관람" }), 4)).toBe(true);
    expect(stayText(item("e", { stayMinutes: 90 }))).toBe("약 1시간 30분");
    expect(stayText(item("f", { type: "meal", stayMinutes: 60 }))).toBe("");
    expect(stayText(item("g", { type: "hotel", stayMinutes: 60 }))).toBe("");
  });

  it("설명은 첫 문장 한 줄", () => {
    expect(shortDescription("포르투갈풍 광장입니다. 분수와 물결무늬 바닥이 유명합니다.")).toBe("포르투갈풍 광장입니다.");
    expect(shortDescription("가".repeat(100)).length).toBe(69);
  });

  it("이동은 연결 줄로 (5분 미만·항공 뒤는 생략, 이동 항목이 따로 있으면 그 줄 하나로)", () => {
    const rows = docRows(
      [
        item("f", { type: "flight", name: "마카오 도착", travelMinutesToNext: 30 }),
        item("a", { name: "세나도 광장", travelMinutesToNext: 3 }),
        item("b", { name: "성바울 성당", travelMinutesToNext: 30 }),
        item("t", { type: "transfer", name: "호텔로 이동", stayMinutes: 0, travelMinutesToNext: 20 }),
        item("h", { type: "hotel", name: "호텔 투숙", stayMinutes: 0, travelMinutesToNext: null }),
      ],
      true,
    );
    expect(rows.map((r) => (r.kind === "move" ? `→${r.text}` : r.item!.id))).toEqual(["f", "a", "b", "→호텔로 이동 (약 20분)", "h"]);
  });

  it("식사: 호텔식·현지식(메뉴)·특식·자유식·기내식", () => {
    expect(mealLabel({ mark: "호텔식", cuisine: "" }, "breakfast", false, true)).toBe("호텔식");
    expect(mealLabel({ mark: "포함", cuisine: "딤섬" }, "lunch", false, true)).toBe("현지식(딤섬)");
    expect(mealLabel({ mark: "포함", cuisine: "랍스터" }, "dinner", false, true)).toBe("특식(랍스터)");
    expect(mealLabel({ mark: "불포함", cuisine: "" }, "dinner", false, true)).toBe("자유식");
    expect(mealLabel({ mark: "불포함", cuisine: "" }, "lunch", true, true)).toBe("기내식 또는 자유식");
    expect(mealLabel({ mark: "불포함", cuisine: "" }, "breakfast", false, true)).toBe("—");
    expect(mealLabel({ mark: "현지 지불", cuisine: "" }, "lunch", false, true)).toBe("현지식 · 현지 지불");
  });

  it("쇼핑·자유일·지역·선택관광 미참여 문구", () => {
    const days = [
      linearDay(1, [item("f", { type: "flight", name: "마카오 도착" }), item("s", { type: "shopping", name: "라텍스 매장", description: "라텍스 베개·매트리스. 단체 방문.", stayMinutes: 60 })], { overnightCity: "마카오" }),
      linearDay(2, [item("free", { type: "free_time", name: "자유시간", stayMinutes: 480, description: "코타이 리조트 산책 추천" }), item("h", { type: "hotel", name: "호텔" })], { overnightCity: "마카오" }),
      linearDay(3, [item("f2", { type: "flight", name: "인천 도착" })]),
    ];
    expect(shoppingStops(days, {})).toEqual([{ day: 1, name: "라텍스 매장", goods: "라텍스 베개·매트리스.", minutes: 60 }]);
    expect(isFreeDay(days[1], {})).toBe(true);
    expect(isFreeDay(days[0], {})).toBe(false);
    expect(dayRegion(days, 0, "인천")).toBe("인천 → 마카오");
    expect(dayRegion(days, 1, "인천")).toBe("마카오");
    expect(dayRegion(days, 2, "")).toBe("마카오 → 인천");
    expect(defaultAlternative({ dayNo: 2, durationMinutes: 120 })).toContain("약 2시간 자유시간 후 합류");
  });

  it("조건 표식: 노쇼핑·노옵션·가이드 경비·식사 횟수·호텔 등급·전용차량", () => {
    const days = [linearDay(1, [item("a"), item("m", { type: "meal", name: "점심", mealCost: 10000 })], { overnightCity: "다낭" }), linearDay(2, [item("b")])];
    const i = input({ packageType: "land_hotel", lodgingType: "hotel", hotelGrade: "4", lodgingRatePerNight: 100000, nights: 1, days: 2, tipPerPerson: 20000, vehicleCostPerDay: 100000 });
    const q = calculateQuote(i, days, {});
    if (!q.ok) throw new Error(q.error);
    const tags = conditionTags(i, days, {}, null, q);
    expect(tags).toEqual(expect.arrayContaining(["노쇼핑", "노옵션", "가이드 경비 포함 (노팁)", "식사 1회 포함", "4성급", "전용차량"]));
  });
});

describe("호텔 미팅 → 첫 장소 이동", () => {
  it("둘째 날부터 첫 항목이 관광지면 30분, 첫날·항공·호텔 미팅 항목이면 0, 직접 넣은 값이 먼저", async () => {
    const { dayTourStart, hotelLeadMinutes, calcDayLoad } = await import("@/lib/dayLoad");
    const d2 = linearDay(2, [item("a", { name: "콜로안 빌리지", stayMinutes: 60, travelMinutesToNext: 0 })], { meetingTime: "08:30" });
    expect(hotelLeadMinutes(d2)).toBe(30);
    expect(dayTourStart(d2)).toBe("09:00");
    expect(calcDayLoad(d2, {}).travelMinutes).toBe(30);
    expect(hotelLeadMinutes(linearDay(1, [item("a")]))).toBe(0);
    expect(hotelLeadMinutes(linearDay(2, [item("f", { type: "flight", name: "공항 출발" })]))).toBe(0);
    expect(hotelLeadMinutes(linearDay(2, [item("m", { name: "호텔 로비 미팅" })]))).toBe(0);
    expect(dayTourStart({ ...d2, hotelLeadMinutes: 45 })).toBe("09:15");
    expect(hotelLeadMinutes({ ...d2, hotelLeadMinutes: 0 })).toBe(0);
  });

  it("일정표 표: 미팅 줄(미팅 시각) → 이동 줄 → 첫 장소(미팅 + 이동 시각)", async () => {
    const { computeItemTimings, dayTourStart } = await import("@/lib/dayLoad");
    const { dayTable } = await import("@/lib/itineraryDoc");
    const days = [linearDay(1, [item("x")], { overnightCity: "마카오" }), linearDay(2, [item("a", { name: "콜로안 빌리지", stayMinutes: 60 }), item("b", { name: "점심", type: "meal" })], { meetingTime: "08:30" })];
    const t = dayTable(days, 1, {}, { vehicle: true, flight: { out: "", back: "" }, selectedHotels: {} }, computeItemTimings(days[1].items, dayTourStart(days[1])));
    expect(t.rows.slice(0, 3).map((r) => [r.kind, r.start, r.minutes ?? null])).toEqual([
      ["meeting", "08:30", null],
      ["move", "", 30],
      ["item", "09:00", null],
    ]);
    expect(t.rows[0].transport).toBe("vehicle");
    expect(t.rows[2].keyTime).toBe(true);
  });
});
