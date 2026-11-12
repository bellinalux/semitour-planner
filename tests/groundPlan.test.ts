import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateQuote } from "@/lib/cost";
import { groundPlan, inputAtTravelers, planChanges, scaledGround, tierOfLabel } from "@/lib/groundPlan";
import { input } from "./fixtures";

describe("인원 → 차종·대수·가이드 수", () => {
  it("인원에 맞는 차종과 대수, 가이드 수", () => {
    expect(groundPlan(3)).toMatchObject({ tier: "car", count: 1, guides: 1 });
    expect(groundPlan(10)).toMatchObject({ tier: "van", count: 1, guides: 1 });
    expect(groundPlan(30)).toMatchObject({ tier: "bus", count: 1, guides: 1 });
    // 45명을 넘으면 고르게 나눈다: 50명 → 25명씩 중형버스 2대, 52명 → 26명씩 대형버스 2대
    expect(groundPlan(50)).toMatchObject({ tier: "midbus", count: 2, guides: 2 });
    expect(groundPlan(52)).toMatchObject({ tier: "bus", count: 2, guides: 2, label: "대형버스 (45인승) 2대 · 가이드 2명" });
    // 가이드 1명당 20명이면 30명에 가이드 2명
    expect(groundPlan(30, 20).guides).toBe(2);
  });

  it("요금표·업체 견적의 차량 이름을 차종으로 읽는다", () => {
    expect(tierOfLabel("45인승 버스")).toBe("bus");
    expect(tierOfLabel("16-seater van")).toBe("van");
    expect(tierOfLabel("29인승")).toBe("midbus");
    expect(tierOfLabel("Toyota Innova")).toBe("suv");
    expect(tierOfLabel("스타렉스")).toBe("van");
    expect(tierOfLabel("미니밴 (15~16인승)")).toBe("van");
    expect(tierOfLabel("중형버스 (25~29인승)")).toBe("midbus");
    expect(tierOfLabel("한국어 가이드")).toBeNull();
  });
});

describe("인원별 차량비·가이드비 환산", () => {
  const base = { travelers: 20, vehicleCostPerDay: 300, guideCostPerDay: 100, guideCapacity: 45, groundScale: "auto" as const, vehicleTierRates: {} };

  it("같은 차종·대수·가이드 수면 그대로", () => {
    expect(scaledGround(base, 22)).toMatchObject({ vehiclePerDay: 300, guidePerDay: 100, scaled: false });
  });

  it("차종 기본 비율로 바꾼다 — 중형버스 1대(20명) → 중형버스 2대(50명), 가이드 2명", () => {
    expect(scaledGround(base, 50)).toMatchObject({ vehiclePerDay: 600, guidePerDay: 200, scaled: true });
    // 미니밴(10명): 300 × 1.7 / 2.4
    expect(scaledGround(base, 10).vehiclePerDay).toBe(Math.round((300 * 1.7) / 2.4));
  });

  it("조회한 차종별 요금이 있으면 그 비율로 — 직접 고친 금액도 비율로 존중", () => {
    const withRates = { ...base, vehicleTierRates: { midbus: 250, bus: 400 } };
    // 지금 300(조회 250에서 직접 올림) → 52명(대형 2대 = 800): 300 × 800 / 250
    expect(scaledGround(withRates, 52).vehiclePerDay).toBe(960);
  });

  it("fixed면 인원과 관계없이 지금 금액", () => {
    expect(scaledGround({ ...base, groundScale: "fixed" }, 50)).toMatchObject({ vehiclePerDay: 300, guidePerDay: 100, scaled: false });
  });

  it("견적의 인원별 가격표에 반영된다", () => {
    const q = calculateQuote(input({ travelers: 4, vehicleCostPerDay: 100000, guideCostPerDay: 50000, packageType: "land" }), [], {});
    if (!q.ok) throw new Error(q.error);
    const fixed = calculateQuote(input({ travelers: 4, vehicleCostPerDay: 100000, guideCostPerDay: 50000, packageType: "land", groundScale: "fixed" }), [], {});
    if (!fixed.ok) throw new Error(fixed.error);
    const at = (r: typeof q, n: number) => r.matrix.find((m) => m.travelers === n)!.baseCost;
    // 10명은 미니밴 — 7인승(4명 기준)보다 차량비가 올라 원가가 더 크다
    expect(at(q, 10)).toBeGreaterThan(at(fixed, 10));
    // 2명은 승용차 — 원가가 더 작다
    expect(at(q, 2)).toBeLessThan(at(fixed, 2));
    // 지금 인원은 같다
    expect(at(q, 4)).toBe(at(fixed, 4));
  });

  it("인원 바꾼 입력·바뀌는 지점", () => {
    expect(inputAtTravelers(base, 50)).toMatchObject({ travelers: 50, vehicleCostPerDay: 600, guideCostPerDay: 200 });
    expect([...planChanges([2, 4, 6, 8, 10, 30, 50])]).toEqual([4, 8, 30, 50]);
  });
});

describe("전세버스·가이드 조회 (서버)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("회사 요금표에 지금 차종·가이드가 있으면 웹을 찾지 않는다", async () => {
    const { updateRates } = await import("@/lib/server/rateStore");
    const { addGround } = await import("@/lib/rateBook");
    const { lookupGround } = await import("@/lib/server/groundLookup");
    const at = new Date().toISOString();
    await updateRates("요금표시험시", (d) =>
      addGround(addGround(d, "vehicle", "45인승 버스", { at, month: 0, low: 380, high: 420, currency: "USD", source: "supplier", by: "○○랜드사" }), "guide", "한국어 가이드", {
        at, month: 0, low: 120, high: 120, currency: "USD", source: "supplier", by: "○○랜드사",
      }),
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const r = await lookupGround({ destination: "요금표시험시", travelers: 52, currency: "USD", tripScope: "overseas", month: 0, guideCapacity: 45, refresh: false });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(r.usedWeb).toBe(false);
    expect(r.plan).toMatchObject({ tier: "bus", count: 2, guides: 2 });
    expect(r.tiers.bus).toMatchObject({ low: 380, mid: 400, high: 420, source: "book-supplier" });
    expect(r.guide).toMatchObject({ mid: 120, source: "book-supplier" });
    expect(r.tiers.van.source).toBe("none");
  });

  it("요금표에 없으면 웹에서 차종별로 찾고, 요금표에 쌓는다", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const research = {
      car: { low: 60, typical: 70, high: 80 }, suv: { low: 80, typical: 90, high: 100 }, van: { low: 110, typical: 130, high: 150 },
      midbus: { low: 180, typical: 200, high: 230 }, bus: { low: 250, typical: 280, high: 320 },
      vehicleConditions: "10시간·유류비·기사 포함", guide: { low: 70, typical: 80, high: 100 }, guideConditions: "한국어 가이드 8시간",
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_u, init) => {
      const body = JSON.parse(String(init?.body)) as { tools?: unknown };
      return body.tools
        ? Response.json({ candidates: [{ content: { parts: [{ text: "다낭 차량 시세 메모" }] }, groundingMetadata: { webSearchQueries: ["q"], groundingChunks: [{ web: { uri: "https://x.example", title: "X" } }] } }] })
        : Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(research) }] } }] });
    });
    const { lookupGround } = await import("@/lib/server/groundLookup");
    const { getRates } = await import("@/lib/server/rateStore");
    const r = await lookupGround({ destination: "웹시험시", travelers: 10, currency: "USD", tripScope: "overseas", month: 0, guideCapacity: 45, refresh: false });
    expect(r.usedWeb).toBe(true);
    expect(r.plan.tier).toBe("van");
    expect(r.tiers.van).toMatchObject({ low: 110, mid: 130, high: 150, source: "web" });
    expect(r.guide).toMatchObject({ mid: 80, source: "web", label: "한국어 가이드" });
    expect(r.sources).toEqual([{ title: "X", url: "https://x.example" }]);
    const book = await getRates("웹시험시");
    expect(book.ground.filter((g) => g.kind === "vehicle")).toHaveLength(5);
    expect(book.ground.some((g) => g.kind === "guide")).toBe(true);
  });
});
