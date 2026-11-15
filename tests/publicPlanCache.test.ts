import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/knowledgeStore", () => ({ getCity: async () => null, listCities: async () => [], bumpMetric: async () => undefined }));
vi.mock("@/lib/server/itineraryGenerate", () => ({
  generateItineraryDays: async () => ({
    days: [{ day: 1, theme: "", kind: "linear", overnightCity: "다낭", amGuided: [], pmFreeOptions: [], items: [{ id: "a", type: "sightseeing", name: "바나힐", description: "", stayMinutes: 240, travelMinutesToNext: 0, entryFee: 0, mealCost: 0, isEstimated: true }] }],
    sources: [],
    researched: false,
    knowledge: [],
  }),
}));

import { publicPlanRequestSchema, normalizePublicSettings } from "@/lib/publicPlan";
import { cachedPublicPlan } from "@/lib/server/publicPlan";

describe("같은 조건 재사용은 하루 횟수에 세지 않는다", () => {
  it("새로 만들 때만 상한 확인을 부르고, 두 번째는 저장한 결과", async () => {
    const req = publicPlanRequestSchema.parse({ destination: `다낭-${Date.now()}`, nights: 1, days: 1 });
    const settings = normalizePublicSettings({ aiFallback: true });
    const check = vi.fn(async () => undefined);
    const first = await cachedPublicPlan(req, settings, check);
    const second = await cachedPublicPlan({ ...req, token: "다른 토큰" }, settings, check);
    expect(first.fresh).toBe(true);
    expect(first.source).toBe("ai");
    expect(second.fresh).toBe(false);
    expect(second.source).toBe("cache");
    expect(check).toHaveBeenCalledTimes(1);
  });
  it("상한에 걸리면 만들지 않는다", async () => {
    const req = publicPlanRequestSchema.parse({ destination: `오사카-${Date.now()}`, nights: 1, days: 1 });
    await expect(cachedPublicPlan(req, normalizePublicSettings({}), async () => { throw new Error("QUOTA"); })).rejects.toThrow("QUOTA");
  });
  it("AI를 끄면 지식 창고에 없는 여행지는 만들지 않는다", async () => {
    const req = publicPlanRequestSchema.parse({ destination: `없는곳-${Date.now()}`, nights: 1, days: 1 });
    await expect(cachedPublicPlan(req, normalizePublicSettings({ aiFallback: false }))).rejects.toThrow("NO_KNOWLEDGE");
  });
});
