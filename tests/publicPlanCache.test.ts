import { beforeEach, describe, expect, it, vi } from "vitest";

const ai = { mode: "ok" as "ok" | "slow" | "fail" };
const wiki = { places: [] as { name: string; lat: number; lng: number }[] };

vi.mock("@/lib/server/knowledgeStore", () => ({ getCity: async () => null, listCities: async () => [], bumpMetric: async () => undefined }));
vi.mock("@/lib/server/freeData", () => ({
  geocode: async () => null,
  geocodeMany: async () => new Map(),
  wikiNearbyPlaces: async () => wiki.places,
}));
vi.mock("@/lib/server/errorLog", () => ({ recordServerEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/server/itineraryGenerate", () => ({
  generateItineraryDays: async () => {
    if (ai.mode === "fail") throw new Error("Gemini 오류 (429)");
    if (ai.mode === "slow") await new Promise((r) => setTimeout(r, 200));
    return {
      days: [{ day: 1, theme: "", kind: "linear", overnightCity: "다낭", amGuided: [], pmFreeOptions: [], items: [{ id: "a", type: "sightseeing", name: "바나힐", description: "", stayMinutes: 240, travelMinutesToNext: 0, entryFee: 0, mealCost: 0, isEstimated: true }] }],
      sources: [],
      researched: false,
      knowledge: [],
    };
  },
}));

import { normalizePublicSettings, publicPlanRequestSchema } from "@/lib/publicPlan";
import { recordServerEvent } from "@/lib/server/errorLog";
import { buildPublicPlan, cachedPublicPlan } from "@/lib/server/publicPlan";

const req = (dest: string) => publicPlanRequestSchema.parse({ destination: `${dest}-${Date.now()}-${Math.random()}`, nights: 1, days: 1 });
const W = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `명소${i}`, lat: 16.05 + i * 0.01, lng: 108.2 + i * 0.01 }));

beforeEach(() => {
  ai.mode = "ok";
  wiki.places = [];
});

describe("같은 조건 재사용은 하루 횟수에 세지 않는다", () => {
  it("새로 만들 때만 상한 확인을 부르고, 두 번째는 저장한 결과", async () => {
    const r = req("다낭");
    const settings = normalizePublicSettings({ aiFallback: true });
    const check = vi.fn(async () => undefined);
    const first = await cachedPublicPlan(r, settings, check);
    const second = await cachedPublicPlan({ ...r, token: "다른 토큰" }, settings, check);
    expect(first).toMatchObject({ fresh: true, source: "ai" });
    expect(second).toMatchObject({ fresh: false, source: "cache" });
    expect(check).toHaveBeenCalledTimes(1);
  });
  it("상한에 걸리면 만들지 않는다", async () => {
    await expect(cachedPublicPlan(req("오사카"), normalizePublicSettings({}), async () => { throw new Error("QUOTA"); })).rejects.toThrow("QUOTA");
  });
});

describe("느리거나 실패하면 무료 기본 코스로", () => {
  it("AI가 시간 안에 못 만들면 위키백과 근처 장소로 (AI 없음)", async () => {
    ai.mode = "slow";
    wiki.places = W(6);
    const r = await buildPublicPlan(req("다낭"), normalizePublicSettings({}), { aiBudgetMs: 50 });
    expect(r.source).toBe("free");
    expect(r.days.flatMap((d) => d.items).some((i) => i.name.startsWith("명소"))).toBe(true);
    expect(recordServerEvent).toHaveBeenCalled();
  });
  it("AI 업체 오류도 기본 코스로, 원인은 관리자 오류 기록에", async () => {
    ai.mode = "fail";
    wiki.places = W(6);
    const r = await buildPublicPlan(req("다낭"), normalizePublicSettings({}));
    expect(r.source).toBe("free");
    expect(recordServerEvent).toHaveBeenCalledWith("ai", expect.stringContaining("고객 코스 AI 실패"), expect.stringContaining("429"));
  });
  it("AI를 끄면 바로 무료 기본 코스, 그것도 없으면 안내", async () => {
    wiki.places = W(6);
    expect((await buildPublicPlan(req("다낭"), normalizePublicSettings({ aiFallback: false }))).source).toBe("free");
    wiki.places = [];
    await expect(buildPublicPlan(req("없는곳"), normalizePublicSettings({ aiFallback: false }))).rejects.toThrow("NO_KNOWLEDGE");
  });
});
