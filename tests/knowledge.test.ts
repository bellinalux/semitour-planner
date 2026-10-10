import { describe, expect, it } from "vitest";
import { fieldStays } from "@/lib/guideSheet";
import {
  bestStay,
  citiesOf,
  coursePlaces,
  emptyCity,
  findPlace,
  isStale,
  knowledgeKey,
  knowledgeMemo,
  learnCompetitor,
  learnEdits,
  learnFieldNotes,
  learnSale,
  learnStays,
  learnVotes,
  mergeResearch,
  placeScore,
  reasonFor,
  type ResearchResult,
} from "@/lib/knowledge";
import { needsCheck } from "@/lib/needsCheck";
import { annotateReasons, tripCities } from "@/lib/server/knowledgeForTrip";
import { item, linearDay } from "./fixtures";

const place = (name: string, popularity: number, patch: Partial<ResearchResult["places"][number]> = {}): ResearchResult["places"][number] => ({
  name,
  area: "",
  kind: "sight",
  popularity,
  agencies: [],
  fits: [],
  likes: [],
  dislikes: [],
  tips: [],
  stayMinutes: 60,
  ...patch,
});
const research = (places: ResearchResult["places"], extra: Partial<ResearchResult> = {}): ResearchResult => ({ places, courses: [], needs: [], ...extra });
const src = [{ title: "블로그", url: "https://example.com/a" }];

describe("이름·도시", () => {
  it("괄호 병기·띄어쓰기가 달라도 같은 장소", () => {
    expect(knowledgeKey("바나힐 (Ba Na Hills)")).toBe(knowledgeKey("바나힐"));
    expect(citiesOf("다낭, 호이안")).toEqual(["다낭", "호이안"]);
    const d = mergeResearch(emptyCity("다낭"), research([place("바나힐 & 골든브릿지", 90), place("한 시장", 50), place("한강 유람선", 50)]), src);
    expect(findPlace(d, "썬월드 바나힐 케이블카 & 골든 브릿지 (Sun World Ba Na Hills)")?.name).toBe("바나힐 & 골든브릿지");
    expect(findPlace(d, "시장")).toBeUndefined();
    expect(findPlace(d, "호이안 올드타운")).toBeUndefined();
    expect(tripCities("이탈리아", "로마 2일, 피렌체 2일")).toEqual(["로마", "피렌체"]);
  });
});

describe("웹 조사 합치기", () => {
  it("새 장소를 넣고, 다시 조사하면 인기는 평균·여행사는 더한다", () => {
    let d = mergeResearch(emptyCity("다낭"), research([place("바나힐", 90, { agencies: ["하나투어"], likes: ["골든브릿지 사진"] }), place("오행산", 60)]), src);
    expect(d.places.map((p) => p.name)).toEqual(["바나힐", "오행산"]);
    expect(d.researchCount).toBe(1);
    d = mergeResearch(d, research([place("바나힐 (Ba Na Hills)", 70, { agencies: ["모두투어"] })]), src);
    const b = findPlace(d, "바나힐")!;
    expect(b).toMatchObject({ popularity: 80, seen: 2, agencies: ["하나투어", "모두투어"] });
    expect(isStale(d)).toBe(false);
    expect(isStale(emptyCity("x"))).toBe(true);
  });

  it("직원이 확인한 장소는 내용을 덮어쓰지 않는다", () => {
    let d = mergeResearch(emptyCity("다낭"), research([place("오행산", 60, { likes: ["전망"], stayMinutes: 60 })]), src);
    d = { ...d, places: d.places.map((p) => ({ ...p, verified: true, stayWeb: 90 })) };
    d = mergeResearch(d, research([place("오행산", 60, { likes: ["다른 말"], stayMinutes: 30 })]), src);
    expect(findPlace(d, "오행산")).toMatchObject({ stayWeb: 90, likes: ["전망"], verified: true });
  });
});

describe("우리 자료로 배우기", () => {
  const base = () => mergeResearch(emptyCity("다낭"), research([place("바나힐", 50), place("오행산", 50), place("쇼핑센터", 50)]), src);

  it("고객 추천·성약·직원 수정이 점수를 바꾼다", () => {
    let d = learnVotes(base(), ["바나힐"], ["쇼핑센터"]);
    d = learnSale(d, ["바나힐", "오행산"], true);
    d = learnEdits(d, ["쇼핑센터"], ["미케 비치"]);
    const s = (n: string) => placeScore(findPlace(d, n)!);
    expect(s("바나힐")).toBeGreaterThan(s("오행산"));
    expect(s("오행산")).toBeGreaterThan(s("쇼핑센터"));
    expect(s("쇼핑센터")).toBeLessThan(20);
    // 처음 알게 된 곳도 카드가 생긴다
    expect(findPlace(d, "미케 비치")?.edits).toEqual({ removed: 0, added: 1 });
    expect(d.learnedCount).toBe(3);
    expect(reasonFor(findPlace(d, "바나힐")!, 0)).toBe("인기 1위 · 우리 고객 추천 1 · 성약 1건");
  });

  it("현장 실측은 3번 이상이면 코스에 쓴다", () => {
    let d = base();
    d = learnStays(d, [{ name: "바나힐", minutes: 200 }]);
    expect(bestStay(findPlace(d, "바나힐")!)).toBe(60);
    d = learnStays(d, [{ name: "바나힐", minutes: 220 }, { name: "바나힐", minutes: 240 }, { name: "x", minutes: 5 }]);
    expect(findPlace(d, "바나힐")!.stayField).toEqual({ avg: 220, n: 3 });
    expect(bestStay(findPlace(d, "바나힐")!)).toBe(220);
  });

  it("다른 여행사 일정·현장 기록", () => {
    let d = learnCompetitor(base(), "노랑풍선", "다낭 4일", [["바나힐", "골든브릿지"], ["오행산"]]);
    expect(findPlace(d, "바나힐")!.agencies).toEqual(["노랑풍선"]);
    expect(d.courses[0]).toMatchObject({ places: ["바나힐", "골든브릿지"], agencies: ["노랑풍선"] });
    d = learnFieldNotes(d, [{ at: "2026-11-11T05:00:00Z", day: 2, type: "지연", text: "바나힐 케이블카 대기 1시간" }]);
    expect(findPlace(d, "바나힐")!.fieldNotes[0]).toBe("지연: 바나힐 케이블카 대기 1시간");
    expect(d.fieldNotes).toHaveLength(1);
  });

  it("지식 메모 — 점수순, 동반자에 맞는 곳 먼저, 나쁜 곳은 빼라고", () => {
    let d = mergeResearch(emptyCity("다낭"), research([place("바나힐", 90), place("아쿠아리움", 40, { fits: ["kids"] })], { needs: [{ segment: "kids", likes: ["체험"], avoid: ["긴 이동"], tips: [] }] }), src);
    d = learnVotes(d, [], ["바나힐", "바나힐"]);
    d = learnEdits(d, ["바나힐", "바나힐", "바나힐", "바나힐", "바나힐"], []);
    const memo = knowledgeMemo([d], ["kids"]);
    expect(memo.indexOf("아쿠아리움")).toBeLessThan(memo.indexOf("바나힐"));
    expect(memo).toContain("되도록 빼기): 바나힐");
    expect(memo).toContain("kids 니즈 — 좋아함: 체험");
  });
});

describe("일정에 근거 붙이기", () => {
  it("창고에 있는 장소만 근거가 붙는다", () => {
    const d = mergeResearch(emptyCity("다낭"), research([place("바나힐", 90, { agencies: ["하나투어"] })]), src);
    const days = annotateReasons([linearDay(1, [item("a", { name: "바나힐 (Ba Na Hills)" }), item("b", { name: "모르는 곳" })])], [d]);
    expect(days[0].items[0].reason).toBe("인기 1위 · 여행사 1곳 포함");
    expect(days[0].items[1].reason).toBeUndefined();
    expect(coursePlaces(days, {})).toEqual(["바나힐 (Ba Na Hills)", "모르는 곳"]);
  });
});

describe("현장 실측 (가이드 체크)", () => {
  it("체크 시각 사이에서 이동 시간을 빼서 잰다", () => {
    const sheet = {
      days: [
        {
          day: 1,
          date: "",
          region: "",
          meeting: "08:00",
          meals: "",
          hotel: "",
          warnings: [],
          options: [],
          rows: [
            { key: "a", time: "", title: "한 시장 [입장]", move: false, notes: [] },
            { key: "m", time: "", title: "↓ 전용차량 30분", move: true, notes: [] },
            { key: "b", time: "", title: "바나힐 [입장]", move: false, notes: [] },
            { key: "c", time: "", title: "오행산", move: false, notes: [] },
          ],
        },
      ],
    };
    const t = (hm: string) => `2026-11-10T${hm}:00Z`;
    expect(fieldStays(sheet, { progress: { "1:a": t("09:00"), "1:b": t("12:30"), "1:c": t("12:35") } })).toEqual([{ name: "바나힐", minutes: 180 }]);
  });
});

describe("고객 니즈 점검", () => {
  const days = [linearDay(1, [item("a", { name: "바나힐" }), item("b", { name: "롯데마트 쇼핑", type: "shopping" })]), linearDay(2, [item("c", { name: "린응사 계단 산책" })])];
  it("꼭 넣을 것·피할 것·동반자", () => {
    const r = needsCheck({ mustHave: "바나힐, 야시장", avoid: "쇼핑", companions: ["senior", "kids", "couple"] }, days, {});
    const texts = r.map((x) => `${x.tone}:${x.text}`);
    expect(texts).toContain('ok:꼭 넣을 것 "바나힐" — 들어 있습니다');
    expect(texts).toContain('warn:꼭 넣을 것 "야시장"이(가) 일정에 없습니다');
    expect(texts.some((t) => t.startsWith('warn:피할 것 "쇼핑" — DAY 1 롯데마트 쇼핑'))).toBe(true);
    expect(texts.some((t) => t.startsWith("warn:시니어 동반인데 계단"))).toBe(true);
    expect(texts.some((t) => t.startsWith("warn:아이가 즐길 곳"))).toBe(true);
    expect(texts).toContain("info:커플·신혼 동반인데 야경·일몰 일정이 없습니다");
  });
});
