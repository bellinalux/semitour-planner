import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Cloudflare 바인딩은 테스트마다 바꿔 끼운다
const cf: { ai: { run: (model: string, input: Record<string, unknown>) => Promise<unknown> } | null } = { ai: null };
vi.mock("@/lib/server/cfEnv", () => ({ workerEnv: async (name: string) => (name === "AI" ? cf.ai : null) }));

import { providerStatus, resetProviderStates, withAiInfo } from "@/lib/server/aiProviders";
import { generateGroundedText, generateJson, GeminiError } from "@/lib/server/gemini";

const schema = z.object({ city: z.string(), days: z.number() });
const env = { ...process.env };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const gemini402 = () => json({ error: { message: "Your prepayment credits are depleted." } }, 402);
const groqOk = (content: string, extra: Record<string, unknown> = {}) => json({ choices: [{ message: { content, ...extra }, finish_reason: "stop" }] });

let calls: { url: string; body: Record<string, unknown> }[] = [];
function mockFetch(handler: (url: string, body: Record<string, unknown>) => Response) {
  calls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ url, body });
    return handler(url, body);
  });
}

beforeEach(() => {
  resetProviderStates();
  cf.ai = null;
  process.env.GEMINI_API_KEY = "g-key";
  process.env.GROQ_API_KEY = "groq-key";
  delete process.env.AI_PROVIDERS;
});
afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...env };
});

describe("AI 대체 업체로 이어 받기", () => {
  it("Gemini 크레딧 소진(402)이면 Groq가 답하고, 응답 머리글로 알린다", async () => {
    mockFetch((url) => (url.includes("googleapis") ? gemini402() : groqOk('{"city":"다낭","days":4}')));
    const handler = withAiInfo(async () => Response.json(await generateJson({ system: "s", user: "u", schema })));
    const res = await handler();
    expect(await res.json()).toEqual({ city: "다낭", days: 4 });
    expect(res.headers.get("x-ai-provider")).toBe("groq");
    expect(decodeURIComponent(res.headers.get("x-ai-fallback") ?? "")).toContain("크레딧");
    // Groq에는 스키마를 구조화 출력으로 보낸다
    const groqCall = calls.find((c) => c.url.includes("groq"))!;
    expect((groqCall.body.response_format as { type: string }).type).toBe("json_schema");
  });

  it("한 번 크레딧 소진이 난 Gemini는 잠시 부르지 않는다", async () => {
    mockFetch((url) => (url.includes("googleapis") ? gemini402() : groqOk('{"city":"a","days":1}')));
    await generateJson({ system: "s", user: "u", schema });
    await generateJson({ system: "s", user: "u", schema });
    expect(calls.filter((c) => c.url.includes("googleapis"))).toHaveLength(1);
    const st = await providerStatus();
    expect(st.gemini.coolingDown).toBe(true);
  });

  it("Gemini가 되면 대체 업체를 부르지 않고 머리글도 없다", async () => {
    mockFetch(() => json({ candidates: [{ content: { parts: [{ text: '{"city":"b","days":2}' }] } }] }));
    const res = await withAiInfo(async () => Response.json(await generateJson({ system: "s", user: "u", schema })))();
    expect(res.headers.get("x-ai-provider")).toBeNull();
    expect(calls.every((c) => c.url.includes("googleapis"))).toBe(true);
  });

  it("Groq 구조화 출력이 거절(400)되면 JSON 모드로 다시 보낸다, 코드블록도 걷어낸다", async () => {
    mockFetch((url, body) => {
      if (url.includes("googleapis")) return json({ error: { message: "quota" } }, 429);
      const rf = body.response_format as { type: string } | undefined;
      return rf?.type === "json_schema" ? json({ error: { message: "json_schema not supported" } }, 400) : groqOk('```json\n{"city":"c","days":3}\n```');
    });
    expect(await generateJson({ system: "s", user: "u", schema })).toEqual({ city: "c", days: 3 });
  });

  it("Gemini·Groq 모두 안 되면 Cloudflare AI가 답한다", async () => {
    cf.ai = { run: async () => ({ response: { city: "d", days: 5 } }) };
    mockFetch((url) => (url.includes("googleapis") ? gemini402() : json({ error: { message: "rate limit" } }, 429)));
    const res = await withAiInfo(async () => Response.json(await generateJson({ system: "s", user: "u", schema })))();
    expect(await res.json()).toEqual({ city: "d", days: 5 });
    expect(res.headers.get("x-ai-provider")).toBe("cloudflare");
  });

  it("모두 안 되면 업체별 이유를 모아 알린다", async () => {
    mockFetch((url) => (url.includes("googleapis") ? gemini402() : json({ error: { message: "rate limit" } }, 429)));
    const err = await generateJson({ system: "s", user: "u", schema }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GeminiError);
    const msg = (err as GeminiError).message;
    expect(msg).toContain("Gemini");
    expect(msg).toContain("Groq");
    expect(msg).toContain("Cloudflare AI: 연결 없음");
  });

  it("PDF 코스표는 대체 AI로 보내지 않는다 (사진은 보낸다)", async () => {
    mockFetch((url) => (url.includes("googleapis") ? gemini402() : groqOk('{"city":"e","days":1}')));
    const pdf = await generateJson({ system: "s", user: "u", schema, files: [{ mimeType: "application/pdf", data: "AAAA" }] }).catch((e: unknown) => e);
    expect(pdf).toBeInstanceOf(GeminiError);
    expect((pdf as GeminiError).message).toContain("PDF");
    expect(calls.some((c) => c.url.includes("groq"))).toBe(false);

    resetProviderStates();
    await generateJson({ system: "s", user: "u", schema, files: [{ mimeType: "image/jpeg", data: "AAAA" }] });
    const groqCall = calls.find((c) => c.url.includes("groq"))!;
    expect(String(groqCall.body.model)).toContain("scout");
    expect(JSON.stringify(groqCall.body.messages)).toContain("data:image/jpeg;base64,AAAA");
  });

  it("검색 조사: Groq compound의 웹 검색 출처를 받아 온다", async () => {
    mockFetch((url) =>
      url.includes("googleapis")
        ? gemini402()
        : groqOk("입장료 50,000동", { executed_tools: [{ type: "search", search_results: { results: [{ title: "공식", url: "https://a.example" }] } }] }),
    );
    const r = await generateGroundedText({ user: "입장료 조사" });
    expect(r).toEqual({ text: "입장료 50,000동", sources: [{ title: "공식", url: "https://a.example" }], searched: true });
    expect(calls.find((c) => c.url.includes("groq"))!.body.model).toBe("groq/compound");
  });

  it("검색 조사: Cloudflare는 검색하지 않았다고(searched=false) 돌려준다", async () => {
    process.env.AI_PROVIDERS = "gemini,cloudflare";
    cf.ai = { run: async () => ({ response: "아마 5만동 (추정)" }) };
    mockFetch(() => gemini402());
    const r = await generateGroundedText({ user: "입장료 조사" });
    expect(r.searched).toBe(false);
    expect(r.text).toContain("추정");
  });

  it("키가 하나도 없으면 키 등록 안내", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    const err = await generateJson({ system: "s", user: "u", schema }).catch((e: unknown) => e);
    expect((err as GeminiError).code).toBe("NO_KEY");
  });
});

describe("대체 업체가 없을 때", () => {
  it("Gemini만 있으면 쉬는 중이어도 다시 시도한다 (계속 실패만 내지 않게)", async () => {
    delete process.env.GROQ_API_KEY;
    let fail = true;
    mockFetch(() => (fail ? json({ error: { message: "overloaded" } }, 503) : json({ candidates: [{ content: { parts: [{ text: '{"city":"f","days":1}' }] } }] })));
    await expect(generateJson({ system: "s", user: "u", schema })).rejects.toBeInstanceOf(GeminiError);
    fail = false;
    expect(await generateJson({ system: "s", user: "u", schema })).toEqual({ city: "f", days: 1 });
  });
});

describe("Gemini 붐빔(503)", () => {
  it("한 번 기다렸다 다시 보내 성공하면 대체 AI로 넘기지 않는다", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    let n = 0;
    mockFetch((url) => {
      if (!url.includes("googleapis")) return groqOk('{"city":"x","days":9}');
      n++;
      return n === 1
        ? json({ error: { message: "This model is currently experiencing high demand." } }, 503)
        : json({ candidates: [{ content: { parts: [{ text: '{"city":"g","days":2}' }] } }] });
    });
    const p = generateJson({ system: "s", user: "u", schema });
    await vi.runAllTimersAsync();
    expect(await p).toEqual({ city: "g", days: 2 });
    expect(calls.some((c) => c.url.includes("groq"))).toBe(false);
    vi.useRealTimers();
  });

  it("다시 보내도 503이면 Groq가 이어 받는다", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    mockFetch((url) => (url.includes("googleapis") ? json({ error: { message: "high demand" } }, 503) : groqOk('{"city":"h","days":3}')));
    const p = generateJson({ system: "s", user: "u", schema });
    await vi.runAllTimersAsync();
    expect(await p).toEqual({ city: "h", days: 3 });
    // 같은 모델 2번 + 다른 Gemini 모델 1번
    const g = calls.filter((c) => c.url.includes("googleapis"));
    expect(g).toHaveLength(3);
    expect(g[2].url).toContain("gemini-flash-latest");
    vi.useRealTimers();
  });

  it("Groq도 없으면 알아보기 쉬운 문장으로 알린다", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    delete process.env.GROQ_API_KEY;
    mockFetch(() => json({ error: { message: "high demand" } }, 503));
    const p = generateJson({ system: "s", user: "u", schema }).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    expect(((await p) as GeminiError).message).toContain("붐벼");
    vi.useRealTimers();
  });
});

describe("Gemini 다른 모델로 한 번 더", () => {
  it("기본 모델이 계속 붐비면 다른 Gemini 모델이 답한다 (키 추가 없이)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    delete process.env.GROQ_API_KEY;
    mockFetch((url) =>
      url.includes("flash-lite") ? json({ error: { message: "high demand" } }, 503) : json({ candidates: [{ content: { parts: [{ text: '{"city":"i","days":4}' }] } }] }),
    );
    const p = generateJson({ system: "s", user: "u", schema });
    await vi.runAllTimersAsync();
    expect(await p).toEqual({ city: "i", days: 4 });
    vi.useRealTimers();
  });
});
