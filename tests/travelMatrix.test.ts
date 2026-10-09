import { afterEach, describe, expect, it, vi } from "vitest";
import { travelMatrix } from "@/lib/server/courseEngineServer";

const places = [
  { id: "a", name: "세나도 광장", stayMin: 30, lat: 22.1935, lng: 113.5398 },
  { id: "b", name: "타이파 빌리지", stayMin: 60, lat: 22.1558, lng: 113.5566 },
];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("코스 엔진 이동 시간표 — 구글 지도를 못 쓰면 이유를 알린다", () => {
  it("키가 없으면 '키가 없습니다'", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    const r = await travelMatrix(places as never, "car");
    expect(r).toMatchObject({ source: "estimate", note: "서버에 GOOGLE_MAPS_API_KEY가 없습니다" });
  });

  it("키가 있는데 구글이 거절하면 상태와 이유 (예: Routes API 미사용)", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key-403");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { status: "PERMISSION_DENIED", message: "Routes API has not been used in project 123 before or it is disabled." } }), { status: 403 })));
    const r = await travelMatrix(places as never, "car");
    expect(r.source).toBe("estimate");
    expect(r.note).toContain("구글 지도 응답 오류 403 PERMISSION_DENIED — Routes API has not been used");
  });

  it("구글이 답하면 구글 지도 시간을 쓴다", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key-ok");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify([
            { originIndex: 0, destinationIndex: 1, duration: "1080s", condition: "ROUTE_EXISTS" },
            { originIndex: 1, destinationIndex: 0, duration: "1200s", condition: "ROUTE_EXISTS" },
          ]),
          { status: 200 },
        ),
      ),
    );
    const r = await travelMatrix(places as never, "car");
    expect(r).toMatchObject({ source: "google", note: "" });
    expect(r.M[0][1]).toBe(18);
  });
});

describe("구글 지도 키 정리", () => {
  it("붙여넣다 딸려 온 따옴표·공백·줄바꿈·'GOOGLE_MAPS_API_KEY=' 글자를 걷어낸다", async () => {
    const { mapsKey } = await import("@/lib/server/courseEngineServer");
    vi.stubEnv("GOOGLE_MAPS_API_KEY", ' GOOGLE_MAPS_API_KEY = "AIzaSyTEST123"\n');
    expect(mapsKey()).toBe("AIzaSyTEST123");
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "'AIzaSy ABC'");
    expect(mapsKey()).toBe("AIzaSyABC");
  });
});
