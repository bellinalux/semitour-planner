import { describe, expect, it } from "vitest";
import {
  DEFAULT_BASICS,
  emptyKit,
  explainMinutes,
  findScript,
  gatherMinutes,
  guideScriptSchema,
  mergeKit,
  scriptFromDraft,
  scriptText,
  speakSeconds,
  stayBreakdown,
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
  it("1분에 250자 (띄어쓰기 빼고)", () => {
    expect(speakSeconds("가".repeat(250))).toBe(60);
    expect(speakSeconds("가 나 다")).toBe(1);
  });

  it("길이별: 짧게 = 소개 + 앞 포인트 2개, 기본 = 전부, 자세히 = 덧붙일 이야기까지", () => {
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
  it("AI 초안 → 저장 형식 (초안, 길이 제한, 꼭 외울 것 3개)", () => {
    const s = scriptFromDraft(
      "방콕",
      "왓 아룬 (새벽사원)",
      { intro: "새벽사원입니다", points: [{ title: "이름", text: "새벽의 사원", more: "" }], site: { dropOff: "", tickets: "", meetPoint: "선착장", restroom: "", photo: "" }, cautions: ["복장"], faq: [], audience: { family: "", senior: "계단 주의", student: "", couple: "" }, viewMin: 35.4, waitMin: -3, mustKnow: ["a", "b", "c", "d"] },
      [{ title: "관광청", url: "https://example.com" }],
    );
    expect(s).toMatchObject({ key: "왓아룬", status: "draft", viewMin: 35, waitMin: 0, mustKnow: ["a", "b", "c"] });
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
