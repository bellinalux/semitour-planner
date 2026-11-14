import { describe, expect, it } from "vitest";
import {
  airportOf,
  applyCourseFix,
  applyGroupBuffer,
  courseChecks,
  courseStructure,
  dutyMinutes,
  fitStayStandard,
  groupBufferMinutes,
  lastNightToAirportKm,
  overnightBacktrack,
  staySourceLabel,
  stayStandard,
  structureCompare,
  textStructure,
  toursAfterRyokan,
} from "@/lib/courseStandards";
import { rushAdjusted } from "@/lib/courseEngine/schedule";
import { lccMealNote } from "@/lib/itineraryDoc";
import { splitIntoDays, timelineToDay } from "@/lib/placeCart";
import { buildPackageFormatText } from "@/lib/exportPackage";
import { bestStay, learnAgencyStays, type CityKnowledge } from "@/lib/knowledge";
import type { DayPlan, ItineraryItem } from "@/types";
import { input } from "./fixtures";

const it0 = (id: string, name: string, type: ItineraryItem["type"], stay = 60, travel: number | null = 20, extra: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id, name, type, description: "", stayMinutes: stay, travelMinutesToNext: travel, entryFee: 0, mealCost: 0, isEstimated: true, admission: "enter", ...extra,
});
const day = (n: number, items: ItineraryItem[], city = "후쿠오카", extra: Partial<DayPlan> = {}): DayPlan => ({ day: n, theme: "", kind: "linear", items, amGuided: [], pmFreeOptions: [], overnightCity: city, ...extra });

describe("① 표준 체류 시간", () => {
  it("종류별 범위", () => {
    expect(stayStandard(it0("a", "후쿠오카 시립 박물관", "sightseeing"))?.key).toBe("museum");
    expect(stayStandard(it0("a", "유니버설 스튜디오 재팬", "experience"))?.key).toBe("themepark");
    expect(stayStandard(it0("a", "구로몬 시장", "sightseeing"))?.key).toBe("market");
    expect(stayStandard(it0("a", "점심", "meal", 60, 0, { mealSlot: "lunch" }))?.key).toBe("meal");
    expect(stayStandard(it0("a", "특식-토리텐나베정식", "meal", 60, 0, { mealSlot: "lunch" }))?.key).toBe("special");
    expect(stayStandard(it0("a", "공항 이동", "transfer"))).toBeNull();
  });
  it("범위를 크게 벗어난 AI 추정만 맞추고, 근거 있는 시간은 그대로", () => {
    const d = [day(1, [it0("a", "유니버설 스튜디오 재팬", "experience", 90), it0("b", "박물관", "sightseeing", 15, 20, { stayEdited: true }), it0("c", "뱃놀이", "experience", 30, 20, { staySource: "competitor" })])];
    const out = fitStayStandard(d, {});
    expect(out[0].items[0]).toMatchObject({ stayMinutes: 240, staySource: "standard" });
    expect(out[0].items[1].stayMinutes).toBe(15);
    expect(out[0].items[2].stayMinutes).toBe(30);
  });
});

describe("② 단체 여유", () => {
  it("15명 10분, 30명 15분, 한 번만 더한다", () => {
    expect([groupBufferMinutes(8), groupBufferMinutes(20), groupBufferMinutes(35)]).toEqual([0, 10, 15]);
    const d = [day(1, [it0("a", "A", "sightseeing", 60, 20), it0("b", "B", "sightseeing", 60, 5), it0("c", "C", "sightseeing", 60, 0)])];
    const once = applyGroupBuffer(d, 10);
    expect(once.count).toBe(1);
    expect(once.days[0].items[0]).toMatchObject({ travelMinutesToNext: 30, groupBuffer: 10 });
    expect(applyGroupBuffer(once.days, 10).count).toBe(0);
  });
  it("점검에 나오고 고치기로 적용", () => {
    const d = [day(1, [it0("a", "A", "sightseeing", 60, 20), it0("b", "B", "sightseeing", 60, 0)])];
    const c = courseChecks(input({ travelers: 20 }), d, {}).find((x) => x.id === "group-buffer")!;
    expect(c.fix?.fix).toEqual({ kind: "group-buffer", minutes: 10 });
    expect(applyCourseFix(c.fix!.fix, d, {})[0].items[0].travelMinutesToNext).toBe(30);
  });
});

describe("⑥ 체류 근거 표시", () => {
  it("직접 입력·웹 확인·업체 표기·표준표·AI 추정", () => {
    expect(staySourceLabel(it0("a", "A", "sightseeing", 60, 0, { stayEdited: true }))?.label).toBe("직접 입력");
    expect(staySourceLabel(it0("a", "A", "sightseeing", 60, 0, { staySource: "competitor" }))?.label).toBe("업체 표기");
    expect(staySourceLabel(it0("a", "A", "sightseeing"))?.label).toBe("AI 추정");
    expect(staySourceLabel(it0("a", "공항", "transfer"))).toBeNull();
  });
});

describe("④ 출퇴근 보정 · ⑦ 기사 구속", () => {
  it("교통을 모르는 시간표면 출퇴근 차량 이동을 1.3배", () => {
    expect(rushAdjusted(30, 8 * 60, { rushHour: true, mode: "car" })).toBe(39);
    expect(rushAdjusted(30, 12 * 60, { rushHour: true, mode: "car" })).toBe(30);
    expect(rushAdjusted(30, 8 * 60, { rushHour: false, mode: "car" })).toBe(30);
    expect(rushAdjusted(30, 8 * 60, { rushHour: true, mode: "walk" })).toBe(30);
  });
  it("일본 전세버스 하루 13시간 넘으면 경고", () => {
    const long = day(1, [it0("a", "A", "sightseeing", 300, 120), it0("b", "B", "sightseeing", 300, 120), it0("c", "C", "sightseeing", 120, 0)], "오사카", { meetingTime: "07:00" });
    expect(dutyMinutes(long, {})).toBeGreaterThan(13 * 60);
    expect(courseChecks(input(), [long, day(2, [], "")], {}, { region: "japan" }).some((c) => c.id === "duty-japan")).toBe(true);
    expect(courseChecks(input(), [long, day(2, [], "")], {}, { region: "sea" }).some((c) => c.id === "duty-japan")).toBe(false);
  });
});

describe("⑩ 한 방향 동선 · ⑯ 료칸", () => {
  it("숙박 도시가 되돌아오면 알린다", () => {
    expect(overnightBacktrack([day(1, [], "오사카"), day(2, [], "교토"), day(3, [], "오사카"), day(4, [], "")])).toMatchObject({ city: "오사카", via: "교토", day: 3 });
    expect(overnightBacktrack([day(1, [], "오사카"), day(2, [], "오사카"), day(3, [], "교토")])).toBeNull();
  });
  it("마지막 밤 숙소와 귀국 공항 거리", () => {
    expect(airportOf("후쿠오카(FUK)")?.name).toBe("후쿠오카 공항");
    const days = [day(1, []), day(2, [it0("y", "유후인", "sightseeing", 60, 0, { lat: 33.263, lng: 131.356 })], "유후인"), day(3, [], "")];
    const f = { returnDepartAirport: "후쿠오카(FUK)" } as never;
    expect(lastNightToAirportKm(days, { selectedFlight: f, selectedHotels: {} })!.km).toBeGreaterThan(80);
  });
  it("장거리 이동 다음 날은 09:00 출발로 고치기", () => {
    const d1 = day(1, [it0("a", "A", "sightseeing", 60, 150), it0("b", "B", "sightseeing", 60, 130), it0("c", "C", "sightseeing", 60, 0)]);
    const d2 = day(2, [it0("d", "D", "sightseeing")], "후쿠오카", { meetingTime: "08:00" });
    const c = courseChecks(input(), [d1, d2, day(3, [], "")], {}).find((x) => x.id === "long-ride-1")!;
    expect(applyCourseFix(c.fix!.fix, [d1, d2], {})[1].meetingTime).toBe("09:00");
  });
  it("료칸 체크인 뒤 관광·다음 날 이른 출발", () => {
    const d = day(1, [it0("a", "유후인", "sightseeing"), it0("h", "츠에타테 온센 호텔 히젠야", "hotel", 0, 0), it0("x", "야경 투어", "sightseeing")], "구마모토");
    expect(toursAfterRyokan(d).map((i) => i.name)).toEqual(["야경 투어"]);
    const checks = courseChecks(input(), [d, day(2, [it0("z", "다자이후", "sightseeing")], "", { meetingTime: "08:00" })], {});
    expect(checks.map((c) => c.id)).toEqual(expect.arrayContaining(["ryokan-after-1", "ryokan-next-2"]));
  });
});

describe("⑫ 기내식 표기", () => {
  it("저비용 항공은 기내식 미제공", () => {
    expect(lccMealNote("제주항공", "7C1405")).toContain("기내식 미제공");
    expect(lccMealNote("", "TW291")).toContain("기내식 미제공");
    expect(lccMealNote("대한항공", "KE787")).toBe("");
    expect(lccMealNote("Thai Airways International", "TG659")).toBe("");
  });
});

describe("⑤ 업체 표기 체류 → 지식 창고", () => {
  it("업체 표기 2건이면 웹 값보다 먼저 쓴다", () => {
    const doc = { city: "후쿠오카", places: [], courses: [], needs: [], learnedCount: 0, updatedAt: "" } as unknown as CityKnowledge;
    const one = learnAgencyStays(doc, [{ name: "야나가와 뱃놀이", minutes: 30 }]);
    const two = learnAgencyStays(one, [{ name: "야나가와 뱃놀이", minutes: 40 }]);
    const p = two.places[0];
    expect(p.stayAgency).toEqual({ avg: 35, n: 2 });
    expect(bestStay({ ...p, stayWeb: 60 })).toBe(35);
    expect(bestStay({ ...one.places[0], stayWeb: 60 })).toBe(60);
  });
});

describe("⑨ 장소 담기 나누기", () => {
  it("가까운 곳끼리 날짜를 나누고, 좌표 없는 곳은 가벼운 날에", () => {
    const P = (id: string, lat: number, lng: number, stay = 60) => ({ id, name: id, lat, lng, stayMin: stay });
    const days = splitIntoDays([P("후쿠오카1", 33.59, 130.4), P("유후인1", 33.26, 131.35), P("후쿠오카2", 33.6, 130.42), P("유후인2", 33.27, 131.36), { id: "모름", name: "모름", stayMin: 60 }], 2);
    expect(days).toHaveLength(2);
    const names = days.map((d) => d.map((p) => p.id).sort().join(","));
    expect(names.some((n) => n.includes("후쿠오카1") && n.includes("후쿠오카2"))).toBe(true);
    expect(names.some((n) => n.includes("유후인1") && n.includes("유후인2"))).toBe(true);
  });
  it("엔진 시간표를 일정 하루로", () => {
    const d = timelineToDay(1, "후쿠오카", "09:00", [
      { id: "a", name: "다자이후", arrive: 540, start: 540, end: 630, travelFromPrev: 0, wait: 0, issues: [] },
      { id: "l", name: "점심 식사", arrive: 660, start: 660, end: 720, travelFromPrev: 30, wait: 0, issues: [] },
    ], new Map([["a", { id: "a", name: "다자이후", stayMin: 90, lat: 33.5, lng: 130.5 }], ["l", { id: "l", name: "점심 식사", stayMin: 60, meal: true }]]));
    expect(d.items.map((i) => [i.type, i.stayMinutes, i.travelMinutesToNext])).toEqual([["sightseeing", 90, 30], ["meal", 60, 0]]);
    expect(d.items[1].mealSlot).toBe("lunch");
  });
});

describe("⑪ 대형사 일정표 형식 · ⑮ 타사 구성", () => {
  it("날짜 요약 + 번호 세부, 구간 이동 소요", () => {
    const days = [
      day(1, [it0("a", "인천 출발", "flight", 0, 85), it0("b", "후쿠오카 도착", "flight", 0, 15), it0("c", "라라포트 후쿠오카", "shopping", 60, 20), it0("d", "석식", "meal", 60, 20, { mealSlot: "dinner" }), it0("h", "힐튼 후쿠오카 시 호크", "hotel", 0, 0)]),
      day(2, [it0("e", "야나가와 뱃놀이", "experience", 30, 90, { staySource: "competitor" }), it0("f", "특식-토리텐나베정식", "meal", 60, 30, { mealSlot: "lunch" }), it0("g", "가마도 지옥", "sightseeing", 40, 0)], "구마모토"),
    ];
    const text = buildPackageFormatText({ input: input({ departureDate: "2026-12-09", originCity: "인천" }), days, pmChoice: {} });
    expect(text).toContain("1일차 2026.12.09.(수)");
    expect(text).toContain("* 힐튼 후쿠오카 시 호크");
    expect(text).toContain("[먹거리] - 특식-토리텐나베정식");
    expect(text).toContain("야나가와 뱃놀이 (약 30분 소요)");
    expect(text).toMatch(/\[.*-가마도 지옥 이동 : 약 30분 소요\]/);
    expect(text).toContain("점심 특식-토리텐나베정식");
  });
  it("원문에서 구성 숫자, 타사 평균과 비교", () => {
    const s = textStructure("제1일\n[관광지] - 라라포트\n[관광지] - 모모치\n제2일\n[후쿠오카-야나가와 이동 : 약 1시간30분 소요]\n[관광지] - 야나가와\n[먹거리] - 특식-토리텐나베정식\n제3일\n[관광지] - 다자이후", { days: 3, shopping: 1 });
    expect(s).toMatchObject({ placesPerDay: 2, ridePerDay: 45, specialMeals: 1, shopping: 1 });
    const ours = courseStructure([day(1, [it0("a", "A", "sightseeing", 60, 30), it0("b", "B", "sightseeing", 60, 0)])], {});
    const cmp = structureCompare(ours, [s])!;
    expect(cmp.line).toContain("타사 평균(1개): 하루 2곳");
    expect(cmp.ours).toContain("우리: 하루 2곳");
  });
});
