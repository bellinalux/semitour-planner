import { z } from "zod";

const DEFAULT_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.8-flash";

/** 기본은 구글 주소. Cloudflare AI Gateway 같은 중계 주소를 쓰려면 GEMINI_BASE_URL(.../models까지)로 바꾼다. */
function endpoint(): string {
  return (process.env.GEMINI_BASE_URL?.trim() || DEFAULT_ENDPOINT).replace(/\/+$/, "");
}

export type GeminiErrorCode = "NO_KEY" | "UPSTREAM" | "TIMEOUT" | "BAD_OUTPUT";

export class GeminiError extends Error {
  constructor(
    public code: GeminiErrorCode,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

interface GenerateJsonOptions<T extends z.ZodType> {
  system: string;
  user: string;
  schema: T;
  temperature?: number;
  timeoutMs?: number;
}

/** 검색 근거로 참고한 웹 출처 */
export interface GroundingSource {
  title: string;
  url: string;
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
    groundingMetadata?: {
      webSearchQueries?: string[];
      groundingChunks?: { web?: { uri?: string; title?: string } }[];
    };
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

type CallResult = { ok: true; data: GeminiResponse } | { ok: false; status: number; message: string };

/** Gemini가 거절하는 키(minItems/maxItems)는 빼고 보낸다. 개수 제한은 응답 후 zod가 검증한다. */
const UNSUPPORTED_KEYS = new Set(["$schema", "minItems", "maxItems"]);

function stripUnsupported(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripUnsupported);
  if (node && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>)
        .filter(([key]) => !UNSUPPORTED_KEYS.has(key))
        .map(([key, value]) => [key, stripUnsupported(value)]),
    );
  }
  return node;
}

function toResponseSchema(schema: z.ZodType) {
  return stripUnsupported(z.toJSONSchema(schema));
}

/** 환경변수의 API 키. 대시보드에 붙여넣다가 딸려 오기 쉬운 따옴표, 공백, 줄바꿈, "GEMINI_API_KEY=" 글자를 걷어낸다. */
function resolveKey(): string {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
    .replace(/^GEMINI_API_KEY\s*=\s*/, "")
    .replace(/^["']+|["']+$/g, "")
    .trim();
  if (!apiKey) {
    throw new GeminiError("NO_KEY", "서버에 GEMINI_API_KEY가 설정되지 않았습니다. .env.local을 확인해 주세요.", 500);
  }
  return apiKey;
}

async function callGemini(body: Record<string, unknown>, timeoutMs: number): Promise<CallResult> {
  const apiKey = resolveKey();
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  let res: Response;
  try {
    res = await fetch(`${endpoint()}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new GeminiError("TIMEOUT", "AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.", 504);
    }
    throw new GeminiError("UPSTREAM", "AI 서버에 연결하지 못했습니다.", 502);
  }

  const data = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok) return { ok: false, status: res.status, message: data.error?.message ?? res.statusText };
  return { ok: true, data };
}

/** 스키마 폴백으로 해결되지 않는 오류(키, 지역, 한도 등)를 사용자에게 알릴 오류로 바꾼다 */
function upstreamError(failure: { status: number; message: string }): GeminiError | null {
  // Gemini는 잘못된 API 키에도 400을 돌려준다
  if (failure.status === 401 || failure.status === 403 || /API key/i.test(failure.message)) {
    return new GeminiError(
      "UPSTREAM",
      "API 키가 올바르지 않거나 권한이 없습니다. 서버에 등록한 GEMINI_API_KEY 값에 따옴표, 공백, 'GEMINI_API_KEY=' 글자가 섞이지 않았는지 확인해 주세요.",
      502,
    );
  }
  // 서버가 실행되는 지역이 Gemini 지원 지역이 아닌 경우 (Cloudflare Worker의 실행 위치가 원인일 수 있다)
  if (/location is not supported/i.test(failure.message)) {
    return new GeminiError(
      "UPSTREAM",
      "AI 서비스(Gemini)가 서버가 실행되는 지역에서 지원되지 않습니다. 서버의 실행 지역 설정(placement)을 확인해 주세요.",
      502,
    );
  }
  return null;
}

function genericUpstreamError(failure: { status: number; message: string }): GeminiError {
  const hint =
    failure.status === 429
      ? "AI 사용량 한도를 초과했습니다. 잠시 후 다시 시도해 주세요."
      : `AI 서버 오류 (${failure.status}). ${failure.message.slice(0, 120)}`;
  return new GeminiError("UPSTREAM", hint, failure.status === 429 ? 429 : 502);
}

function extractText(data: GeminiResponse): string {
  if (data.promptFeedback?.blockReason) {
    throw new GeminiError("BAD_OUTPUT", "요청이 안전 정책에 의해 차단되었습니다. 입력 내용을 바꿔 보세요.", 422);
  }
  const candidate = data.candidates?.[0];
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw new GeminiError("BAD_OUTPUT", "AI 응답이 너무 길어 잘렸습니다. 여행 기간을 줄여 보세요.", 502);
  }
  return (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("");
}

/** 모델이 실제로 웹 검색을 실행했는지 (검색 도구를 켜도 모델이 검색하지 않고 기억으로 답할 수 있다) */
function didSearch(data: GeminiResponse): boolean {
  const gm = data.candidates?.[0]?.groundingMetadata;
  return (gm?.webSearchQueries?.length ?? 0) > 0 || (gm?.groundingChunks?.length ?? 0) > 0;
}

/** 검색 근거 응답에서 출처(제목, 링크)를 뽑는다. 같은 사이트는 한 번만 담는다. */
function extractSources(data: GeminiResponse): GroundingSource[] {
  const chunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const seen = new Set<string>();
  const sources: GroundingSource[] = [];
  for (const chunk of chunks) {
    const url = chunk.web?.uri;
    const title = chunk.web?.title?.trim() || url;
    if (!url || !title || seen.has(title)) continue;
    seen.add(title);
    sources.push({ title, url });
  }
  return sources.slice(0, 12);
}

/**
 * Gemini에 JSON 응답을 요청하고 zod로 검증한다.
 * 형식이 어긋나면 1회 재시도하며, 구조화 출력(responseJsonSchema)이 거절되면 스키마 없이 재시도한다.
 */
export async function generateJson<T extends z.ZodType>({
  system,
  user,
  schema,
  temperature = 0.7,
  timeoutMs = 90_000,
}: GenerateJsonOptions<T>): Promise<z.output<T>> {
  resolveKey();

  let useSchema = true;
  let lastProblem = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const generationConfig: Record<string, unknown> = {
      responseMimeType: "application/json",
      temperature,
      maxOutputTokens: 32768,
    };
    if (useSchema) generationConfig.responseJsonSchema = toResponseSchema(schema);

    const retryNote = lastProblem
      ? `\n\n[이전 응답 문제] ${lastProblem}\n문제를 고쳐서 지정된 스키마의 JSON만 다시 출력하세요.`
      : "";

    const result = await callGemini(
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user + retryNote }] }],
        generationConfig,
      },
      timeoutMs,
    );

    if (!result.ok) {
      const special = upstreamError(result);
      if (special) throw special;
      if (result.status === 400 && useSchema) {
        console.error(`[gemini] 구조화 출력 스키마 거절(400): ${result.message}`);
        useSchema = false; // 구조화 출력 스키마가 거절된 경우: 프롬프트 + zod 검증만으로 재시도
        lastProblem = "";
        attempt--; // 스키마 폴백은 재시도 횟수에 포함하지 않는다
        continue;
      }
      throw genericUpstreamError(result);
    }

    const text = extractText(result.data);
    try {
      const parsed = schema.safeParse(JSON.parse(text));
      if (parsed.success) return parsed.data;
      lastProblem = parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
    } catch {
      lastProblem = "유효한 JSON이 아닙니다.";
    }
    console.error(`[gemini] 응답 검증 실패 (시도 ${attempt + 1}, 스키마 ${useSchema ? "사용" : "미사용"}): ${lastProblem}\n${text.slice(0, 400)}`);
  }

  throw new GeminiError("BAD_OUTPUT", "AI 응답을 해석하지 못했습니다. 다시 시도해 주세요.", 502);
}

/**
 * Google 검색으로 자유롭게 조사한 결과(텍스트)와 참고한 출처를 돌려준다.
 * JSON 출력을 강제하면 모델이 검색을 건너뛰는 경향이 있어, 조사는 자유 서술로 하고
 * 구조화는 별도 호출(generateJson)로 한다. 검색을 실행하지 않으면 한 번 더 요청한다.
 */
export async function generateGroundedText({
  user,
  temperature = 0.2,
  timeoutMs = 100_000,
}: {
  user: string;
  temperature?: number;
  timeoutMs?: number;
}): Promise<{ text: string; sources: GroundingSource[]; searched: boolean }> {
  resolveKey();
  let last: { text: string; sources: GroundingSource[]; searched: boolean } | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt =
      attempt === 0
        ? user
        : `${user}\n\n[이전 응답 문제] Google 검색을 실행하지 않았습니다. 반드시 Google 검색 도구를 여러 번 사용해 확인한 뒤 답하세요.`;

    const result = await callGemini(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: { temperature, maxOutputTokens: 32768 },
      },
      timeoutMs,
    );

    if (!result.ok) throw upstreamError(result) ?? genericUpstreamError(result);

    const text = extractText(result.data);
    last = { text, sources: extractSources(result.data), searched: didSearch(result.data) };
    if (last.searched && text.trim() !== "") return last;
    console.error(`[gemini] 검색 조사 응답에 검색 근거가 없음 (시도 ${attempt + 1})`);
  }

  if (!last || last.text.trim() === "") {
    throw new GeminiError("BAD_OUTPUT", "검색 조사 결과를 받지 못했습니다. 다시 시도해 주세요.", 502);
  }
  return last;
}
