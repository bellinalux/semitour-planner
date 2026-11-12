import { z } from "zod";
import { ANTI_REPEAT_NOTE, beforeRepeat, isRunaway, repeatedRun } from "@/lib/aiRepeat";
import { recordServerEvent } from "@/lib/server/errorLog";
import {
  cfAi, cloudflareChat, coolingDown, groqChat, groqKey, markFailure, noteProviderUsed, PROVIDER_LABEL, providerOrder,
  type ChatMessage, type ProviderId,
} from "@/lib/server/aiProviders";

const DEFAULT_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
/**
 * 기본 모델 — 무료 키에서 하루 한도가 가장 넉넉한 Flash-Lite 최신판(별칭).
 * 바꾸려면 환경변수 GEMINI_MODEL (예: gemini-3.8-flash).
 */
const DEFAULT_MODEL = "gemini-flash-lite-latest";

/** 기본은 구글 주소. Cloudflare AI Gateway 같은 중계 주소를 쓰려면 GEMINI_BASE_URL(.../models까지)로 바꾼다. */
export function endpoint(): string {
  return (process.env.GEMINI_BASE_URL?.trim() || DEFAULT_ENDPOINT).replace(/\/+$/, "");
}

/** 지금 쓰는 모델 이름 (환경변수 GEMINI_MODEL > 기본값) */
export function modelName(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

export type GeminiErrorCode = "NO_KEY" | "UPSTREAM" | "TIMEOUT" | "BAD_OUTPUT";

export class GeminiError extends Error {
  constructor(
    public code: GeminiErrorCode,
    message: string,
    public status: number,
    /** AI 업체가 실제로 돌려준 HTTP 상태 (쿨다운 판단용, 모르면 status와 같다) */
    public providerStatus: number = status,
  ) {
    super(message);
  }
}

/** 텍스트 외에 함께 보낼 파일 파트 (이미지·PDF). 업로드한 코스표를 읽힐 때처럼 멀티모달 입력이 필요할 때 쓴다. */
export interface InlineFilePart {
  mimeType: string;
  /** base64로 인코딩한 파일 내용 */
  data: string;
}

interface GenerateJsonOptions<T extends z.ZodType> {
  system: string;
  user: string;
  schema: T;
  temperature?: number;
  timeoutMs?: number;
  /** user 텍스트와 함께 보낼 파일 (사진·PDF 등) */
  files?: InlineFilePart[];
  /** 빠른 모드: AI의 생각 단계를 줄인다(thinkingLevel low). 조사 메모 정리처럼 단순한 작업에 쓴다 */
  fast?: boolean;
}

/**
 * 빠른 모드 — 시세·요금 조회처럼 결과가 짧은 작업은 AI가 오래 "생각"할 필요가 없다.
 * 같은 검색 조사가 37초 → 8초로 줄었다(2026-10-07 측정, 생각 단계 low + 짧은 메모).
 * 모델이 생각 단계 설정을 받지 않으면(400) 한 번 알아 두고 그 뒤로는 설정 없이 보낸다.
 */
let thinkingUnsupported = false;
const FAST_MEMO_NOTE = "\n\n[메모 형식] 항목마다 1~2줄로 짧게, 금액·조건·확인한 사이트 이름 위주로 적으세요. 인사말·배경 설명은 쓰지 마세요.";

function withThinking(generationConfig: Record<string, unknown>, fast: boolean): Record<string, unknown> {
  return fast && !thinkingUnsupported ? { ...generationConfig, thinkingConfig: { thinkingLevel: "low" } } : generationConfig;
}

/** 생각 단계 설정이 거절되면 설정을 빼고 한 번 더 보낸다 */
async function callWithThinkingFallback(body: Record<string, unknown>, timeoutMs: number): Promise<CallResult> {
  const result = await callGemini(body, timeoutMs);
  const config = body.generationConfig as Record<string, unknown> | undefined;
  if (!result.ok && result.status === 400 && config?.thinkingConfig && /thinking/i.test(result.message)) {
    thinkingUnsupported = true;
    const { thinkingConfig: _drop, ...rest } = config;
    void _drop;
    return callGemini({ ...body, generationConfig: rest }, timeoutMs);
  }
  return result;
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
export function resolveKey(): string {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
    .replace(/^GEMINI_API_KEY\s*=\s*/, "")
    .replace(/^["']+|["']+$/g, "")
    .trim();
  if (!apiKey) {
    throw new GeminiError("NO_KEY", "서버에 GEMINI_API_KEY가 설정되지 않았습니다. .env.local을 확인해 주세요.", 500);
  }
  return apiKey;
}

/**
 * Gemini가 붐빔(503 "high demand")·일시 오류(500)를 내면 잠깐 기다렸다 한 번 더 보낸다.
 * 대개 몇 초 안에 풀리므로, 대체 AI로 넘기거나 오류를 보이기 전에 한 번은 다시 시도한다.
 */
export const GEMINI_BUSY_RETRY_MS = 2_000;
/** 기본 모델이 붐빌 때 한 번 더 시도할 다른 Gemini 모델 (GEMINI_FALLBACK_MODEL, "off"면 쓰지 않음) */
export function fallbackModelName(): string | null {
  const v = process.env.GEMINI_FALLBACK_MODEL?.trim();
  if (v === "off") return null;
  const alt = v || (/lite/i.test(modelName()) ? "gemini-flash-latest" : "gemini-flash-lite-latest");
  return alt === modelName() ? null : alt;
}

const busy = (r: CallResult) => !r.ok && (r.status === 503 || r.status === 500);

async function callGemini(body: Record<string, unknown>, timeoutMs: number): Promise<CallResult> {
  const first = await callGeminiOnce(body, timeoutMs);
  if (!busy(first)) return first;
  console.error(`[gemini] ${!first.ok ? first.status : ""} — ${GEMINI_BUSY_RETRY_MS}ms 뒤 한 번 더`);
  await new Promise((r) => setTimeout(r, GEMINI_BUSY_RETRY_MS));
  const second = await callGeminiOnce(body, timeoutMs);
  if (!busy(second)) return second;
  // 같은 모델이 계속 붐비면 다른 Gemini 모델로 한 번 (모델마다 붐비는 정도가 다르다)
  const alt = fallbackModelName();
  if (!alt) return second;
  console.error(`[gemini] 계속 붐빔 → 다른 모델(${alt})로 한 번 더`);
  return callGeminiOnce(body, timeoutMs, alt);
}

async function callGeminiOnce(body: Record<string, unknown>, timeoutMs: number, modelOverride?: string): Promise<CallResult> {
  const apiKey = resolveKey();
  const model = modelOverride || modelName();

  let res: Response;
  const __t0 = performance.now();
  try {
    res = await fetch(`${endpoint()}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new GeminiError("TIMEOUT", "Gemini 응답 시간이 초과되었습니다.", 504);
    }
    throw new GeminiError("UPSTREAM", "Gemini 서버에 연결하지 못했습니다.", 502);
  }

  const data = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (process.env.GEMINI_TIMING === "1") {
    const u = (data as { usageMetadata?: Record<string, number> }).usageMetadata ?? {};
    console.log(`[gemini-timing] ${Math.round(performance.now() - __t0)}ms search=${Boolean((body as { tools?: unknown }).tools)} think=${u.thoughtsTokenCount ?? 0} out=${u.candidatesTokenCount ?? 0} in=${u.promptTokenCount ?? 0}`);
  }
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
      401,
    );
  }
  // 서버가 실행되는 지역이 Gemini 지원 지역이 아닌 경우 (Cloudflare Worker의 실행 위치가 원인일 수 있다)
  if (/location is not supported/i.test(failure.message)) {
    return new GeminiError(
      "UPSTREAM",
      "AI 서비스(Gemini)가 서버가 실행되는 지역에서 지원되지 않습니다. 서버의 실행 지역 설정(placement)을 확인해 주세요.",
      502,
      403,
    );
  }
  return null;
}

function genericUpstreamError(failure: { status: number; message: string }): GeminiError {
  const credits = failure.status === 402 || /prepayment|credits? (are )?depleted|billing/i.test(failure.message);
  const hint = credits
    ? "Gemini 선불 크레딧이 소진되었습니다. AI Studio에서 충전하거나 무료 키로 바꿔 주세요."
    : failure.status === 429
      ? "Gemini 사용량 한도를 초과했습니다."
      : failure.status === 503
        ? "Gemini 서버가 붐벼 응답하지 못했습니다(일시적). 잠시 뒤 다시 시도해 주세요."
      : `Gemini 서버 오류 (${failure.status}). ${failure.message.slice(0, 120)}`;
  return new GeminiError("UPSTREAM", hint, failure.status === 429 ? 429 : 502, credits ? 402 : failure.status);
}

/** 응답 글 + 길이 제한에 잘렸는지. 잘림은 여기서 오류로 만들지 않고 부르는 쪽이 판단한다(되풀이면 다시 받기) */
function readCandidate(data: GeminiResponse): { text: string; truncated: boolean } {
  if (data.promptFeedback?.blockReason) {
    throw new GeminiError("BAD_OUTPUT", "요청이 안전 정책에 의해 차단되었습니다. 입력 내용을 바꿔 보세요.", 422);
  }
  const candidate = data.candidates?.[0];
  return { text: (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join(""), truncated: candidate?.finishReason === "MAX_TOKENS" };
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
async function geminiJson<T extends z.ZodType>({
  system,
  user,
  schema,
  temperature = 0.7,
  timeoutMs = 90_000,
  files = [],
  fast = false,
}: GenerateJsonOptions<T>): Promise<z.output<T>> {
  resolveKey();
  const fileParts = files.map((f) => ({ inlineData: { mimeType: f.mimeType, data: f.data } }));

  let useSchema = true;
  let lastProblem = "";
  let temp = temperature;
  let lastTruncated = false;

  for (let attempt = 0; attempt < 2; attempt++) {
    const generationConfig: Record<string, unknown> = {
      responseMimeType: "application/json",
      temperature: temp,
      maxOutputTokens: 32768,
    };
    if (useSchema) generationConfig.responseJsonSchema = toResponseSchema(schema);

    const retryNote = lastProblem
      ? `\n\n[이전 응답 문제] ${lastProblem}\n문제를 고쳐서 지정된 스키마의 JSON만 다시 출력하세요.`
      : "";

    const result = await callWithThinkingFallback(
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user + retryNote }, ...fileParts] }],
        generationConfig: withThinking(generationConfig, fast),
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

    const { text, truncated } = readCandidate(result.data);
    lastTruncated = truncated;
    // 같은 글을 끝없이 되풀이하다 잘린 응답 → 온도를 낮추고 되풀이 금지 안내를 붙여 한 번 더
    if (isRunaway(text, truncated)) {
      lastProblem = ANTI_REPEAT_NOTE;
      temp = Math.min(temp, 0.3);
      console.error(`[gemini] 같은 글 되풀이 (시도 ${attempt + 1}, 되풀이 ${repeatedRun(text)}자, 잘림 ${truncated})`);
      void recordServerEvent("ai", `AI 응답 되풀이 (시도 ${attempt + 1}${truncated ? ", 길이 제한에 잘림" : ""})`, text.slice(-300));
      continue;
    }
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

  throw new GeminiError(
    "BAD_OUTPUT",
    lastTruncated ? "AI 응답이 같은 내용을 되풀이하다 잘렸습니다. 다시 시도해 주세요(계속되면 기간이나 요청을 줄여 보세요)." : "AI 응답을 해석하지 못했습니다. 다시 시도해 주세요.",
    502,
  );
}

/**
 * Google 검색으로 자유롭게 조사한 결과(텍스트)와 참고한 출처를 돌려준다.
 * JSON 출력을 강제하면 모델이 검색을 건너뛰는 경향이 있어, 조사는 자유 서술로 하고
 * 구조화는 별도 호출(generateJson)로 한다. 검색을 실행하지 않으면 한 번 더 요청한다.
 */
async function geminiGrounded({
  user,
  temperature = 0.2,
  timeoutMs = 100_000,
  fast = false,
}: {
  user: string;
  temperature?: number;
  timeoutMs?: number;
  /** 빠른 모드: 생각 단계 low + 짧은 메모 (시세·요금 조회용) */
  fast?: boolean;
}): Promise<{ text: string; sources: GroundingSource[]; searched: boolean }> {
  resolveKey();
  let last: { text: string; sources: GroundingSource[]; searched: boolean } | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt =
      attempt === 0
        ? user + (fast ? FAST_MEMO_NOTE : "")
        : `${user}${fast ? FAST_MEMO_NOTE : ""}\n\n[이전 응답 문제] Google 검색을 실행하지 않았습니다. 반드시 Google 검색 도구를 여러 번 사용해 확인한 뒤 답하세요.`;

    const result = await callWithThinkingFallback(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: withThinking({ temperature, maxOutputTokens: 32768 }, fast),
      },
      timeoutMs,
    );

    if (!result.ok) throw upstreamError(result) ?? genericUpstreamError(result);

    const { text: raw, truncated } = readCandidate(result.data);
    // 조사 글이 되풀이에 빠졌으면 되풀이 앞까지만 쓴다(조사 내용은 앞부분에 있다)
    const text = isRunaway(raw, truncated) ? beforeRepeat(raw) : raw;
    if (text !== raw) void recordServerEvent("ai", "AI 검색 조사 응답 되풀이 — 앞부분만 사용", raw.slice(-300));
    last = { text, sources: extractSources(result.data), searched: didSearch(result.data) };
    if (last.searched && text.trim() !== "") return last;
    console.error(`[gemini] 검색 조사 응답에 검색 근거가 없음 (시도 ${attempt + 1})`);
  }

  if (!last || last.text.trim() === "") {
    throw new GeminiError("BAD_OUTPUT", "검색 조사 결과를 받지 못했습니다. 다시 시도해 주세요.", 502);
  }
  return last;
}

// ── 대체 AI로 이어 받기 (lib/server/aiProviders.ts) ──────────────────────

type JsonOptions<T extends z.ZodType> = GenerateJsonOptions<T>;

/** 다음 업체로 넘어가도 되는 실패인가 (응답 형식 문제·안전 차단은 Gemini에서는 넘기지 않는다) */
function switchable(err: unknown, provider: ProviderId): err is GeminiError {
  if (!(err instanceof GeminiError)) return false;
  if (err.code === "BAD_OUTPUT") return provider !== "gemini" && err.status !== 422;
  return true;
}

async function available(p: ProviderId): Promise<boolean> {
  if (p === "gemini") return !!process.env.GEMINI_API_KEY?.trim();
  if (p === "groq") return !!groqKey();
  return (await cfAi()) !== null;
}

/** 코드블록 울타리(```json)를 걷어낸다 */
function stripFence(text: string): string {
  const t = text.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return m ? m[1] : t;
}

/** Groq·Cloudflare로 JSON 받기 — 스키마를 프롬프트에도 적고, zod로 검증하고, 한 번 고쳐 받는다 */
async function chatJson<T extends z.ZodType>(provider: Exclude<ProviderId, "gemini">, o: JsonOptions<T>): Promise<z.output<T>> {
  const files = o.files ?? [];
  if (files.some((f) => !f.mimeType.startsWith("image/"))) {
    throw new GeminiError("UPSTREAM", "PDF·문서 파일은 Gemini만 읽을 수 있습니다(사진으로 올리면 대체 AI도 읽습니다).", 502, 415);
  }
  const jsonSchema = stripUnsupported(z.toJSONSchema(o.schema)) as Record<string, unknown>;
  const system = `${o.system}\n\n[출력 형식] 아래 JSON 스키마에 맞는 JSON 객체 하나만 출력하세요. 설명이나 코드블록(\`\`\`)은 쓰지 마세요.\n${JSON.stringify(jsonSchema)}`;
  const call = provider === "groq" ? groqChat : cloudflareChat;
  let lastProblem = "";
  let temp = o.temperature ?? 0.7;
  for (let attempt = 0; attempt < 2; attempt++) {
    const userText = o.user + (lastProblem ? `\n\n[이전 응답 문제] ${lastProblem}\n문제를 고쳐서 지정된 스키마의 JSON만 다시 출력하세요.` : "");
    const content: ChatMessage["content"] = files.length
      ? [{ type: "text", text: userText }, ...files.map((f) => ({ type: "image_url" as const, image_url: { url: `data:${f.mimeType};base64,${f.data}` } }))]
      : userText;
    const r = await call({ messages: [{ role: "system", content: system }, { role: "user", content }], jsonSchema, temperature: temp, timeoutMs: o.timeoutMs ?? 90_000, vision: files.length > 0 });
    if (!r.ok) throw new GeminiError("UPSTREAM", `${PROVIDER_LABEL[provider]} 오류 (${r.status || "-"}) ${r.message.slice(0, 120)}`, r.status === 429 ? 429 : 502, r.status);
    if (isRunaway(r.text, r.truncated)) {
      lastProblem = ANTI_REPEAT_NOTE;
      temp = Math.min(temp, 0.3);
      continue;
    }
    try {
      const parsed = o.schema.safeParse(JSON.parse(stripFence(r.text)));
      if (parsed.success) return parsed.data;
      lastProblem = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch {
      lastProblem = "유효한 JSON이 아닙니다.";
    }
    console.error(`[${provider}] 응답 검증 실패 (시도 ${attempt + 1}): ${lastProblem}\n${r.text.slice(0, 300)}`);
  }
  throw new GeminiError("BAD_OUTPUT", `${PROVIDER_LABEL[provider]} 응답을 해석하지 못했습니다.`, 502);
}

/** Groq(웹 검색 포함 모델)·Cloudflare(검색 없음)로 조사 글 받기 */
async function chatGrounded(provider: Exclude<ProviderId, "gemini">, o: { user: string; temperature: number; timeoutMs: number; fast: boolean }) {
  const memo = o.fast ? FAST_MEMO_NOTE : "";
  if (provider === "cloudflare") {
    const r = await cloudflareChat({
      messages: [{ role: "user", content: `${o.user}${memo}\n\n[주의] 지금은 웹 검색을 할 수 없습니다. 아는 범위에서만 답하고, 확실하지 않은 금액·시간·운영 정보는 "추정"이라고 밝히세요.` }],
      temperature: o.temperature,
      timeoutMs: o.timeoutMs,
    });
    if (!r.ok) throw new GeminiError("UPSTREAM", `Cloudflare AI 오류 (${r.status || "-"}) ${r.message.slice(0, 120)}`, r.status === 429 ? 429 : 502, r.status);
    if (!r.text.trim()) throw new GeminiError("BAD_OUTPUT", "Cloudflare AI가 빈 답을 보냈습니다.", 502);
    return { text: r.text, sources: [], searched: false };
  }
  let last: { text: string; sources: GroundingSource[]; searched: boolean } | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = `${o.user}${memo}${attempt ? "\n\n[이전 응답 문제] 웹 검색을 하지 않았습니다. 반드시 웹 검색으로 확인한 뒤 답하세요." : ""}`;
    const r = await groqChat({ messages: [{ role: "user", content: prompt }], temperature: o.temperature, timeoutMs: o.timeoutMs, search: true });
    if (!r.ok) throw new GeminiError("UPSTREAM", `Groq 오류 (${r.status || "-"}) ${r.message.slice(0, 120)}`, r.status === 429 ? 429 : 502, r.status);
    const text = isRunaway(r.text, r.truncated) ? beforeRepeat(r.text) : r.text;
    last = { text, sources: r.sources, searched: r.searched };
    if (last.searched && text.trim()) return last;
  }
  if (!last || !last.text.trim()) throw new GeminiError("BAD_OUTPUT", "Groq 검색 조사 결과를 받지 못했습니다.", 502);
  return last;
}

/**
 * 업체 순서(AI_PROVIDERS)대로 시도한다. 한도·크레딧·장애로 실패한 업체는 잠시 쉬게 하고 다음 업체로 넘긴다.
 * 모두 실패하면 업체별 이유를 모은 오류를 던진다.
 */
async function withProviders<R>(run: (p: ProviderId) => Promise<R>): Promise<R> {
  const reasons: string[] = [];
  let lastErr: GeminiError | null = null;
  let tried = 0;
  const order = providerOrder();
  const ready = new Set<ProviderId>();
  for (const p of order) if (await available(p)) ready.add(p);
  // 쓸 수 있는 업체가 모두 쉬는 중이면 쉬는 것을 무시하고 시도한다 (대체 업체가 없을 때 계속 실패만 내지 않게)
  const ignoreCooldown = [...ready].every((p) => coolingDown(p));
  for (const p of order) {
    if (!ready.has(p)) {
      reasons.push(`${PROVIDER_LABEL[p]}: ${p === "cloudflare" ? "연결 없음" : "키 미등록"}`);
      continue;
    }
    if (!ignoreCooldown && coolingDown(p)) {
      reasons.push(`${PROVIDER_LABEL[p]}: 잠시 쉬는 중 (최근 한도·오류)`);
      continue;
    }
    tried++;
    try {
      const out = await run(p);
      const why = reasons.filter((r) => !/키 미등록|연결 없음/.test(r));
      noteProviderUsed(p, p === "gemini" ? undefined : why.join(" / ") || undefined);
      return out;
    } catch (err) {
      if (!switchable(err, p)) throw err;
      lastErr = err;
      markFailure(p, err.providerStatus, err.message);
      reasons.push(`${PROVIDER_LABEL[p]}: ${err.message}`);
      void recordServerEvent("ai", `${PROVIDER_LABEL[p]} 실패 → 다음 AI로 넘김`, err.message);
    }
  }
  if (tried === 0 && !lastErr) {
    const allMissing = reasons.every((r) => /키 미등록|연결 없음/.test(r));
    if (allMissing) throw new GeminiError("NO_KEY", "서버에 쓸 수 있는 AI 키가 없습니다. GEMINI_API_KEY(또는 GROQ_API_KEY)를 등록해 주세요.", 500);
  }
  const msg = `지금 쓸 수 있는 AI가 없습니다. ${reasons.join(" · ")}`.slice(0, 400);
  throw new GeminiError("UPSTREAM", msg, lastErr?.status === 429 || reasons.some((r) => /쉬는 중/.test(r)) ? 429 : 502);
}

/**
 * JSON 응답을 요청하고 zod로 검증한다. Gemini가 안 되면 Groq → Cloudflare 순으로 이어 받는다(AI_PROVIDERS).
 * Gemini에서는 형식이 어긋나면 1회 재시도하며, 구조화 출력이 거절되면 스키마 없이 재시도한다.
 */
export async function generateJson<T extends z.ZodType>(o: JsonOptions<T>): Promise<z.output<T>> {
  return withProviders((p) => (p === "gemini" ? geminiJson(o) : chatJson(p, o)));
}

/**
 * 웹 검색으로 자유롭게 조사한 결과(텍스트)와 참고한 출처를 돌려준다.
 * Gemini(Google 검색) → Groq(compound 웹 검색) → Cloudflare(검색 없음, searched=false) 순으로 이어 받는다.
 */
export async function generateGroundedText(o: {
  user: string;
  temperature?: number;
  timeoutMs?: number;
  /** 빠른 모드: 생각 단계 low + 짧은 메모 (시세·요금 조회용) */
  fast?: boolean;
}): Promise<{ text: string; sources: GroundingSource[]; searched: boolean }> {
  const opts = { user: o.user, temperature: o.temperature ?? 0.2, timeoutMs: o.timeoutMs ?? 100_000, fast: o.fast ?? false };
  return withProviders((p) => (p === "gemini" ? geminiGrounded(opts) : chatGrounded(p, opts)));
}
