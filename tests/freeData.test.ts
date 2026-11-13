import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cf: { ai: { run: (m: string, i: Record<string, unknown>) => Promise<unknown> } | null } = { ai: null };
vi.mock("@/lib/server/cfEnv", () => ({ workerEnv: async (name: string) => (name === "AI" ? cf.ai : null) }));

import { geocode, lastYearWeather, m2mTranslate, wikiNearby } from "@/lib/server/freeData";
import { getKv } from "@/lib/server/planStore";

const env = { ...process.env };
let urls: string[] = [];
function mock(handler: (url: string) => Response) {
  urls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    urls.push(url);
    return handler(url);
  });
}
beforeEach(async () => {
  cf.ai = null;
  const kv = (await getKv())!.kv;
  for (const k of (await kv.list({ prefix: "osm:" })).keys) await kv.delete(k.name);
  for (const k of (await kv.list({ prefix: "wikinear:" })).keys) await kv.delete(k.name);
});
afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...env };
});

describe("무료 공개 데이터", () => {
  it("OpenStreetMap 좌표 — 앱 이름 User-Agent, 저장해 두고 다시 묻지 않는다", async () => {
    const seenUA: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      urls.push(String(input));
      seenUA.push(new Headers(init?.headers).get("User-Agent") ?? "");
      return Response.json([{ lat: "34.6873", lon: "135.5259", name: "오사카성", address: { country_code: "jp" } }]);
    });
    urls = [];
    const a = await geocode("오사카성, 오사카");
    expect(a).toEqual({ lat: 34.6873, lng: 135.5259, name: "오사카성", countryCode: "JP" });
    expect(urls[0]).toContain("nominatim.openstreetmap.org");
    expect(seenUA[0]).toContain("SemitourPlanner");
    await geocode("오사카성, 오사카");
    expect(urls).toHaveLength(1);
  });

  it("작년 같은 기간 날씨 요약 (Open-Meteo)", async () => {
    mock(() => Response.json({ daily: { temperature_2m_max: [10, 12, 11, 9], temperature_2m_min: [2, 3, 1, 2], precipitation_sum: [0, 5, 2, 0] } }));
    const w = (await lastYearWeather(34.69, 135.52, "2027-01-04", "2027-01-07"))!;
    expect(urls[0]).toContain("start_date=2026-01-04");
    expect(w).toMatchObject({ avgMax: 11, avgMin: 2, rainyDays: 2, days: 4 });
    expect(w.text).toContain("우산");
  });

  it("번역 전용 모델(m2m100) — 한글만 번역, 연결이 없으면 null", async () => {
    expect(await m2mTranslate(["안녕"], "en")).toBeNull();
    const seen: string[] = [];
    cf.ai = { run: async (model, input) => { seen.push(model); return { translated_text: `EN(${String(input.text)})` }; } };
    expect(await m2mTranslate(["오사카성", "KE723", ""], "en")).toEqual(["EN(오사카성)", "KE723", ""]);
    expect(seen[0]).toBe("@cf/meta/m2m100-1.2b");
  });

  it("위키백과 주변 문서 — 역·학교 등은 빼고 저장", async () => {
    mock((url) =>
      url.includes("nominatim")
        ? Response.json([{ lat: "34.69", lon: "135.50", name: "오사카", address: { country_code: "jp" } }])
        : Response.json({ query: { geosearch: [{ title: "오사카성" }, { title: "오사카역" }, { title: "도톤보리" }, { title: "오사카 대학" }] } }),
    );
    expect(await wikiNearby("오사카")).toEqual(["오사카성", "도톤보리"]);
  });
});

describe("AI를 못 쓸 때도 기본 기능", () => {
  it("코스 지도 좌표: OpenStreetMap 먼저, 못 찾은 곳만 AI(구글 지도)", async () => {
    process.env.GEMINI_API_KEY = "k";
    mock((url) => (url.includes("nominatim") ? Response.json(url.includes(encodeURIComponent("없는곳")) ? [] : [{ lat: "1.5", lon: "2.5", name: "호텔A", address: { country_code: "jp" } }]) : Response.json({ error: { message: "credits depleted" } }, { status: 402 })));
    const { locatePlaces } = await import("@/lib/server/courseEngineServer");
    const r = await locatePlaces(["호텔A", "없는곳"], "오사카테스트");
    expect(r).toEqual([{ name: "호텔A", lat: 1.5, lng: 2.5 }]);
    expect(urls.some((u) => u.includes("googleapis"))).toBe(true); // 못 찾은 곳만 AI로 (실패해도 괜찮음)
  });

  it("출발 시기 점검: AI가 모두 실패해도 무료 날씨(작년 같은 기간)를 보여 준다", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    mock((url) => {
      if (url.includes("nominatim")) return Response.json([{ lat: "34.69", lon: "135.50", name: "오사카", address: { country_code: "jp" } }]);
      if (url.includes("open-meteo")) return Response.json({ daily: { temperature_2m_max: [10], temperature_2m_min: [2], precipitation_sum: [0] } });
      if (url.includes("nager")) return Response.json([]);
      return Response.json({}, { status: 500 });
    });
    const { checkSeason } = await import("@/lib/server/seasonCheck");
    const r = await checkSeason({ destination: "오사카무료", departureDate: "2027-01-04", days: 3 });
    expect(r.searched).toBe(false);
    expect(r.weather).toContain("작년 같은 기간 평균 최고 10°C");
  });
});
