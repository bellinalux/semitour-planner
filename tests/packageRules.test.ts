import { describe, expect, it } from "vitest";
import { dayMeetingTime } from "@/lib/dayLoad";
import { normalizeInput } from "@/lib/inputStorage";
import { dayRuleIssues, isShoppingCenter, packageRules, packageRulesPrompt, regionOf, ruleDayEnd, tripRuleIssues, withRuleMeetings } from "@/lib/packageRules";
import type { TourOption } from "@/types";
import { input, item, linearDay } from "./fixtures";

const sight = (id: string) => item(id, { stayMinutes: 60, travelMinutesToNext: 20 });

describe("패키지 규칙표 — 세 축 조합", () => {
  it("운영 방식 기본값", () => {
    const full = packageRules(input({ operatingModel: "full", productTier: "standard" }));
    expect(full).toMatchObject({ dayStyle: "full", meeting: "08:30", placesPerDay: [4, 6], shoppingMax: 2, options: "reasonable", tipsIncluded: true });
    expect(packageRules(input({ operatingModel: "semi" })).freeShare[0]).toBe(0.2);
    expect(packageRules(input({ operatingModel: "airtel" }))).toMatchObject({ dayStyle: "free", options: "none", shoppingMax: 0 });
    expect(packageRules(input({ operatingModel: "backpack", productTier: "value" }))).toMatchObject({ shoppingMax: 0, minNightsPerHotel: 2, meals: "조식만 포함, 중식·석식은 자유식" });
  });

  it("등급: 프리미엄은 노쇼핑·노옵션·09:00·하루 4곳·2연박, 시그니처는 하루 3곳·09:00 이전 출발 없음", () => {
    const p = packageRules(input({ operatingModel: "full", productTier: "premium" }));
    expect(p).toMatchObject({ shoppingMax: 0, options: "included", meeting: "09:00", placesPerDay: [4, 4], minNightsPerHotel: 2, specialMealsMin: 2 });
    const s = packageRules(input({ operatingModel: "full", productTier: "signature" }));
    expect(s).toMatchObject({ earliestMeeting: "09:00", placesPerDay: [3, 3], signatureItems: true });
    expect(packageRules(input({ operatingModel: "full", productTier: "value" })).shoppingMax).toBeNull();
  });

  it("고객: 시니어는 이동 90분·걷기 3km·하루 3곳, 허니문은 10:00 미팅", () => {
    const senior = packageRules(input({ operatingModel: "full", productTier: "standard", travelType: "senior" }));
    expect(senior).toMatchObject({ meeting: "09:00", maxRideMinutes: 90, walkKmMax: 3, placesPerDay: [3, 3] });
    expect(senior.label).toBe("풀패키지 · 스탠다드 · 시니어");
    expect(packageRules(input({ operatingModel: "semi", travelType: "honeymoon" })).meeting).toBe("10:00");
    expect(packageRules(input({ operatingModel: "full", companions: ["infant"] })).maxRideMinutes).toBe(60);
  });

  it("지역: 동남아 저녁 일정 정상(21:30), 유럽·일본 운전 규정", () => {
    expect(regionOf("방콕, 태국", "overseas")).toBe("sea");
    expect(regionOf("교토", "overseas")).toBe("japan");
    expect(regionOf("로마", "overseas")).toBe("europe");
    expect(regionOf("부산", "domestic")).toBe("korea");
    const bkk = packageRules(input({ destination: "방콕", operatingModel: "full" }));
    expect(bkk).toMatchObject({ dayEnd: "21:30", eveningOk: true });
    expect(bkk.notes.join(" ")).toContain("태국 면허 가이드");
    expect(packageRules(input({ destination: "파리", operatingModel: "full" })).driving).toMatchObject({ continuous: 270, rest: 45, daily: 540 });
  });

  it("AI 지시문에 규칙이 들어간다", () => {
    const text = packageRulesPrompt(packageRules(input({ destination: "다낭", operatingModel: "full", productTier: "premium" })));
    expect(text).toContain("<package_rules>");
    expect(text).toContain("쇼핑센터 방문 없음(노쇼핑)");
    expect(text).toContain("오전 미팅 09:00");
    expect(text).toContain("한 숙소 2연박 이상");
  });

  it("예전 저장값은 여행 유형으로 운영 방식을 정한다", () => {
    expect(normalizeInput({ travelType: "senior" })).toMatchObject({ operatingModel: "full", productTier: "standard" });
    expect(normalizeInput({ travelType: "semi" }).operatingModel).toBe("semi");
  });
});

describe("규칙 점검", () => {
  const prem = packageRules(input({ destination: "다낭", operatingModel: "full", productTier: "premium", travelType: "senior" }));

  it("그날: 장소 수·한 번 이동·쇼핑 하루 1회·첫날 쇼핑", () => {
    const days = [
      linearDay(1, [sight("a"), item("shop", { type: "shopping", name: "라텍스 쇼핑센터" })]),
      linearDay(2, [sight("b"), sight("c"), sight("d"), sight("e"), item("long", { type: "transfer", name: "호이안 이동", stayMinutes: 0, travelMinutesToNext: 150 }), item("s1", { type: "shopping", name: "침향 쇼핑센터" }), item("s2", { type: "shopping", name: "커피 쇼핑센터" })]),
    ];
    const d1 = dayRuleIssues(days, 0, {}, prem);
    expect(d1.join(" ")).toContain("첫날 쇼핑센터");
    const d2 = dayRuleIssues(days, 1, {}, prem).join(" ");
    expect(d2).toContain("하루 6곳");
    expect(d2).toContain("한 번 이동 150분 — 기준 90분 이내");
    expect(d2).toContain("쇼핑센터 하루 2회");
  });

  it("시장·야시장은 쇼핑센터가 아니다", () => {
    expect(isShoppingCenter(item("m", { type: "shopping", name: "한 시장" }))).toBe(false);
    expect(isShoppingCenter(item("m", { type: "shopping", name: "아시아티크 야시장" }))).toBe(false);
    expect(isShoppingCenter(item("m", { type: "shopping", name: "보석 쇼핑센터" }))).toBe(true);
  });

  it("동남아는 야시장으로 21:00에 끝나도 늦은 종료가 아니다", () => {
    const night = linearDay(2, [item("a", { stayMinutes: 600, travelMinutesToNext: 20 }), item("n", { name: "파타야 야시장", stayMinutes: 60 })], { meetingTime: "09:00" });
    const bkk = packageRules(input({ destination: "파타야", operatingModel: "full" }));
    expect(ruleDayEnd(night, {}, bkk)?.isLate).toBe(false);
    const paris = packageRules(input({ destination: "파리", operatingModel: "full" }));
    expect(ruleDayEnd(linearDay(2, [item("a", { stayMinutes: 720 })], { meetingTime: "09:00" }), {}, paris)?.isLate).toBe(true);
  });

  it("상품 전체: 쇼핑·노옵션·대체일정·노팁·특식·연박·미팅", () => {
    const opt = (patch: Partial<TourOption>) => ({ id: "o", name: "야간 투어", description: "", dayNo: 2, durationMinutes: 90, costPerPerson: 1, pricePerPerson: 30000, minParticipants: 2, participationRate: 50, note: "", ...patch }) as TourOption;
    const days = [
      linearDay(1, [sight("a")], { overnightCity: "다낭" }),
      linearDay(2, [sight("b"), item("shop", { type: "shopping", name: "보석 쇼핑센터" })], { overnightCity: "호이안", meetingTime: "08:00" }),
      linearDay(3, [sight("c")], { overnightCity: "다낭" }),
      linearDay(4, [sight("d")], { overnightCity: "다낭" }),
    ];
    const issues = tripRuleIssues(input({ nights: 3, tipPerPerson: 0, options: [opt({ alternative: "차량 대기" })] }), days, {}, prem);
    const keys = issues.map((i) => i.key);
    expect(keys).toEqual(expect.arrayContaining(["meeting", "shopping", "options-included", "options-alt", "tips", "special-meals", "nights"]));
    expect(issues.find((i) => i.key === "meeting")?.meetingDays).toContain(2);
  });

  it("AI 일정에 규칙 미팅 시각 — 항공일·오전 자유·늦은 출발은 그대로", () => {
    const days = [
      linearDay(1, [item("f", { type: "flight" }), sight("a")]),
      linearDay(2, [sight("b")]),
      linearDay(3, [item("free", { type: "free_time", travelMinutesToNext: 20 }), item("l", { type: "meal", name: "점심 식사" })]),
      linearDay(4, [sight("c")], { rest: "late", meetingTime: "13:00" }),
    ];
    const next = withRuleMeetings(days, prem);
    expect(next.map((d) => d.meetingTime)).toEqual([undefined, "09:00", undefined, "13:00"]);
    expect(dayMeetingTime(next[2])).toBe("11:10");
  });
});

describe("규칙대로 정리", () => {
  it("미팅·긴 이동 휴게소·노쇼핑·구성 정리를 한 번에, 나머지는 남은 확인으로", async () => {
    const { applyPackageRules } = await import("@/lib/packageRules");
    const r = packageRules(input({ destination: "다낭", operatingModel: "full", productTier: "premium", travelType: "senior" }));
    const days = [
      linearDay(1, [item("f", { type: "flight" }), sight("a")]),
      linearDay(2, [item("bf", { type: "meal", name: "호텔 조식" }), item("mv", { type: "transfer", name: "호이안으로 이동", stayMinutes: 150 }), sight("b"), item("shop", { type: "shopping", name: "침향 쇼핑센터" })], { meetingTime: "08:00" }),
      linearDay(3, [sight("c")]),
    ];
    const res = applyPackageRules(days, {}, r, input({ nights: 2, tipPerPerson: 10, options: [] }));
    const d2 = res.days[1];
    expect(d2.meetingTime).toBe("09:00");
    expect(d2.items.map((i) => i.id)).toEqual(["mv", "mv-rest", "mv-2", "b"]);
    expect(d2.items[0]).toMatchObject({ stayMinutes: 75 });
    expect(res.changes.join(" ")).toContain("노쇼핑 등급");
    expect(res.changes.join(" ")).toContain("휴게소 정차");
    expect(res.left.join(" ")).toContain("특식");
  });

  it("쇼핑센터는 첫날·출국일·하루 2회를 피해 다른 날로", async () => {
    const { applyPackageRules } = await import("@/lib/packageRules");
    const r = packageRules(input({ destination: "다낭", operatingModel: "full", productTier: "value" }));
    const days = [
      linearDay(1, [sight("a"), item("s1", { type: "shopping", name: "라텍스 쇼핑센터" })]),
      linearDay(2, [sight("b"), item("s2", { type: "shopping", name: "커피 쇼핑센터" }), item("s3", { type: "shopping", name: "잡화 쇼핑센터" })]),
      linearDay(3, [sight("c"), item("h", { type: "hotel", name: "호텔 투숙", stayMinutes: 0 })]),
      linearDay(4, [sight("d")]),
    ];
    const res = applyPackageRules(days, {}, r, input({ nights: 3, tipPerPerson: 0, options: [] }));
    const where = (id: string) => res.days.find((d) => d.items.some((i) => i.id === id))?.day;
    expect([where("s1"), where("s2"), where("s3")].sort()).toEqual([2, 3, 4]);
    expect(res.days[2].items.at(-1)?.id).toBe("h");
  });
});
