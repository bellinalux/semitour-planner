import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("@/lib/server/cfEnv", () => ({ workerEnv: async () => null }));

import { providerStatus, resetModelCaches, resetProviderStates } from "@/lib/server/aiProviders";
import { generateJson, resetGeminiKeyRest, testProvider } from "@/lib/server/gemini";

const schema = z.object({ city: z.string() });
const env = { ...process.env };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ok = (city: string) => json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ city }) }] } }] });

/** Gemini에 보낸 키 순서 */
let keysSent: string[] = [];
function mockGemini(byKey: Record<string, () => Response>) {
  keysSent = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (!url.includes("googleapis")) return json({ error: { message: "nope" } }, 500);
    const key = (init?.headers as Record<string, string>)["x-goog-api-key"];
    keysSent.push(key);
    return (byKey[key] ?? (() => json({ error: { message: "API key not valid" } }, 400)))();
  });
}

beforeEach(() => {
  resetProviderStates();
  resetModelCaches();
  resetGeminiKeyRest();
  process.env.GEMINI_API_KEY = "main-key";
  process.env.GEMINI_BACKUP_API_KEY = "backup-key";
  process.env.AI_PROVIDERS = "gemini";
  delete process.env.GROQ_API_KEY;
});
afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...env };
});

describe("Gemini 예비 키", () => {
  it("주 키가 크레딧 소진(402)이면 같은 요청을 예비 키로 보낸다", async () => {
    mockGemini({ "main-key": () => json({ error: { message: "Your prepayment credits are depleted." } }, 402), "backup-key": () => ok("오사카") });
    expect(await generateJson({ system: "s", user: "u", schema })).toEqual({ city: "오사카" });
    expect(keysSent).toEqual(["main-key", "backup-key"]);
    // Gemini 자체는 쉬게 하지 않는다 (예비 키가 답했으므로)
    expect((await providerStatus()).gemini.coolingDown).toBe(false);
  });

  it("한도(429)로 막힌 주 키는 잠시 건너뛰고 예비 키부터 쓴다", async () => {
    mockGemini({ "main-key": () => json({ error: { message: "quota" } }, 429), "backup-key": () => ok("후쿠오카") });
    await generateJson({ system: "s", user: "u", schema });
    await generateJson({ system: "s", user: "u", schema });
    expect(keysSent).toEqual(["main-key", "backup-key", "backup-key"]);
  });

  it("주 키가 되면 예비 키는 부르지 않는다", async () => {
    mockGemini({ "main-key": () => ok("도쿄"), "backup-key": () => ok("x") });
    await generateJson({ system: "s", user: "u", schema });
    expect(keysSent).toEqual(["main-key"]);
  });

  it("붐빔(503)은 키 문제가 아니라 예비 키로 넘기지 않는다", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      mockGemini({ "main-key": () => json({ error: { message: "high demand" } }, 503), "backup-key": () => ok("x") });
      const p = generateJson({ system: "s", user: "u", schema }).catch((e: unknown) => e);
      await vi.runAllTimersAsync();
      await p;
      expect(keysSent).not.toContain("backup-key");
    } finally {
      vi.useRealTimers();
    }
  });

  it("예비 키만 있어도 Gemini를 쓴다", async () => {
    delete process.env.GEMINI_API_KEY;
    mockGemini({ "backup-key": () => ok("삿포로") });
    expect(await generateJson({ system: "s", user: "u", schema })).toEqual({ city: "삿포로" });
    expect(keysSent).toEqual(["backup-key"]);
  });

  it("연결 시험은 두 키를 따로 보여 준다", async () => {
    mockGemini({ "main-key": () => json({ error: { message: "quota" } }, 429), "backup-key": () => json({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }) });
    const r = await testProvider("gemini");
    expect(r.ok).toBe(true);
    expect(r.message).toContain("주 키: Gemini 사용량 한도");
    expect(r.message).toContain("예비 키: 연결됨");
  });
});
