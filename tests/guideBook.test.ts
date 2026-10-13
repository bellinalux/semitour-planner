import { describe, expect, it } from "vitest";
import {
  DEFAULT_BASICS,
  emptyKit,
  englishFrom,
  explainMinutes,
  findScript,
  gatherMinutes,
  guideScriptSchema,
  mergeKit,
  scriptFromDraft,
  scriptIn,
  scriptQuality,
  scriptText,
  speakSeconds,
  stayBreakdown,
  stopText,
  stripCues,
  tripPlacesByCity,
  upsertScript,
  withDefaultBasics,
  type GuideScript,
} from "@/lib/guideBook";
import { attachGuide, type GuideSheet } from "@/lib/guideSheet";
import { item, linearDay } from "./fixtures";

const script = (name: string, patch: Partial<GuideScript> = {}): GuideScript =>
  guideScriptSchema.parse({ key: name.replace(/\s/g, ""), city: "방콕", name, intro: "가".repeat(50), points: [{ title: "1", text: "나".repeat(200) }, { title: "2", text: "다".repeat(200), more: "라".repeat(250) }, { title: "3", text: "마".repeat(100) }], ...patch });

describe("가이드 해설집 — 말하는 시간·체류 구성", () => {
  it("1분에 250자 (띄어쓰기 빼고), 연출 표시는 빼고 센다", () => {
    expect(speakSeconds("가".repeat(250))).toBe(60);
    expect(speakSeconds("가 나 다")).toBe(1);
    expect(speakSeconds(`[잠시 멈춤] ${"가".repeat(250)} [손으로 가리키며]`)).toBe(60);
    expect(stripCues("자, [웃으며] 보세요")).toBe("자,   보세요");
  });

  it("지점 한 곳: 짧게 = 도입·관찰, 기본 = + 이야기·의미·비교·질문·연결, 자세히 = + 더 깊은 이야기", () => {
    const stop = { title: "정문", hook: "도입", look: "관찰", text: "이야기", meaning: "의미", korea: "비교", question: "질문", transition: "연결", more: "더" };
    expect(stopText(stop, "short").split("\n")).toEqual(["도입", "관찰"]);
    expect(stopText(stop, "basic").split("\n")).toEqual(["도입", "관찰", "이야기", "의미", "비교", "질문", "연결"]);
    expect(stopText(stop, "long").split("\n")).toHaveLength(8);
  });

  it("예전 원고 길이별: 짧게 = 소개 + 앞 포인트 2개, 기본 = 전부, 자세히 = 덧붙일 이야기까지", () => {
    const s = script("왕궁");
    expect(scriptText(s, "short").split("\n")).toHaveLength(3);
    expect(explainMinutes(s, "short")).toBe(2); // 450자
    expect(explainMinutes(s, "basic")).toBe(3); // 550자
    expect(explainMinutes(s, "long")).toBe(4); // 800자
  });

  it("체류 구성 = 대기 + 설명 + 관람 + 집결(인원) → 5분 단위", () => {
    expect([gatherMinutes(4), gatherMinutes(15), gatherMinutes(30)]).toEqual([10, 15, 20]);
    expect(stayBreakdown(script("왕궁", { waitMin: 15, viewMin: 40 }), 20)).toEqual({ wait: 15, explain: 3, view: 40, gather: 15, total: 75 });
  });
});

describe("가이드 해설집 — 원고 저장·짝짓기", () => {
  it("AI 초안 → 저장 형식 (새 방식 · 지점 · 가이드 노트 · 사실 확인 · 베테랑 메모 이어받기)", () => {
    const stop = { title: "선착장", hook: "[잠시 멈춤] 강 건너를 보세요", look: "탑의 도자기 조각", story: "새벽의 사원 이야기", meaning: "힌두 신화의 메루산", korea: "불국사 다보탑처럼", question: "몇 층일까요? (5층)", transition: "이제 위로 올라가 볼까요", more: "" };
    const s = scriptFromDraft(
      "방콕",
      "왓 아룬 (새벽사원)",
      { tier: "standard", intro: "새벽사원입니다", stops: [stop], guideNotes: ["높이는 자료마다 70~82m로 갈림"], site: { dropOff: "", tickets: "", meetPoint: "선착장", restroom: "", photo: "" }, cautions: ["복장"], faq: [], audience: { family: "", senior: "계단 주의", student: "", couple: "" }, viewMin: 35.4, waitMin: -3, mustKnow: ["a", "b", "c", "d"] },
      [{ title: "관광청", url: "https://example.com" }],
      "",
      { veteran: "계단이 가팔라 시니어는 아래에서", checks: [{ where: "지점 1", claim: "5층", reason: "근거 없음" }] },
    );
    expect(s).toMatchObject({ key: "왓아룬", version: 2, tier: "standard", status: "draft", viewMin: 35, waitMin: 0, mustKnow: ["a", "b", "c"], veteran: "계단이 가팔라 시니어는 아래에서" });
    expect(s.points[0]).toMatchObject({ hook: "[잠시 멈춤] 강 건너를 보세요", text: "새벽의 사원 이야기", korea: "불국사 다보탑처럼" });
    expect(s.checks).toHaveLength(1);
    expect(s.guideNotes).toEqual(["높이는 자료마다 70~82m로 갈림"]);
  });

  it("품질: 예전 원고는 다시 만들기, 등급 기준보다 지점·해설이 모자라면 얕음", () => {
    expect(scriptQuality(script("왕궁")).legacy).toBe(true);
    const longStop = (n: number) => ({ title: `지점${n}`, hook: "보세요 [잠시 멈춤]", look: "관찰", text: "가".repeat(1500), meaning: "의미", korea: "경복궁처럼", question: "질문 (답)", transition: "연결", more: "" });
    const major = script("왕궁", { version: 2, tier: "major", points: [1, 2, 3, 4, 5].map(longStop) });
    const q = scriptQuality(major);
    expect(q).toMatchObject({ legacy: false, stops: 5, korea: 5, questions: 5, cues: 5, shallow: false });
    expect(q.minutes).toBeGreaterThanOrEqual(25);
    const thin = scriptQuality(script("왕궁", { version: 2, tier: "major", points: [longStop(1), longStop(2)] }));
    expect(thin.shallow).toBe(true);
    expect(thin.hint).toContain("지점 2곳 (대표 명소 기준 5곳 이상)");
  });

  it("검수 완료 원고는 초안이 덮지 않는다 (force면 덮는다)", () => {
    const kit = { ...emptyKit("방콕"), scripts: [script("왕궁", { status: "reviewed", intro: "직원이 고친 소개" })] };
    const r = upsertScript(kit, script("왕궁", { key: "왕궁", status: "draft" }));
    expect(r.kept).toBe(true);
    expect(r.kit.scripts[0].intro).toBe("직원이 고친 소개");
    expect(upsertScript(kit, script("왕궁", { status: "draft" }), true).kit.scripts[0].status).toBe("draft");
  });

  it("일정 항목 이름에 맞는 원고 — 같은 이름 먼저, 없으면 포함 관계 중 가장 긴 것", () => {
    const list = [script("왕궁"), script("에메랄드 사원"), script("왕궁 에메랄드 사원")];
    expect(findScript(list, "왕궁")?.name).toBe("왕궁");
    expect(findScript(list, "왕궁, 에메랄드 사원 관광")?.name).toBe("왕궁 에메랄드 사원");
    expect(findScript(list, "아시아티크")).toBeNull();
  });

  it("파일 불러오기: 새것은 넣고, 우리 검수 완료는 남의 초안이 덮지 않는다", () => {
    const cur = { ...emptyKit("방콕"), scripts: [script("왕궁", { status: "reviewed", updatedAt: "2026-01-01" })] };
    const m = mergeKit(cur, {
      scripts: [
        { ...script("왕궁", { status: "draft", updatedAt: "2026-09-01" }) },
        { ...script("짜오프라야 강", { updatedAt: "2026-09-01" }) },
        { name: "" },
      ],
      phrases: [{ ko: "안녕하세요", local: "사와디캅", say: "사와디캅" }],
    });
    expect({ added: m.added, updated: m.updated, skipped: m.skipped }).toEqual({ added: 1, updated: 0, skipped: 2 });
    expect(m.kit.scripts.map((s) => s.name)).toEqual(["왕궁", "짜오프라야 강"]);
    expect(m.kit.phrases).toHaveLength(1);
  });

  it("일정의 도시별 장소 (식사·이동·숙소 빼고, 같은 곳은 한 번)", () => {
    const days = [
      linearDay(1, [item("a", { name: "왕궁" }), item("m", { name: "점심", type: "meal" }), item("b", { name: "왕궁" })], { overnightCity: "방콕" }),
      linearDay(2, [item("c", { name: "산호섬" }), item("h", { name: "호텔", type: "hotel" })], { overnightCity: "파타야" }),
    ];
    expect(tripPlacesByCity(days, {}, "방콕, 파타야")).toEqual({ 방콕: ["왕궁"], 파타야: ["산호섬"] });
  });

  it("교육 자료: 저장본이 없으면 기본 자료, 빠진 칸은 기본으로 채운다", () => {
    expect(withDefaultBasics(null).sections).toHaveLength(DEFAULT_BASICS.length);
    const saved = withDefaultBasics({ sections: [{ ...DEFAULT_BASICS[0], lines: ["우리 회사 인사"] }], updatedAt: "", updatedBy: "" });
    expect(saved.sections[0].lines).toEqual(["우리 회사 인사"]);
    expect(saved.sections).toHaveLength(DEFAULT_BASICS.length);
  });

  it("가이드 링크에 붙이기 — 일정 줄에 맞는 원고만, 상품 원칙은 빼고 교육 자료", () => {
    const sheet = {
      title: "",
      period: "",
      travelers: 4,
      company: { name: "", emergency: "", phone: "" },
      notes: [],
      days: [{ day: 1, date: "", region: "", meeting: "", meals: "", hotel: "", rows: [{ key: "a", time: "", title: "왕궁, 에메랄드 사원 관광", move: false, notes: [] }, { key: "b", time: "", title: "이동", move: true, notes: [] }], warnings: [], options: [] }],
      names: [],
      scripts: [],
      tips: [],
      updatedAt: "",
    } satisfies GuideSheet;
    const out = attachGuide(sheet, [script("왕궁"), script("아시아티크")], withDefaultBasics(null));
    expect(out.scripts.map((s) => s.name)).toEqual(["왕궁"]);
    expect(out.scripts[0].minutes).toBe(3);
    expect(out.tips.some((t) => t.title === "쇼핑·선택관광·가이드 경비 안내")).toBe(false);
    expect(out.tips.length).toBe(DEFAULT_BASICS.length - 1);
  });
});

describe("가이드 해설집 — 영어 원고", () => {
  const en = { intro: "Welcome to the Grand Palace.", points: [{ title: "History", hook: "", look: "", text: "word ".repeat(130).trim(), meaning: "", korea: "", question: "", transition: "", more: "" }], site: { dropOff: "", tickets: "", meetPoint: "Main gate", restroom: "", photo: "" }, cautions: ["Cover your shoulders"], faq: [], audience: { family: "", senior: "", student: "", couple: "" }, mustKnow: ["1782"], status: "draft" as const, updatedAt: "", updatedBy: "" };

  it("영어로 본 원고 — 내용만 바꾸고 이름·시간은 공통, 없으면 null", () => {
    const s = script("왕궁", { en, viewMin: 60 });
    const v = scriptIn(s, "en")!;
    expect(v.name).toBe("왕궁");
    expect(v.viewMin).toBe(60);
    expect(v.intro).toBe("Welcome to the Grand Palace.");
    expect(v.status).toBe("draft");
    expect(scriptIn(script("왕궁"), "en")).toBeNull();
  });

  it("영어는 단어 수로 말하는 시간 (1분 130단어)", () => {
    expect(speakSeconds("word ".repeat(130))).toBe(60);
    expect(explainMinutes(scriptIn(script("왕궁", { en }), "en")!)).toBe(2);
  });

  it("한국어 원고를 AI로 다시 만들면 영어 원고는 남기되 다시 검수하도록 초안으로", () => {
    const kit = { ...emptyKit("방콕"), scripts: [script("왕궁", { en: { ...en, status: "reviewed" } })] };
    const r = upsertScript(kit, script("왕궁", { intro: "새 소개" }), true);
    expect(r.kit.scripts[0].intro).toBe("새 소개");
    expect(r.kit.scripts[0].en?.status).toBe("draft");
    expect(r.kit.scripts[0].en?.intro).toBe("Welcome to the Grand Palace.");
  });

  it("고친 영어 내용을 영어 칸에 담기", () => {
    const v = { ...script("왕궁"), intro: "Edited intro" };
    expect(englishFrom(v, "reviewed", "t", "직원").intro).toBe("Edited intro");
  });
});
