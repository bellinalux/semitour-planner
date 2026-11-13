import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Cloudflare 바인딩은 테스트마다 바꿔 끼운다
const cf: { ai: { run: (model: string, input: Record<string, unknown>) => Promise<unknown> } | null } = { ai: null };
vi.mock("@/lib/server/cfEnv", () => ({ workerEnv: async (name: string) => (name === "AI" ? cf.ai : null) }));

import { providerStatus, resetModelCaches, resetProviderStates, withAiInfo } from "@/lib/server/aiProviders";
import { generateGroundedText, generateJson, GeminiError } from "@/lib/server/gemini";

const schema = z.object({ city: z.string(), days: z.number() });
const env = { ...process.env };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const gemini402 = () => json({ error: { message: "Your prepayment credits are depleted." } }, 402);
const groqOk = (content: string, extra: Record<string, unknown> = {}) => json({ choices: [{ message: { content, ...extra }, finish_reason: "stop" }] });

let calls: { url: string; body: Record<string, unknown> }[] = [];
/** Groq 계정의 모델 목록 (앱이 쓸 수 있는 모델을 조회해 고른다) */
let groqModelIds = ["openai/gpt-oss-120b", "groq/compound", "meta-llama/llama-4-scout-17b-16e-instruct"];
function mockFetch(handler: (url: string, body: Record<string, unknown>) => Response) {
  calls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/openai/v1/models")) return json({ data: groqModelIds.map((id) => ({ id, active: true })) });
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ url, body });
    return handler(url, body);
  });
}

beforeEach(() => {
  resetProviderStates();
  resetModelCaches();
  groqModelIds = ["openai/gpt-oss-120b", "groq/compound", "meta-llama/llama-4-scout-17b-16e-instruct"];
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
    expect(((await p) as GeminiError).message).toContain("서버 붐빔");
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

describe("Groq 모델 자동 선택 (무료 등급 모델이 바뀜)", () => {
  it("검색 모델(compound)이 계정에 없으면 일반 모델로 답하고 웹 근거 없음으로 표시", async () => {
    groqModelIds = ["openai/gpt-oss-20b"];
    mockFetch((url) => (url.includes("googleapis") ? gemini402() : groqOk("아마 5만원 (추정)")));
    const r = await generateGroundedText({ user: "입장료 조사" });
    expect(r.searched).toBe(false);
    const groqCall = calls.find((c) => c.url.includes("chat/completions"))!;
    expect(groqCall.body.model).toBe("openai/gpt-oss-20b");
  });

  it("모델이 없어졌다는 404가 나면 목록을 새로 받아 다른 모델로 한 번 더", async () => {
    let n = 0;
    mockFetch((url, body) => {
      if (url.includes("googleapis")) return gemini402();
      if (body.model === "openai/gpt-oss-120b") {
        n++;
        groqModelIds = ["qwen/qwen3-32b"];
        return json({ error: { message: "The model `openai/gpt-oss-120b` does not exist or you do not have access to it." } }, 404);
      }
      return groqOk('{"city":"q","days":1}');
    });
    expect(await generateJson({ system: "s", user: "u", schema })).toEqual({ city: "q", days: 1 });
    expect(n).toBe(1);
  });

  it("검색 모델이 없어도 Tavily 키가 있으면 검색 결과를 근거로 조사 (출처 포함)", async () => {
    groqModelIds = ["openai/gpt-oss-120b"];
    process.env.TAVILY_API_KEY = "tvly-test-key";
    mockFetch((url) => {
      if (url.includes("googleapis")) return gemini402();
      if (url.includes("tavily")) return json({ results: [{ title: "오사카성 공식", url: "https://osaka.example", content: "입장료 600엔" }] });
      return groqOk("입장료 600엔");
    });
    const r = await generateGroundedText({ user: "Google 검색 도구를 여러 번 사용해서, 오사카성 입장료를 조사해 주세요." });
    expect(r).toMatchObject({ searched: true, sources: [{ title: "오사카성 공식", url: "https://osaka.example" }] });
    const tav = calls.find((c) => c.url.includes("tavily"))!;
    expect(String(tav.body.query)).toBe("오사카성 입장료를");
    expect(JSON.stringify(calls.find((c) => c.url.includes("chat/completions"))!.body)).toContain("search_results");
  });
});

describe("OpenRouter 무료 모델", () => {
  it("Gemini·Groq가 안 되면 OpenRouter 무료 모델이 이어 받는다", async () => {
    delete process.env.GROQ_API_KEY;
    process.env.OPENROUTER_API_KEY = "sk-or-test-key";
    mockFetch((url) => {
      if (url.includes("googleapis")) return gemini402();
      if (url.endsWith("openrouter.ai/api/v1/models")) return json({ data: [{ id: "paid/model", context_length: 128000, pricing: { prompt: "0.1", completion: "0.1" } }, { id: "qwen/qwen3-235b-a22b:free", context_length: 40000, pricing: { prompt: "0", completion: "0" } }] });
      return groqOk('{"city":"or","days":2}');
    });
    const res = await withAiInfo(async () => Response.json(await generateJson({ system: "s", user: "u", schema })))();
    expect(await res.json()).toEqual({ city: "or", days: 2 });
    expect(res.headers.get("x-ai-provider")).toBe("openrouter");
    expect(calls.find((c) => c.url.includes("openrouter.ai/api/v1/chat"))!.body.model).toBe("qwen/qwen3-235b-a22b:free");
  });
});

describe("Cloudflare 문맥 한도", () => {
  it("긴 입력이면 답 길이를 줄이고, 그래도 넘치면 입력 가운데를 줄인다", async () => {
    const { fitToContext } = await import("@/lib/server/aiProviders");
    const short = fitToContext([{ role: "user", content: "가".repeat(1000) }], 24_000);
    expect(short.maxTokens).toBe(8192);
    const long = fitToContext([{ role: "system", content: "규칙" }, { role: "user", content: "가".repeat(40_000) }], 24_000);
    const total = long.messages.reduce((s, m) => s + m.content.length, 0);
    expect(total).toBeLessThan(40_000);
    expect(long.messages[1].content).toContain("길어서 줄임");
    expect(long.maxTokens).toBeGreaterThanOrEqual(1024);
  });
});
